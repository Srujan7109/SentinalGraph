/**
 * backend-node/services/neo4jService.js
 * SentinelGraph MVP – Neo4j Graph Storage
 *
 * Graph schema
 * ─────────────────────────────────────────────
 * Nodes  : (:Account {id})   (:Device {id})
 * Edges  : (:Account)-[:TRANSFERRED_TO {amount, tx_id, timestamp}]->(:Account)
 *          (:Account)-[:USED_DEVICE]->(:Device)
 */

"use strict";

const neo4j = require("neo4j-driver");

const URI      = process.env.NEO4J_URI      || "bolt://localhost:7687";
const USER     = process.env.NEO4J_USER     || "neo4j";
const PASSWORD = process.env.NEO4J_PASSWORD || "neo4jpassword";

let driver;

// ── Cypher ──────────────────────────────────────────────────────────────────
const UPSERT_CYPHER = `
  MERGE  (s:Account  {id: $sender_id})
  MERGE  (r:Account  {id: $receiver_id})
  MERGE  (d:Device   {id: $device_id})
  CREATE (s)-[:TRANSFERRED_TO {
    tx_id:     $tx_id,
    amount:    $amount,
    timestamp: datetime($timestamp)
  }]->(r)
  MERGE (s)-[:USED_DEVICE]->(d)
`;

// ── Public API ───────────────────────────────────────────────────────────────

async function initialize() {
  driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD), {
    maxConnectionPoolSize:      20,
    connectionAcquisitionTimeout: 5_000,
  });
  await driver.verifyConnectivity();
  console.log("[NEO4J] Connected →", URI);

  const session = driver.session();
  try {
    await session.run(
      "CREATE CONSTRAINT account_id IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE"
    );
    await session.run(
      "CREATE CONSTRAINT device_id IF NOT EXISTS FOR (d:Device) REQUIRE d.id IS UNIQUE"
    );
    console.log("[NEO4J] Constraints verified");
  } catch (err) {
    console.warn("[NEO4J] Constraint warning (non-fatal):", err.message);
  } finally {
    await session.close();
  }
}

/**
 * Upserts all transactions into the graph.
 * Processes in chunks of 50 inside a single write transaction.
 */
async function upsertTransactions(transactions) {
  if (!transactions?.length) return;

  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    await session.writeTransaction(async (txc) => {
      const CHUNK = 50;
      for (let i = 0; i < transactions.length; i += CHUNK) {
        await Promise.all(
          transactions.slice(i, i + CHUNK).map((tx) =>
            txc.run(UPSERT_CYPHER, {
              tx_id:       tx.tx_id,
              sender_id:   tx.sender_id,
              receiver_id: tx.receiver_id,
              amount:      tx.amount,
              timestamp:   tx.timestamp,
              device_id:   tx.device_id,
            })
          )
        );
      }
    });
    console.log(`[NEO4J] Upserted ${transactions.length} transactions`);
  } finally {
    await session.close();
  }
}

async function close() {
  if (driver) {
    await driver.close();
    console.log("[NEO4J] Driver closed");
  }
}

module.exports = { initialize, upsertTransactions, close };