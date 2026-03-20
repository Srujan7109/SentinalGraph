"""
backend-python/ai_brain.py
SentinelGraph MVP – AI Graph Brain / GNN Message Passing

Responsibilities
────────────────
1. Connect to Neo4j (async driver).
2. propagate_risk()  — iterative message passing from seed accounts:
       neighbour_risk  +=  sender_risk × 0.5   (two hops)
3. build_forensics_payload()  — full graph + risk alerts for /api/forensics
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from neo4j import AsyncGraphDatabase, AsyncDriver

log = logging.getLogger("sentinelgraph.ai_brain")

# ── Config ─────────────────────────────────────────────────────────────────
NEO4J_URI      = "bolt://localhost:7687"
NEO4J_USER     = "neo4j"
NEO4J_PASSWORD = "neo4jpassword"

SEED_RISK        = 0.9     # initial risk score for rule-flagged accounts
PROPAGATION      = 0.5     # fraction of sender risk absorbed by neighbour
MAX_RISK         = 1.0
ALERT_THRESHOLD  = 0.3     # minimum score to appear in alerts
HOPS             = 2

_driver: AsyncDriver | None = None


# ── Lifecycle ──────────────────────────────────────────────────────────────

async def initialize() -> None:
    global _driver
    _driver = AsyncGraphDatabase.driver(
        NEO4J_URI,
        auth=(NEO4J_USER, NEO4J_PASSWORD),
        max_connection_pool_size=10,
    )
    await _driver.verify_connectivity()
    log.info("Neo4j async driver ready at %s", NEO4J_URI)


async def close() -> None:
    global _driver
    if _driver:
        await _driver.close()
        _driver = None


def _driver_or_raise() -> AsyncDriver:
    if _driver is None:
        raise RuntimeError("Call initialize() before using ai_brain")
    return _driver


# ── Cypher queries ─────────────────────────────────────────────────────────

_NEIGHBOURS_Q = """
MATCH (:Account {id: $id})-[:TRANSFERRED_TO]->(n:Account)
RETURN n.id AS id
"""

_ALL_ACCOUNTS_Q = "MATCH (a:Account) RETURN a.id AS id"
_ALL_DEVICES_Q  = "MATCH (d:Device)  RETURN d.id AS id"

_ALL_EDGES_Q = """
MATCH (a:Account)-[r:TRANSFERRED_TO]->(b:Account)
RETURN a.id AS source, b.id AS target, r.amount AS weight
UNION ALL
MATCH (a:Account)-[:USED_DEVICE]->(d:Device)
RETURN a.id AS source, d.id AS target, 1.0 AS weight
"""

_DEGREE_Q = """
MATCH (a:Account)
OPTIONAL MATCH (a)-[:TRANSFERRED_TO]->(out_n)
OPTIONAL MATCH (in_n)-[:TRANSFERRED_TO]->(a)
WITH a.id AS id,
     count(DISTINCT out_n) AS out_deg,
     count(DISTINCT in_n)  AS in_deg
RETURN id, in_deg, out_deg
"""


# ── GNN Message Passing ────────────────────────────────────────────────────

async def propagate_risk(
    transactions: list[dict[str, Any]],
    seed_accounts: list[str],
) -> list[str]:
    """
    Propagates risk from seed_accounts through the Neo4j graph.

    Returns all accounts whose risk score exceeds ALERT_THRESHOLD.
    """
    if not seed_accounts:
        return []

    risk: dict[str, float] = defaultdict(float)
    for acct in seed_accounts:
        risk[acct] = SEED_RISK

    d = _driver_or_raise()

    for hop in range(HOPS):
        seeds = [a for a, s in risk.items() if s > ALERT_THRESHOLD]
        if not seeds:
            break

        contributions: dict[str, float] = defaultdict(float)
        async with d.session() as session:
            for acct_id in seeds:
                result = await session.run(_NEIGHBOURS_Q, id=acct_id)
                neighbours = [r["id"] async for r in result]
                share = risk[acct_id] * PROPAGATION
                for nb in neighbours:
                    contributions[nb] += share

        for acct, contribution in contributions.items():
            risk[acct] = min(MAX_RISK, risk[acct] + contribution)

        log.info("Hop %d/%d — %d accounts above threshold",
                 hop + 1, HOPS, sum(1 for v in risk.values() if v > ALERT_THRESHOLD))

    flagged = [a for a, s in risk.items() if s > ALERT_THRESHOLD]
    log.info("Propagation done — %d accounts flagged", len(flagged))
    return flagged


# ── Forensics Payload ──────────────────────────────────────────────────────

async def build_forensics_payload() -> dict[str, Any]:
    """
    Returns the exact structure defined in the Data Contracts:

    {
      "network_map": {
        "nodes": [{"id": "ACC_1", "group": "account"}, ...],
        "edges": [{"source": "ACC_1", "target": "ACC_2", "weight": 500}]
      },
      "alerts": [
        {"account_id": "MULE_0001", "risk_score": 0.9, "status": "CRITICAL"},
        ...
      ]
    }
    """
    d = _driver_or_raise()
    nodes: list[dict] = []
    edges: list[dict] = []

    async with d.session() as session:
        async for r in await session.run(_ALL_ACCOUNTS_Q):
            nodes.append({"id": r["id"], "group": "account"})
        async for r in await session.run(_ALL_DEVICES_Q):
            nodes.append({"id": r["id"], "group": "device"})
        async for r in await session.run(_ALL_EDGES_Q):
            edges.append({
                "source": r["source"],
                "target": r["target"],
                "weight": float(r["weight"]) if r["weight"] is not None else 1.0,
            })

    risk_map = await _heuristic_risk(d)

    alerts = [
        {
            "account_id": acct,
            "risk_score": round(score, 4),
            "status":     _status(score),
        }
        for acct, score in sorted(risk_map.items(), key=lambda x: -x[1])
        if score >= ALERT_THRESHOLD
    ]

    log.info("Forensics: %d nodes  %d edges  %d alerts",
             len(nodes), len(edges), len(alerts))

    return {"network_map": {"nodes": nodes, "edges": edges}, "alerts": alerts}


async def _heuristic_risk(d: AsyncDriver) -> dict[str, float]:
    """
    Lightweight structural heuristic:
      accounts with high in-AND-out degree relative to each other
      are likely mules.
    """
    risk: dict[str, float] = {}
    async with d.session() as session:
        async for r in await session.run(_DEGREE_Q):
            acct_id = r["id"]
            i, o    = r["in_deg"], r["out_deg"]
            if i > 0 and o > 0:
                ratio       = min(o / (i + o), 1.0)
                risk[acct_id] = round(min(MAX_RISK, ratio * 0.95), 4)
            elif i > 5:
                risk[acct_id] = 0.4
            else:
                risk[acct_id] = 0.0
    return risk


def _status(score: float) -> str:
    if score >= 0.8: return "CRITICAL"
    if score >= 0.5: return "HIGH"
    if score >= 0.3: return "MEDIUM"
    return "LOW"