/**
 * backend-node/services/postgresService.js
 * SentinelGraph MVP – PostgreSQL Relational Storage
 *
 * Table: transactions
 *   tx_id (UUID PK), sender_id (VARCHAR), receiver_id (VARCHAR),
 *   amount (DECIMAL), timestamp (TIMESTAMP), device_id (VARCHAR)
 */

"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  host:                    process.env.PG_HOST     || "localhost",
  port:               parseInt(process.env.PG_PORT  || "5432", 10),
  database:                process.env.PG_DB       || "sentinelgraph",
  user:                    process.env.PG_USER      || "postgres",
  password:                process.env.PG_PASSWORD  || "postgres",
  max:                     10,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
});

pool.on("error", (err) => console.error("[POSTGRES] Pool error:", err.message));

// ── DDL ─────────────────────────────────────────────────────────────────────
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS transactions (
    tx_id       UUID                     PRIMARY KEY,
    sender_id   VARCHAR(64)              NOT NULL,
    receiver_id VARCHAR(64)              NOT NULL,
    amount      DECIMAL(18,2)            NOT NULL CHECK (amount > 0),
    timestamp   TIMESTAMPTZ              NOT NULL,
    device_id   VARCHAR(64)              NOT NULL,
    ingested_at TIMESTAMPTZ              NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_tx_sender   ON transactions(sender_id);
  CREATE INDEX IF NOT EXISTS idx_tx_receiver ON transactions(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_tx_device   ON transactions(device_id);
  CREATE INDEX IF NOT EXISTS idx_tx_ts       ON transactions(timestamp);
`;

// ── Public API ───────────────────────────────────────────────────────────────

async function initialize() {
  const c = await pool.connect();
  try {
    await c.query(INIT_SQL);
    console.log("[POSTGRES] Table 'transactions' ready");
  } finally {
    c.release();
  }
}

/**
 * Bulk-insert transactions. Duplicate tx_ids are silently skipped.
 * @param {Array<{tx_id,sender_id,receiver_id,amount,timestamp,device_id}>} transactions
 */
async function insertTransactions(transactions) {
  if (!transactions?.length) return;

  const COLS = 6;
  const placeholders = [];
  const params       = [];

  transactions.forEach((tx, i) => {
    const b = i * COLS;
    placeholders.push(
      `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`
    );
    params.push(
      tx.tx_id, tx.sender_id, tx.receiver_id,
      tx.amount, tx.timestamp, tx.device_id
    );
  });

  const sql = `
    INSERT INTO transactions
      (tx_id, sender_id, receiver_id, amount, timestamp, device_id)
    VALUES ${placeholders.join(",")}
    ON CONFLICT (tx_id) DO NOTHING
  `;

  const c = await pool.connect();
  try {
    const result = await c.query(sql, params);
    console.log(`[POSTGRES] Inserted ${result.rowCount}/${transactions.length} rows`);
  } finally {
    c.release();
  }
}

async function close() {
  await pool.end();
  console.log("[POSTGRES] Pool closed");
}

module.exports = { initialize, insertTransactions, close };