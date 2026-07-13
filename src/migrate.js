// src/migrate.js
// Idempotent schema setup (safe to run on every boot — uses IF NOT EXISTS).
'use strict';
const { db } = require('./db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  handle         TEXT NOT NULL,           -- display form, e.g. "@player"
  normalized     TEXT NOT NULL UNIQUE,    -- lowercase, no leading @ — the dedupe key
  proof_url      TEXT NOT NULL,
  verified       INTEGER NOT NULL DEFAULT 0,   -- 0/1 boolean
  task_follow    INTEGER NOT NULL DEFAULT 0,
  task_like      INTEGER NOT NULL DEFAULT 0,
  task_quote     INTEGER NOT NULL DEFAULT 0,
  fighter        TEXT,
  opponent       TEXT,
  reward         TEXT,                    -- 'WL' | 'FCFS' | 'RUG' | 'NONE' | null (not finished)
  match_score    TEXT,                    -- e.g. "2-1"
  clinch_round   INTEGER,
  match_history  TEXT,                    -- JSON string
  wallet         TEXT,                    -- filled in once claimed (may equal a wallets.address)
  czar_beatable  INTEGER,                 -- 0/1/NULL — NULL = not yet rolled (bonus battle, post-match)
  entered_at     TEXT NOT NULL,           -- ISO 8601, set by the app
  finished_at    TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  address        TEXT NOT NULL,           -- display form
  normalized     TEXT NOT NULL UNIQUE,    -- lowercase trimmed — the dedupe key
  handle         TEXT NOT NULL,           -- normalized X handle that submitted it
  reward         TEXT,
  submitted_at   TEXT NOT NULL            -- ISO 8601, set by the app
);

CREATE INDEX IF NOT EXISTS idx_entries_entered_at ON entries (entered_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallets_submitted_at ON wallets (submitted_at DESC);
`;

function migrate() {
  db.exec(SCHEMA);
  console.log('[migrate] schema OK');
}

module.exports = { migrate };

// allow `node src/migrate.js` directly
if (require.main === module) {
  try {
    migrate();
    console.log('[migrate] done');
    process.exit(0);
  } catch (e) {
    console.error('[migrate] FAILED', e);
    process.exit(1);
  }
}
