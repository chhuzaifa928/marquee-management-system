# Security Overview — Grand Pearl Marquee ERP

This summarises the controls in place and the hardening steps for production. It
follows the SRS security requirements (§17) and permission matrix (§3/§4).

## Authentication
- Email + password; passwords hashed with bcrypt (bcryptjs, cost 10 in prod).
- JWT **access** (15m) + **refresh** (7d) tokens in **httpOnly** cookies
  (`SameSite=Lax`); `Secure` flag driven by `COOKIE_SECURE` (set `true` in prod).
- Secrets come only from env; `env.ts` fails fast if `JWT_*`/`CNIC_*` are missing
  or malformed.
- Auth endpoints are rate-limited (`express-rate-limit`).
- **System lock**: when `settings.systemLocked` is true, only `super_admin` can
  log in or refresh — enforced in the login/refresh guard, not just the UI.

## Authorisation (RBAC) — the server is the only boundary
- Six roles via `roles` + `user_roles` (no `role` column). `super_admin` bypasses
  all checks. Enforced on **every** route with `requireAuth` + `requireModule`,
  and action gates with `requireRole(...)`. The React nav mirrors this only for
  UX; hiding a button is never the control.
- Matrix highlights (SRS §3): Sales create bookings but **cannot** record
  payments or post vouchers; Accounts post vouchers/payments + event costing;
  **Admin cannot post/edit accounting vouchers**; only **Super Admin** can
  edit/delete Accounts-created entries (payment slips, revenue batches) and lock
  the system; GST rate = Admin/Super; assets/vendors = Admin/Super.
- Accounts-created financial entries are immutable to their authors: there is no
  voucher edit/delete endpoint; slip deletion and event reopen are `super_admin`
  only.

## Data protection
- **CNIC** encrypted at rest with AES-256-GCM (`CNIC_ENC_KEY`); searched only via
  a deterministic HMAC-SHA256 **blind index** (`CNIC_INDEX_KEY`) — exact match
  only, partial search impossible by design. CNIC never returned in clear (masked
  for display).
- Financial records (`bookings`, `bookingCharges`, `paymentSlips`, `vouchers`,
  `accounts`, `eventCosts`) are **audit-logged** and **soft-deleted** — history is
  never truly erased.
- Money stored as `DECIMAL`; all arithmetic via decimal.js (never float).
  Double-entry: every voucher asserts `amount > 0` and `debit ≠ credit`; account
  balances are always **derived**, never stored.
- Gapless, atomic document numbering via `SELECT … FOR UPDATE` row locks.

## Transport & app hardening
- `helmet` security headers; `cors` locked to `CLIENT_ORIGIN` with credentials.
- All request bodies validated with Zod; money/status/account IDs never trusted
  from the client.
- Central error handler hides internal details in production.
- **Least-privilege DB user** (`grandpearl`) scoped to the app's three databases
  only — not the MySQL root account.

## Production hardening checklist
- [ ] Set real `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CNIC_ENC_KEY`,
      `CNIC_INDEX_KEY` (e.g. `openssl rand -hex 32`); never reuse the dev values.
- [ ] `COOKIE_SECURE=true` and serve over HTTPS.
- [ ] Change all seeded demo passwords; remove demo users (`SEED_DEMO_DATA=false`).
- [ ] Change the `grandpearl` DB password and the dev `root` password set during
      setup; rotate `scripts/reset-mysql.ps1`'s values (that script is a local
      dev helper only — do not ship its passwords).
- [ ] Restrict `CLIENT_ORIGIN` to the real front-end origin(s).
- [ ] Scheduled off-site DB backups + documented restore (SRS §17).

## Known trade-offs (scoped, not bugs)
- Refresh tokens are stateless: logout clears the cookie but a stolen token stays
  valid until expiry. A server-side refresh-token denylist can be added if needed.
- Rate limiting is applied to auth endpoints; a global limiter can be added for
  all routes behind the proxy.
