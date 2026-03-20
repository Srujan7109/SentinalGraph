"""
simulator/simulator.py
SentinelGraph MVP – Transaction Simulator

Generates 1,000 synthetic transactions:
  • 970 random P2P noise
  •  30 coordinated Mule Ring
        – 10 Victims each send $500 to one of 5 Mules     (10 txs)
        – each Mule forwards $480 to CASHOUT_BOSS          ( 5 txs)
        – 15 intra-mule cover transactions                 (15 txs)
All mule-layer transactions share ONE device_id (forensic fingerprint).

Posts the full batch to POST http://localhost:4000/api/ingest
"""

import asyncio
import logging
import random
import string
import sys
import uuid
from datetime import datetime, timedelta, timezone

import httpx

# ── Config ─────────────────────────────────────────────────────────────────
INGEST_URL        = "http://localhost:4000/api/ingest"
TOTAL_TXS         = 1000
MULE_TX_COUNT     = 30          # 3 %
NOISE_TX_COUNT    = TOTAL_TXS - MULE_TX_COUNT   # 970

NUM_VICTIMS       = 10
NUM_MULES         = 5
VICTIM_AMOUNT     = 500.00
MULE_FWD_AMOUNT   = 480.00

# Every mule-layer tx uses the same device — this is the network fingerprint
SHARED_DEVICE_ID  = "DEV_" + "".join(
    random.choices(string.ascii_uppercase + string.digits, k=6)
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("simulator")


# ── Helpers ────────────────────────────────────────────────────────────────

def _iso(offset_s: int = 0) -> str:
    """UTC ISO-8601 timestamp, optionally shifted by offset_s seconds."""
    t = datetime.now(timezone.utc) + timedelta(seconds=offset_s)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _make_tx(sender_id: str, receiver_id: str, amount: float,
             device_id: str, offset_s: int = 0) -> dict:
    return {
        "tx_id":       str(uuid.uuid4()),
        "sender_id":   sender_id,
        "receiver_id": receiver_id,
        "amount":      round(amount, 2),
        "timestamp":   _iso(offset_s),
        "device_id":   device_id,
    }


def _rand_acc() -> str:
    return f"ACC_{random.randint(1000, 8999):04d}"


def _rand_dev() -> str:
    return "DEV_" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


# ── Transaction builders ───────────────────────────────────────────────────

def build_noise() -> list[dict]:
    txs = []
    for _ in range(NOISE_TX_COUNT):
        s = _rand_acc()
        r = _rand_acc()
        while r == s:
            r = _rand_acc()
        txs.append(_make_tx(
            sender_id=s,
            receiver_id=r,
            amount=round(random.uniform(1.0, 2000.0), 2),
            device_id=_rand_dev(),
            offset_s=random.randint(-86400, 0),
        ))
    return txs


def build_mule_ring() -> list[dict]:
    victims  = [f"VICTIM_{i:04d}" for i in range(1, NUM_VICTIMS + 1)]
    mules    = [f"MULE_{i:04d}"   for i in range(1, NUM_MULES   + 1)]
    cashout  = "CASHOUT_BOSS_0001"
    base     = -3600          # ring happened ~1 hour ago
    txs: list[dict] = []

    # Phase 1 – Victims → Mules
    for i, victim in enumerate(victims):
        txs.append(_make_tx(
            sender_id=victim,
            receiver_id=mules[i % NUM_MULES],
            amount=VICTIM_AMOUNT,
            device_id=_rand_dev(),   # victims use their own devices
            offset_s=base + i * 55,
        ))

    # Phase 2 – Mules → Cashout Boss (shared device fingerprint)
    for i, mule in enumerate(mules):
        txs.append(_make_tx(
            sender_id=mule,
            receiver_id=cashout,
            amount=MULE_FWD_AMOUNT,
            device_id=SHARED_DEVICE_ID,
            offset_s=base + 700 + i * 40,
        ))

    # Phase 3 – Intra-mule cover noise (also use shared device)
    for i in range(15):
        s = random.choice(mules)
        r = random.choice([m for m in mules if m != s])
        txs.append(_make_tx(
            sender_id=s,
            receiver_id=r,
            amount=round(random.uniform(5.0, 60.0), 2),
            device_id=SHARED_DEVICE_ID,
            offset_s=base + 1500 + i * 25,
        ))

    log.info(
        "Mule ring built | victims=%d mules=%d cashout=%s shared_device=%s",
        NUM_VICTIMS, NUM_MULES, cashout, SHARED_DEVICE_ID,
    )
    return txs


def build_batch() -> dict:
    txs = build_noise() + build_mule_ring()
    random.shuffle(txs)
    batch = {"batch_id": str(uuid.uuid4()), "transactions": txs}
    log.info(
        "Batch ready | batch_id=%s  total=%d  (noise=%d  ring=%d)",
        batch["batch_id"], len(txs), NOISE_TX_COUNT, MULE_TX_COUNT,
    )
    return batch


# ── HTTP dispatch ──────────────────────────────────────────────────────────

async def post_batch(batch: dict) -> None:
    log.info("POSTing batch → %s", INGEST_URL)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
            res = await client.post(INGEST_URL, json=batch)
            res.raise_for_status()
            log.info("✅  Accepted  status=%s  body=%s", res.status_code, res.json())
    except httpx.ConnectError:
        log.error("❌  Cannot connect to %s — is backend-node running?", INGEST_URL)
        sys.exit(1)
    except httpx.HTTPStatusError as exc:
        log.error("❌  HTTP %s: %s", exc.response.status_code, exc.response.text)
        sys.exit(1)


async def main() -> None:
    log.info("=== SentinelGraph Simulator starting ===")
    await post_batch(build_batch())
    log.info("=== Done ===")


if __name__ == "__main__":
    asyncio.run(main())