// src/validate.js
'use strict';

// Same normalization the frontend used with window.storage, so behavior
// doesn't change: strip leading @, trim, lowercase.
function normHandle(s) {
  return String(s || '').trim().toLowerCase().replace(/^@+/, '');
}
function normWallet(s) {
  return String(s || '').trim().toLowerCase();
}

function isValidHandle(raw) {
  const h = normHandle(raw);
  // X handles: 1-15 chars, letters/digits/underscore per X's own rules.
  // We're a bit more permissive (4-30) to avoid false rejections, since
  // the real enforcement is uniqueness + manual verification anyway.
  return h.length >= 1 && h.length <= 30 && /^[a-z0-9_]+$/.test(h);
}

function isValidProofUrl(raw) {
  const u = String(raw || '').trim();
  return /^https?:\/\/(x\.com|twitter\.com)\/[^\/\s]+\/status\/\d+/i.test(u);
}

function isValidWallet(raw) {
  const w = String(raw || '').trim();
  // Deliberately loose: accept EVM (0x + 40 hex) or a generic base58-ish
  // string (covers Solana etc.) between 20-64 chars. We are not the
  // source of truth for "is this address real" — that's on-chain / manual
  // verification. We just want to catch empty/garbage input.
  if (/^0x[a-fA-F0-9]{40}$/.test(w)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(w)) return true;
  return false;
}

const REWARD_VALUES = new Set(['WL', 'FCFS', 'RUG', 'NONE']);

module.exports = {
  normHandle, normWallet,
  isValidHandle, isValidProofUrl, isValidWallet,
  REWARD_VALUES,
};
