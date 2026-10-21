# Grand Pearl Marquee — ERP

A complete management ERP for **Grand Pearl Marquee**, a wedding/banquet marquee
business: bookings, payments, double-entry accounting, inventory, assets, decor,
vendors, event costing/profitability and reports — with role-based access,
gapless document numbering and encrypted customer CNICs.

> **Currency:** PKR · **Default GST:** 16% (admin-editable) · **Halls:** Pearl
> Hall, Emerald Hall (independent — a booking in one never affects the other).

## Stack

| Layer     | Tech                                                                        |
| --------- | --------------------------------------------------------------------------- |
| Frontend  | React 18 + Vite + TypeScript, React Router, TanStack Query, RHF + Zod, Tailwind |
| Backend   | Node + Express + TypeScript, Prisma ORM, MySQL 8, Zod, JWT (httpOnly cookies) |
| Money     | `Decimal(14,2)` columns; all math via decimal.js — never float; rounded 2 dp |
| Testing   | Vitest + Supertest (API) against a disposable MySQL test schema             |

Monorepo: [`/server`](./server) (Express + Prisma) and [`/client`](./client) (React).

## Prerequisites

- **Node.js ≥ 20** (built/tested on Node 24)
- **MySQL 8** running locally (or a reachable instance)

## Setup

```bash
# 1. Install all workspace dependencies (from the repo root)
npm install

# 2. Configure the backend env
cp server/.env.example server/.env
#    then edit server/.env and set DATABASE_URL + TEST_DATABASE_URL passwords
#    (and, for production, real JWT/CNIC secrets)

# 3. Create the schema + generate the Prisma client
npm run db:migrate            # prisma migrate dev (creates tables)
#    or, for a quick push without migration files:
#    npm run db:push --workspace server

# 4. Seed roles, halls, settings, chart of accounts + demo users
npm run db:seed

# 5. Run both apps (http://localhost:5173 client, :4000 API)
npm run dev
```

### Database connection

Create a dedicated local app user + the three databases once (in MySQL Workbench
or any client). This avoids using your `root` account and keeps migrations
least-privilege:

```sql
CREATE DATABASE IF NOT EXISTS grand_pearl        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS grand_pearl_test   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS grand_pearl_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'grandpearl'@'localhost' IDENTIFIED BY 'REDACTED_DEV_PASSWORD';
GRANT ALL PRIVILEGES ON grand_pearl.*        TO 'grandpearl'@'localhost';
GRANT ALL PRIVILEGES ON grand_pearl_test.*   TO 'grandpearl'@'localhost';
GRANT ALL PRIVILEGES ON grand_pearl_shadow.* TO 'grandpearl'@'localhost';
FLUSH PRIVILEGES;
```

`server/.env` then uses:

```
DATABASE_URL="mysql://grandpearl:REDACTED_DEV_PASSWORD@localhost:3306/grand_pearl"
TEST_DATABASE_URL="mysql://grandpearl:REDACTED_DEV_PASSWORD@localhost:3306/grand_pearl_test"
SHADOW_DATABASE_URL="mysql://grandpearl:REDACTED_DEV_PASSWORD@localhost:3306/grand_pearl_shadow"
```

Change the password for any non-local use, and URL-encode special characters
(`@` → `%40`, `#` → `%23`, etc.).

## Seeded accounts

After `npm run db:seed` (defaults from `server/.env`):

| Email                          | Password      | Role        |
| ------------------------------ | ------------- | ----------- |
| superadmin@grandpearl.local    | `ChangeMe!123`| super_admin |
| admin@grandpearl.local         | `ChangeMe!123`| admin       |
| sales@grandpearl.local         | `ChangeMe!123`| sales       |
| accounts@grandpearl.local      | `ChangeMe!123`| accounts    |
| inventory@grandpearl.local     | `ChangeMe!123`| inventory   |
| decor@grandpearl.local         | `ChangeMe!123`| decor       |

> Change these before any real use. Set `SEED_DEMO_DATA=false` to seed only the
> super admin.

## Tests

```bash
npm test            # runs the server suite (Vitest) against TEST_DATABASE_URL
```

The suite resets a dedicated `grand_pearl_test` schema, so it never touches
development data.

## Scripts (root)

| Script              | Does                                               |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Run server + client together                       |
| `npm run build`     | Build both workspaces                              |
| `npm test`          | Run the API test suite                             |
| `npm run db:migrate`| Prisma migrate dev (server)                        |
| `npm run db:seed`   | Seed the database (server)                         |
| `npm run db:reset`  | Drop + recreate + reseed (server)                  |

## Security model (summary)

- **RBAC** — 6 roles (`super_admin`, `admin`, `sales`, `accounts`, `inventory`,
  `decor`) via a `roles` + `user_roles` join (no `role` column). Enforced in
  Express middleware (the real boundary) and mirrored in the client nav.
  `super_admin` bypasses all checks and can lock the whole system.
- **Accounting integrity** — only `super_admin` may edit/delete entries created
  by `accounts`. Every voucher is a balanced two-sided posting (`debit == credit`).
  Account balances are always *derived* from vouchers, never stored.
- **CNIC** — encrypted at rest (AES-256-GCM); exact-match search via an
  HMAC-SHA256 blind index (partial search is impossible by design).
- **Numbering** — gapless, collision-free via `SELECT … FOR UPDATE` row locks.

## Build status

Built module by module (see the build plan). **Module 1 (Foundation)** —
monorepo, Prisma schema, auth + RBAC, seeders, gapless numbering, health check —
is complete with a green test suite. Subsequent modules (bookings, payments,
accounting, reports, inventory, assets/decor/vendors, super-admin) follow.
