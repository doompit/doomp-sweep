// src/server.js
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { migrate } = require('./migrate');
const publicRoutes = require('./routesPublic');
const adminRoutes = require('./routesAdmin');

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy — needed for correct rate-limit IPs

app.use(express.json({ limit: '256kb' }));

// This service is sweep.doomps.xyz in full: the game page, the admin page,
// and the API all live here together. Same-origin, no CORS juggling needed
// for the pages themselves.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'play.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ---------- CORS ----------
   The game/admin pages call this API same-origin, so CORS isn't needed for
   them. This stays in place only in case you ever want another origin
   (e.g. doomps.xyz itself) to call this API directly. Restrict via
   ALLOWED_ORIGIN in Render's env vars — comma-separate multiple origins.
   Falls back to allow-all only when unset. */
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
      }
    : true,
}));

/* ---------- rate limiting ----------
   Generous limits — this is a casual giveaway game, not a target for
   heavy write traffic, but we still don't want it wide open to abuse. */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use('/api/entries', writeLimiter);
app.use('/api/wallets', writeLimiter);

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Server error.' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await migrate();
  } catch (err) {
    console.error('FATAL: migration failed at boot:', err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`[server] listening on :${PORT}`);
  });
}

start();
