# DOOMPS Sweep

The complete "Sweep or be Swept" game service: game page, admin panel,
and API, all in one Node/Express app. Storage is SQLite on a Render
persistent disk — zero external database dependency, no DATABASE_URL.
This is the whole of sweep.doomps.xyz, separate from your main
doomps.xyz site (static HTML on Cloudflare Pages, which just links here
for "Play").

## Pages

    /          The game itself
    /admin     Admin dashboard (bearer-key gated)
    /healthz   Health check (used by Render)

## Requirements

Node 22.5+ — the database layer uses Node's built-in `node:sqlite`
support, which doesn't exist in earlier versions. This also means zero
npm dependency for the database itself (no `pg`, no separate DB service).

## Local development

    cp .env.example .env      # fill in a local DB_PATH and ADMIN_KEY
    npm install
    npm run migrate           # creates the entries/wallets tables
    npm start                 # http://localhost:3000

## Deploying

See **DEPLOY.md** — covers the Render persistent disk setup, a GitHub
upload gotcha to avoid, and backup guidance (disks need manual/scheduled
backups, unlike a managed database).

## Project layout

    src/
      server.js        Express app: serves the game + admin pages, plus
                        the API, all same-origin
      routesPublic.js   Public game API (entries, wallets, etc.)
      routesAdmin.js    Admin API (bearer-token gated)
      adminAuth.js      The bearer-token check
      db.js             SQLite connection (node:sqlite, on the disk)
      migrate.js        Idempotent schema setup, runs on every boot
      validate.js       Shared input validation/normalization helpers
    public/
      play.html         The game (served at /)
      admin.html         Admin dashboard (served at /admin)
      img/                Site artwork
