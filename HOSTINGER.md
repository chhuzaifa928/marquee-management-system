# Hosting on Hostinger (Business / Premium shared — hPanel)

Your Business plan supports **Node.js Web Apps** (hPanel → Websites → Add website
→ Node.js Web App; Node 18/20/22/24, Express). The server in this repo can also
serve the built React SPA, so the whole system runs as **one Node app** — API at
`/api/*`, the SPA for everything else. MySQL comes with the plan.

> ⚠️ Shared-hosting caveat: a Node app on Business **sleeps after a period of no
> traffic and cold-starts on the next request** (first hit after idle is slow).
> Fine for an internal ERP. If you need always-on, use a Hostinger **VPS**
> instead (see `DEPLOY.md`) — the steps there are the robust alternative.

You need **SSH access** (included on Business) to run the build + migrations.

---

## 1. Create the MySQL database (hPanel → Databases → MySQL)
- Create a database and user (names are prefixed, e.g. `u1234567_grandpearl` /
  `u1234567_gp`). Set a strong password and grant the user all privileges on it.
- Note host (`localhost` when the app and DB share the account), db name, user,
  password. You get **one** database — the app only needs `grand_pearl`
  (migrations use `prisma migrate deploy`, which needs **no** shadow DB).

## 2. Create the Node.js Web App (hPanel → Websites → Add website → Node.js)
- **Node version:** 20 (or 22).
- **Source:** connect the GitHub repo `chhuzaifa928/marquee-management-system`
  (or upload a zip).
- **Application root:** the repo root.
- **Startup file:** `server/dist/index.js`
- **Domain/subdomain:** pick where it serves (e.g. your main domain, or
  `erp.yourdomain.com`).

## 3. Environment variables (in the app's "Environment variables" panel)
```
NODE_ENV=production
DATABASE_URL=mysql://u1234567_gp:URL_ENCODED_PASSWORD@localhost:3306/u1234567_grandpearl
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
CNIC_ENC_KEY=<openssl rand -hex 32>
CNIC_INDEX_KEY=<openssl rand -hex 32>
COOKIE_SECURE=true
CLIENT_DIST=/home/uXXXX/domains/yourdomain.com/.../client/dist   # absolute path to the built SPA
SEED_DEMO_DATA=false
SEED_ADMIN_EMAIL=owner@yourdomain.com
SEED_ADMIN_PASSWORD=<strong one-time password>
```
- URL-encode special chars in the DB password (`@`→`%40`, `#`→`%23`, …).
- `PORT` is provided by Hostinger automatically — the app already reads it; don't set it.
- `CLIENT_DIST` = absolute path to `client/dist` after the build in step 4 (the
  app serves the SPA from there). Find the absolute path with `pwd` over SSH.

## 4. Build + migrate over SSH (hPanel → Advanced → SSH Access)
```bash
cd ~/domains/yourdomain.com/public_html      # the app root you set (adjust path)
npm ci                                        # installs server + client workspaces
npm run build                                 # builds server (tsc) + client (vite)
npm run db:deploy --workspace server          # prisma migrate deploy (creates tables)
npm run db:seed --workspace server            # roles, halls, settings, chart, super admin
# confirm the SPA path for CLIENT_DIST:
echo "$(pwd)/client/dist"
```
Set `CLIENT_DIST` (step 3) to the path printed by the last line, then **Restart**
the app in hPanel.

> If `npm run build` is too heavy on shared hosting (memory/time limits), build
> the **client locally** (`npm run build` in `client`) and upload `client/dist`
> via File Manager to that path instead; still run the server build + migrate on
> the host.

## 5. First login + setup
- Visit the domain → log in as the seeded super admin (`SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`). **Change its password immediately** (Admin → Users).
- Set company name/address/phone/email + GST rate (Admin → Settings).
- Rename the seeded banks and set opening balances (Accounting → Chart of Accounts).
- Optionally load sample data for a demo: `npm run db:seed:demo --workspace server`
  over SSH (skip in a real deployment).

## 6. Updates later
```bash
cd ~/domains/yourdomain.com/public_html
git pull && npm ci && npm run build
npm run db:deploy --workspace server
# then Restart the app in hPanel
```

---

## Alternative: static frontend + API subdomain (no SSH build of the client)
If you'd rather not build the client on the host:
1. Build `client` locally → upload `client/dist/*` to your main domain's
   `public_html` (plain static hosting).
2. Create the Node app on a **subdomain** `api.yourdomain.com`, root = `server`,
   startup `dist/index.js`; build the server over SSH (`cd server && npm ci &&
   npm run build && npx prisma migrate deploy`).
3. Set the app env `CLIENT_ORIGIN=https://yourdomain.com` (for CORS) and build the
   client with `VITE_API_BASE=https://api.yourdomain.com/api`.
This splits origins (needs CORS, already configured) but avoids building the SPA
on the host.

## Health check
`GET /api/health` → `{status:"ok", db:true}` once the app and database are up.

## Security reminders (see SECURITY.md)
Real secrets only (never the dev defaults), `COOKIE_SECURE=true`, HTTPS (Hostinger
provides free SSL — enable it), change seeded passwords, keep `.env`/secrets out of
git, and schedule DB backups (hPanel backups or a cron `mysqldump`).
