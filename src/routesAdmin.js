// src/routesAdmin.js
'use strict';
const express = require('express');
const { db } = require('./db');
const { adminAuth } = require('./adminAuth');
const { normHandle } = require('./validate');

const router = express.Router();
router.use(adminAuth); // every route below requires the admin bearer token

function shapeEntry(row) {
  if (!row) return row;
  return Object.assign({}, row, {
    verified: !!row.verified,
    task_follow: !!row.task_follow,
    task_like: !!row.task_like,
    task_quote: !!row.task_quote,
    czar_beatable: row.czar_beatable === null ? null : !!row.czar_beatable,
  });
}

/* GET /api/admin/entries — full list, newest first */
router.get('/entries', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM entries ORDER BY entered_at DESC').all();
    res.json({ entries: rows.map(shapeEntry) });
  } catch (err) {
    console.error('[GET /admin/entries] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* GET /api/admin/wallets — full list, newest first */
router.get('/wallets', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM wallets ORDER BY submitted_at DESC').all();
    res.json({ wallets: rows });
  } catch (err) {
    console.error('[GET /admin/wallets] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* GET /api/admin/counts — quick dashboard numbers */
router.get('/counts', (req, res) => {
  try {
    const entries = db.prepare('SELECT COUNT(*) AS c FROM entries').get().c;
    const wallets = db.prepare('SELECT COUNT(*) AS c FROM wallets').get().c;
    const wl = db.prepare("SELECT COUNT(*) AS c FROM entries WHERE reward = 'WL'").get().c;
    const fcfs = db.prepare("SELECT COUNT(*) AS c FROM entries WHERE reward = 'FCFS'").get().c;
    res.json({ entries, wallets, wl, fcfs });
  } catch (err) {
    console.error('[GET /admin/counts] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* PATCH /api/admin/entries/:handle/verify — toggle manual verification */
router.patch('/entries/:handle/verify', (req, res) => {
  try {
    const normalized = normHandle(req.params.handle);
    const existing = db.prepare('SELECT verified FROM entries WHERE normalized = ?').get(normalized);
    if (!existing) return res.status(404).json({ error: 'Entry not found.' });

    const next = existing.verified ? 0 : 1;
    db.prepare('UPDATE entries SET verified = ? WHERE normalized = ?').run(next, normalized);
    const row = db.prepare('SELECT id, handle, verified FROM entries WHERE normalized = ?').get(normalized);
    res.json({ ok: true, entry: shapeEntry(row) });
  } catch (err) {
    console.error('[PATCH /admin/entries/:handle/verify] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* DELETE /api/admin/wipe — wipe all data. Requires typing CONFIRM in body. */
router.delete('/wipe', (req, res) => {
  try {
    if ((req.body || {}).confirm !== 'CONFIRM') {
      return res.status(400).json({ error: 'Send { "confirm": "CONFIRM" } to proceed.' });
    }
    db.exec('DELETE FROM entries; DELETE FROM wallets;');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('entries','wallets');"); // reset autoincrement
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /admin/wipe] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ---------- CSV export helpers ---------- */
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, columns, header) {
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(columns.map(c => csvEscape(typeof c === 'function' ? c(row) : row[c])).join(','));
  }
  return lines.join('\n');
}

/* GET /api/admin/export/entries.csv */
router.get('/export/entries.csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM entries ORDER BY entered_at DESC').all();
    const csv = toCsv(
      rows,
      ['handle', 'proof_url', r => (r.verified ? 'yes' : 'no'), 'wallet', 'reward',
       'match_score', 'clinch_round', 'fighter', 'opponent',
       r => (r.entered_at || ''), r => (r.finished_at || '')],
      ['X Account', 'Quote Post Link', 'Verified', 'Wallet Address', 'Reward',
       'Match Score', 'Clinched Round', 'Fighter', 'Final Opponent', 'Entered At', 'Finished At']
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="doomps_entries_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[GET /admin/export/entries.csv] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* GET /api/admin/export/wallets.csv */
router.get('/export/wallets.csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM wallets ORDER BY submitted_at DESC').all();
    const csv = toCsv(
      rows,
      ['address', 'handle', 'reward', r => (r.submitted_at || '')],
      ['Wallet Address', 'X Account', 'Reward', 'Submitted At']
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="doomps_wallets_${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[GET /admin/export/wallets.csv] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* GET /api/admin/export/full.json — full-fidelity backup */
router.get('/export/full.json', (req, res) => {
  try {
    const entries = db.prepare('SELECT * FROM entries ORDER BY entered_at DESC').all().map(shapeEntry);
    const wallets = db.prepare('SELECT * FROM wallets ORDER BY submitted_at DESC').all();
    res.setHeader('Content-Disposition', `attachment; filename="doomps_submissions.json"`);
    res.json({ entries, wallets });
  } catch (err) {
    console.error('[GET /admin/export/full.json] error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
