# Deployment Guide — Grand Pearl Marquee ERP

The app is a Node/Express API (`/server`) serving a built React SPA (`/client`).
Any Node 20+ host with a MySQL 8 database works (a VPS, or a Node-capable shared
host such as Hostinger). Below is a standard VPS/Node deployment.

## 1. Provision
- Node.js ≥ 20, MySQL 8, a process manager (pm2), and a reverse proxy (nginx)
  with TLS (Let's Encrypt).
- Create the database + a least-privilege user (see `README.md` → Database):
  `grand_pearl`, `grand_pearl_shadow` (migrations) and the app user.

## 2. Server configuration (`server/.env`)
Set **real** secrets (never the dev defaults):
```
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://erp.yourdomain.com
DATABASE_URL="mysql://appuser:STRONGPW@localhost:3306/grand_pearl"
SHADOW_DATABASE_URL="mysql://appuser:STRONGPW@localhost:3306/grand_pearl_shadow"
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
CNIC_ENC_KEY=<openssl rand -hex 32>
CNIC_INDEX_KEY=<openssl rand -hex 32>
COOKIE_SECURE=true
SEED_DEMO_DATA=false
SEED_ADMIN_EMAIL=owner@yourdomain.com
SEED_ADMIN_PASSWORD=<strong one-time password>
```
> Keep the same `CNIC_ENC_KEY`/`CNIC_INDEX_KEY` forever — rotating them makes
> stored CNICs undecryptable / unsearchable. Plan key rotation as a re-encrypt
> migration if ever needed.

## 3. Build & migrate
```bash
npm ci
npm run build                     # builds server (tsc) + client (vite)
npm run db:deploy --workspace server   # prisma migrate deploy (no dev shadow churn)
npm run db:seed                   # roles, halls, settings, chart, super_admin
```
`prisma migrate deploy` applies committed migrations only (safe for production).

## 4. Serve
- **API**: run the compiled server under pm2:
  ```bash
  pm2 start server/dist/index.js --name gp-api --time
  pm2 save && pm2 startup
  ```
- **Client**: serve `client/dist` as static files via nginx (or any static host /
  CDN). Point the SPA's API calls at the API origin (set `VITE_API_BASE` at build
  time if the API is on a different origin; same-origin behind one nginx needs no
  change).

### Example nginx
```nginx
server {
  listen 443 ssl;
  server_name erp.yourdomain.com;
  # ssl_certificate ... (Let's Encrypt)

  root /var/www/grand-pearl/client/dist;
  location / { try_files $uri /index.html; }           # SPA fallback
  location /api/ { proxy_pass http://127.0.0.1:4000;   # API
                   proxy_set_header Host $host;
                   proxy_set_header X-Forwarded-For $remote_addr;
                   proxy_set_header X-Forwarded-Proto $scheme; }
}
```
The app already sets `helmet`, CORS locked to `CLIENT_ORIGIN`, and
`app.set('trust proxy', 1)` for correct client IPs behind the proxy.

## 5. Post-deploy
- Log in as the seeded super admin, change its password, create real staff users
  with their roles (Admin → Users & Roles).
- Set company name/address/phone/email and the GST rate (Admin → Settings).
- Rename the seeded `Bank Account 1/2` to the real banks, set opening balances
  (Accounting → Chart of Accounts).

## 6. Backups & restore (SRS §17)
- Schedule nightly `mysqldump` of `grand_pearl` to off-site storage:
  ```bash
  mysqldump --single-transaction grand_pearl | gzip > gp_$(date +%F).sql.gz
  ```
- Document restore: `gunzip < backup.sql.gz | mysql grand_pearl`.
- Financial records are soft-deleted (never hard-erased), so history survives in
  the app; backups cover infrastructure loss.

## 7. Updates
```bash
git pull && npm ci && npm run build
npm run db:deploy --workspace server
pm2 restart gp-api
```

## Health
`GET /api/health` returns `{status:"ok", db:true}` when the API and database are
reachable — use it for uptime checks and load-balancer probes.
