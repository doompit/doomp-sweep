// src/db.js
// SQLite storage on a Render persistent disk. Node 20+ has built-in
// SQLite (node:sqlite) — zero npm dependencies for the database layer.
'use strict';

// node:sqlite prints an experimental-feature warning on every boot;
// it's been stable for our purposes across Node 20-22, so we silence
// just that one warning without hiding real ones.
const _emit = process.emitWarning;
process.emitWarning = (w, ...a) => {
  if (typeof w === 'string' && w.includes('SQLite is an experimental feature')) return;
  return _emit.call(process, w, ...a);
};

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// DB_PATH should point at your Render persistent disk's mount path, e.g.
// /var/data/doomps.db — set via the DB_PATH env var. Falls back to a local
// file for local development.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'doomps.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');   // better concurrent read/write behavior
db.exec('PRAGMA foreign_keys = ON;');

module.exports = { db };
