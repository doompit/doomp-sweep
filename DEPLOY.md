# DOOMPS — sweep.doomps.xyz Deploy Guide (Persistent Disk)

This is the WHOLE game service: the game page, the admin panel, and the
API, all together in one Render app at sweep.doomps.xyz. Storage is
SQLite on a Render persistent disk — no separate database service, no
DATABASE_URL, no extra moving parts. Your main site (doomps.xyz — home,
portal, lore) stays on Cloudflare Pages, completely separate.

========================================================================
## Before you start — avoiding the GitHub upload mistake from last time
========================================================================
If you ran into "Cannot find module .../src/src/server.js" before, it was
almost certainly because GitHub's web upload dropped the src/ folder
(browsers often can't select folders via the file-picker button, only
individual files). This time:

[ ] On your repo's GitHub page → Add file → Upload files
[ ] DRAG the actual `src` folder icon from your file explorer/Finder
    directly onto the upload area. Do NOT click "choose your files" and
    select files from inside it — that misses the folder structure.
[ ] After dragging, GitHub's upload preview should list paths like
    `src/server.js`, `src/db.js`, etc. — 7 files total under src/.
    If you only see files with no `src/` prefix, it didn't work; start
    the upload again by dragging the folder itself.
[ ] Also upload package.json, render.yaml, .env.example, .gitignore at
    the repo root (fine to select these individually, they're files).
[ ] Commit. Then check the repo's file list on github.com — click into
    the src folder and confirm all 7 .js files are there before touching
    Render at all.

========================================================================
## STEP 1 — Push to GitHub
========================================================================
[ ] Use a fresh repo for this (recommended — avoids leftover confusion
    from the earlier Postgres-based attempt).
[ ] Confirm at github.com that BOTH exist at the repo root:
      package.json
      src/server.js   (and the other 6 files alongside it)

========================================================================
## STEP 2 — Create the Render Web Service WITH a disk
========================================================================
[ ] Render dashboard → New → Web Service → connect your repo.
      Name:            doomps-sweep
      Root Directory:  (leave BLANK — repo root)
      Build Command:   npm install
      Start Command:   npm start
      Instance Type:   Starter (~$7/mo — required for persistent disks;
                        this is also the game's actual site now, not
                        just an API, so it shouldn't sleep anyway)
      Health Check Path: /healthz

[ ] Add a Persistent Disk (Render → this service → Disks → Add Disk):
      Name:        doomps-data
      Mount Path:  /var/data
      Size:        1 GB (plenty for this — it's just text rows)

Environment variables (Environment tab → Add each):
  DB_PATH        → /var/data/doomps.db
  ADMIN_KEY      → a long random string:
                   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ALLOWED_ORIGIN → https://sweep.doomps.xyz
  NODE_VERSION   → 22
                   (this MUST be 22 or higher — the database layer uses
                   Node's built-in SQLite support, which only exists in
                   Node 22.5+. Node 18 or 20 will fail to start.)

[ ] Deploy. Watch the build logs for "[migrate] schema OK" followed by
    "[server] listening on :10000" (or similar) with no errors.
[ ] You'll get a temporary URL like https://doomps-sweep.onrender.com.
    Open it — the game should load directly at the root (no /play
    needed, this whole service IS the game).
[ ] Play through it once to confirm an entry saves.
[ ] Visit /admin on that same URL, log in with your ADMIN_KEY, confirm
    your test entry shows up.

========================================================================
## STEP 3 — Point sweep.doomps.xyz at this service
========================================================================
[ ] Render (doomps-sweep service) → Settings → Custom Domains → add:
      sweep.doomps.xyz
    Render will show you the exact CNAME target.
[ ] Cloudflare → doomps.xyz → DNS → Add record:
      Type: CNAME   Name: sweep   Target: (the host Render gave you)
      Proxy status: DNS only (grey cloud)
[ ] Wait a few minutes, then visit https://sweep.doomps.xyz directly —
    it should show the game.

========================================================================
## STEP 4 — Update your Cloudflare site's "Play" links
========================================================================
The paired `doomps-home` package has index.html, portal.html, and
lore.html with their "Play" links already pointing to
https://sweep.doomps.xyz. Replace your current versions of these three
files in your Cloudflare Pages project with these updated ones.

[ ] Confirm doomps.xyz's nav "Play" link and "Enter the Swamp" buttons
    go to sweep.doomps.xyz.
[ ] Confirm sweep.doomps.xyz's "← doomps.xyz" link goes back home.

========================================================================
## Day-to-day admin use
========================================================================
Go to sweep.doomps.xyz/admin, enter your ADMIN_KEY. Entries, Wallets,
Export (CSV/JSON), and a Danger Zone wipe — same dashboard as before.

========================================================================
## Backups — since this is a disk, not a managed database
========================================================================
Render's persistent disks are durable (survive restarts/redeploys) but
you're responsible for your own backups, unlike a managed Postgres
instance. Two easy options:
  - Regularly download a full backup via the admin panel's Export tab
    → "Full JSON Backup". Do this occasionally, especially before using
    the Danger Zone wipe.
  - Render's paid disk plans include automatic daily snapshots — check
    your disk's settings in the Render dashboard to confirm this is on.

========================================================================
## If something goes wrong
========================================================================
- "Cannot find module .../src/src/server.js" again: see the GitHub
  upload section at the top — the src/ folder didn't make it into the repo.
- Server crashes on boot mentioning `node:sqlite`: NODE_VERSION isn't set
  to 22 (or is set but the field has a typo). This is the #1 thing to
  check — SQLite support needs Node 22.5+.
- "Server misconfigured: ADMIN_KEY not set": add the ADMIN_KEY env var
  and redeploy.
- Game loads but admin says Unauthorized: double-check you're pasting the
  exact ADMIN_KEY from Render's Environment tab.
- Entries don't survive a restart: confirm the disk is actually attached
  (Render → service → Disks tab should show doomps-data mounted at
  /var/data) and that DB_PATH matches the mount path exactly.
- sweep.doomps.xyz doesn't resolve: DNS can take up to ~30 minutes; also
  confirm the Cloudflare record is "DNS only" (grey cloud), not proxied.
