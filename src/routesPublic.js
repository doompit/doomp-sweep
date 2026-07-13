// src/routesPublic.js
'use strict';
const express = require('express');
const { db } = require('./db');
const { normHandle, normWallet, isValidHandle, isValidProofUrl, isValidWallet, REWARD_VALUES } = require('./validate');

const router = express.Router();

// Turn a raw SQLite row's 0/1 integer flags into real booleans and parse
// match_history back into an object, so API responses look identical to
// what the frontend already expects.
function shapeEntry(row) {
  if (!row) return row;
  return Object.assign({}, row, {
    verified: !!row.verified,
    task_follow: !!row.task_follow,
    task_like: !!row.task_like,
    task_quote: !!row.task_quote,
    czar_beatable: row.czar_beatable === null ? null : !!row.czar_beatable,
    match_history: row.match_history ? JSON.parse(row.match_history) : null,
  });
}

/* =====================================================================
   POST /api/entries
   Create a gate entry (X handle + proof link + task checklist).
   One entry per normalized handle — enforced by a DB unique constraint
   AND a pre-check, so the error message is friendly either way.
   ===================================================================== */
router.post('/entries', (req, res) => {
  try {
    const { handle, proofUrl, tasks } = req.body || {};
    const normalized = normHandle(handle);

    if (!isValidHandle(handle)) {
      return res.status(400).json({ error: 'Enter a valid X handle.' });
    }
    if (!isValidProofUrl(proofUrl)) {
      return res.status(400).json({ error: 'Paste a valid link to your quote post (x.com/…/status/…).' });
    }
    const t = tasks || {};
    if (!t.follow || !t.like || !t.quote) {
      return res.status(400).json({ error: 'Please confirm all tasks first.' });
    }

    const existing = db.prepare('SELECT id FROM entries WHERE normalized = ?').get(normalized);
    if (existing) {
      return res.status(409).json({ error: 'This X account has already entered. One entry per account.' });
    }

    const displayHandle = String(handle).trim().startsWith('@') ? String(handle).trim() : '@' + normHandle(handle);
    const enteredAt = new Date().toISOString();
    try {
      const info = db.prepare(
        `INSERT INTO entries (handle, normalized, proof_url, task_follow, task_like, task_quote, entered_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(displayHandle, normalized, String(proofUrl).trim(), t.follow ? 1 : 0, t.like ? 1 : 0, t.quote ? 1 : 0, enteredAt);
      const row = db.prepare('SELECT id, handle, normalized, entered_at FROM entries WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json({ ok: true, entry: row });
    } catch (err) {
      if (err && /UNIQUE/.test(err.message)) {
        // unique_violation race — two simultaneous submits for the same handle
        return res.status(409).json({ error: 'This X account has already entered. One entry per account.' });
      }
      throw err;
    }
  } catch (err) {
    console.error('[POST /entries] error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* =====================================================================
   POST /api/entries/:handle/czar-roll
   Rolls (once, ever) whether this account can beat Czar in the post-match
   bonus battle. If already rolled, returns the same locked-in result every
   time — no re-rolling by retrying the fight. SQLite only allows one
   writer at a time, so wrapping the read-then-conditionally-write in a
   single transaction makes this safe against concurrent requests for the
   same handle: the second request's transaction waits for the first to
   commit, then sees the already-set value and skips the write.
   ===================================================================== */
router.post('/entries/:handle/czar-roll', (req, res) => {
  try {
    const normalized = normHandle(req.params.handle);
    let result;

    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT czar_beatable FROM entries WHERE normalized = ?').get(normalized);
      if (!existing) {
        db.exec('ROLLBACK');
        return res.status(404).json({ error: 'Entry not found.' });
      }

      let beatable = existing.czar_beatable;
      if (beatable === null) {
        // CZAR_WIN_CHANCE: probability (0-1) of beating Czar in the bonus
        // battle. Change this single constant to retune the odds.
        const CZAR_WIN_CHANCE = 0.05;
        beatable = Math.random() < CZAR_WIN_CHANCE ? 1 : 0;
        db.prepare('UPDATE entries SET czar_beatable = ? WHERE normalized = ?').run(beatable, normalized);
      }
      db.exec('COMMIT');
      result = !!beatable;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ ok: true, beatable: result });
  } catch (err) {
    console.error('[POST /entries/:handle/czar-roll] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* =====================================================================
   GET /api/entries/:handle
   Look up an entry by handle — used by the frontend to check whether a
   handle already exists before letting someone start the gate flow.
   ===================================================================== */
router.get('/entries/:handle', (req, res) => {
  try {
    const normalized = normHandle(req.params.handle);
    const row = db.prepare('SELECT * FROM entries WHERE normalized = ?').get(normalized);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    res.json({ entry: shapeEntry(row) });
  } catch (err) {
    console.error('[GET /entries/:handle] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* =====================================================================
   PATCH /api/entries/:handle/result
   Record the outcome of a completed match (called once, when the result
   screen is shown). Idempotent-ish: allows overwrite in case of retry,
   but does not allow changing a handle's identity.
   ===================================================================== */
router.patch('/entries/:handle/result', (req, res) => {
  try {
    const normalized = normHandle(req.params.handle);
    const { fighter, opponent, reward, matchScore, clinchRound, matchHistory } = req.body || {};

    if (reward !== undefined && reward !== null && !REWARD_VALUES.has(reward)) {
      return res.status(400).json({ error: 'Invalid reward value.' });
    }

    const current = db.prepare('SELECT id FROM entries WHERE normalized = ?').get(normalized);
    if (!current) return res.status(404).json({ error: 'Entry not found.' });

    db.prepare(
      `UPDATE entries SET
         fighter = COALESCE(?, fighter),
         opponent = COALESCE(?, opponent),
         reward = COALESCE(?, reward),
         match_score = COALESCE(?, match_score),
         clinch_round = COALESCE(?, clinch_round),
         match_history = COALESCE(?, match_history),
         finished_at = ?
       WHERE normalized = ?`
    ).run(
      fighter || null, opponent || null, reward || null,
      matchScore || null, clinchRound || null,
      matchHistory ? JSON.stringify(matchHistory) : null,
      new Date().toISOString(), normalized
    );

    const row = db.prepare('SELECT id, handle, normalized, reward, match_score FROM entries WHERE normalized = ?').get(normalized);
    res.json({ ok: true, entry: row });
  } catch (err) {
    console.error('[PATCH /entries/:handle/result] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* =====================================================================
   POST /api/wallets
   Submit a wallet claim for a WL/FCFS reward. One wallet address may
   only ever be submitted once, globally (server-enforced).
   ===================================================================== */
router.post('/wallets', (req, res) => {
  try {
    const { wallet, handle, reward } = req.body || {};
    const normalizedWallet = normWallet(wallet);
    const normalizedHandle = normHandle(handle);

    if (!isValidWallet(wallet)) {
      return res.status(400).json({ error: 'Enter a valid wallet address.' });
    }
    if (reward !== 'WL' && reward !== 'FCFS') {
      return res.status(400).json({ error: 'This reward is not claimable.' });
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const dupe = db.prepare('SELECT id FROM wallets WHERE normalized = ?').get(normalizedWallet);
      if (dupe) {
        db.exec('ROLLBACK');
        return res.status(409).json({ error: 'This wallet has already been submitted.' });
      }

      const entry = db.prepare('SELECT id FROM entries WHERE normalized = ?').get(normalizedHandle);
      if (!entry) {
        db.exec('ROLLBACK');
        return res.status(404).json({ error: 'No matching entry found for this X account.' });
      }

      const submittedAt = new Date().toISOString();
      const info = db.prepare(
        `INSERT INTO wallets (address, normalized, handle, reward, submitted_at)
         VALUES (?,?,?,?,?)`
      ).run(String(wallet).trim(), normalizedWallet, normalizedHandle, reward, submittedAt);

      db.prepare('UPDATE entries SET wallet = ? WHERE normalized = ?').run(String(wallet).trim(), normalizedHandle);

      db.exec('COMMIT');
      const row = db.prepare('SELECT id, address, handle, reward, submitted_at FROM wallets WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json({ ok: true, wallet: row });
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } catch (err) {
    if (err && /UNIQUE/.test(err.message)) {
      return res.status(409).json({ error: 'This wallet has already been submitted.' });
    }
    console.error('[POST /wallets] error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
