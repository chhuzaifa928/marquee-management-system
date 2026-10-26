<div align="center">

<h1>Grand Pearl Marquee ERP</h1>

<p><strong>Bookings, payments, double-entry accounting, inventory and operations — one system for a wedding &amp; banquet marquee business.</strong></p>

<p>
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white">
  <img alt="Prisma 6" src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white">
  <img alt="MySQL 8" src="https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white">
  <img alt="Vitest" src="https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white">
  <img alt="Modules" src="https://img.shields.io/badge/modules-8%2F8%20complete-2ea44f">
</p>

<p>
  <a href="#quick-start">Quick Start</a> ·
  <a href="#modules-at-a-glance">Modules</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#roles--permissions">Roles</a> ·
  <a href="#security-model">Security</a> ·
  <a href="#documentation">Docs</a>
</p>

</div>

---

## Overview

**Grand Pearl Marquee ERP** runs the full lifecycle of a marquee business — from
the first customer enquiry to the final profit-and-loss statement:

**Enquiry → Booking → Payments → Event execution → Accounting → Reports → Profitability**

Two halls are managed independently (**Pearl Hall** and **Emerald Hall** — a
booking in one never affects availability in the other), with per-slot
(**lunch** / **dinner**) conflict checks and first-confirmed-wins booking.

| | |
| --- | --- |
| **Currency** | PKR |
| **Default GST** | 16% (admin-editable) |
| **Halls** | Pearl Hall, Emerald Hall |
| **Roles** | 6 (super admin → decor) |
| **Financial engine** | Double-entry, derived balances, decimal-only math |
| **Documents** | Gapless, collision-free numbering |
| **Tests** | Vitest + Supertest against a disposable MySQL schema |

## Feature highlights

| Area | What you get |
| --- | --- |
| **Customers** | Profiles with CNIC encryption at rest, blind-index exact search, masked display, booking history. |
| **Bookings** | Availability checks per hall + slot, GST/totals snapshot, itemised charges, English + Urdu menu, per-hall calendar, booking PDF. |
| **Payments** | Gapless payment slips, receipt-voucher posting, money-driven status machine (`tentative → booked → paid`), advance/balance tracking. |
| **Accounting** | Chart of accounts, balanced vouchers (RV/EV/PV/JV), General Ledger, derived balances, event revenue recognition on close. |
| **Reports** | Cash Closing, General Ledger, Supplier Summary, Bookings Master and Profit & Loss — each available on screen and as an A4 PDF. |
| **Inventory** | Items + stock movements (`in` / `out` / `adjustment`), recomputed stock (never drifts), low-stock alerts. |
| **Assets & Decor** | Asset and decor registers with condition/status, assignment tracking. |
| **Vendors & Event Costs** | Vendor directory plus vendor / inventory / misc event costing and per-event profitability. |
| **Admin** | Company and GST settings, user & role management, audit log, system lock. |
| **Dashboards** | Role-aware home with upcoming events, cash position, receivables, low-stock alerts and a revenue chart. |

### Engineering highlights

- **Money is never a float** — `Decimal(14,2)` columns and decimal.js throughout, rounded to 2 dp.
- **Balances are never stored** — every account balance is derived from vouchers, so it cannot drift.
- **The server is the only security boundary** — RBAC is enforced in Express middleware on every route; the React nav merely mirrors it.
- **Financial history is immutable** — audit log + soft delete on bookings, charges, slips, vouchers, accounts and event costs.
- **Gapless document numbers** — allocated atomically with `SELECT … FOR UPDATE` row locks.
- **CNIC is encrypted** with AES-256-GCM and searchable only through an HMAC-SHA256 blind index.

## Modules at a glance

| Module | Route | Purpose |
| --- | --- | --- |
| Dashboard | `/dashboard` | Role-aware KPIs, upcoming events, revenue chart |
| Customers | `/customers` | Customer records, CNIC search, history |
| Bookings | `/bookings` | Create/manage bookings, charges, menus, PDFs, calendar |
| Payments | `/payments` | Slips, advances, posting to the ledger |
| Accounting | `/accounting` | Vouchers, chart of accounts, General Ledger |
| Reports | `/reports` | Five financial/operational reports with PDF export |
| Inventory | `/inventory` | Stock items and movements |
| Assets | `/assets` | Asset register and status |
| Decor | `/decor` | Decor inventory and usage |
| Vendors | `/vendors` | Supplier directory |
| Event Costs | `/event-costs` | Costing and per-event profitability |
| Admin | `/admin` | Settings, users, roles, audit log, system lock |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    SPA["React 18 SPA<br/>Vite · TypeScript · Tailwind<br/>TanStack Query · RHF + Zod"]
  end

  subgraph API["Express API (Node 20+)"]
    MW["Auth · RBAC · Rate limit<br/>Helmet · CORS · Zod"]
    MOD["Domain modules<br/>bookings · payments · accounting<br/>inventory · reports · admin"]
    SVC["Services<br/>numbering · balances · posting<br/>availability · encryption"]
  end

  DB[("MySQL 8<br/>Prisma ORM")]
  PDF["PDFKit<br/>A4 documents"]

  SPA -->|"HTTPS · JSON<br/>httpOnly cookies"| MW
  MW --> MOD
  MOD --> SVC
  SVC --> DB
  MOD --> PDF
```

PDF generation (booking confirmations, reports) happens server-side; the SPA
never sees raw financial internals it is not authorised for.

## Tech stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 18, Vite 5, TypeScript, React Router 6, TanStack Query, React Hook Form + Zod, Tailwind CSS, Recharts |
| **Backend** | Node 20+, Express 4, TypeScript, Prisma 6, Zod, JWT in httpOnly cookies, Helmet, express-rate-limit |
| **Database** | MySQL 8 (`utf8mb4`), Decimal money columns, pre-created shadow DB for migrations |
| **Money** | decimal.js — all arithmetic decimal, never floating point |
| **Documents** | PDFKit (booking + report PDFs) |
| **Testing** | Vitest + Supertest, disposable `grand_pearl_test` schema |

## Quick start

### Prerequisites

- **Node.js ≥ 20** (built and tested on Node 24)
- **MySQL 8** running locally or reachable over the network

### 1. Install

```bash
npm install
```

Installs both workspaces (`server` and `client`) from the repo root.

### 2. Configure

```bash
cp server/.env.example server/.env          # macOS / Linux
Copy-Item server/.env.example server/.env   # Windows PowerShell
```

Edit `server/.env` and set `DATABASE_URL`, `TEST_DATABASE_URL`,
`SHADOW_DATABASE_URL`, and production-grade `JWT_*` / `CNIC_*` secrets.

### 3. Create the databases

Run once in MySQL Workbench or any client:

```sql
CREATE DATABASE IF NOT EXISTS grand_pearl        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS grand_pearl_test   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS grand_pearl_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'grandpearl'@'localhost' IDENTIFIED BY 'CHOOSE_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON grand_pearl.*        TO 'grandpearl'@'localhost';
GRANT ALL PRIVILEGES ON grand_pearl_test.*   TO 'grandpearl'@'localhost';
GRANT ALL PRIVILEGES ON grand_pearl_shadow.* TO 'grandpearl'@'localhost';
FLUSH PRIVILEGES;
```

Then point `server/.env` at that least-privilege user:

```env
DATABASE_URL="mysql://grandpearl:YOUR_DB_PASSWORD@localhost:3306/grand_pearl"
TEST_DATABASE_URL="mysql://grandpearl:YOUR_DB_PASSWORD@localhost:3306/grand_pearl_test"
SHADOW_DATABASE_URL="mysql://grandpearl:YOUR_DB_PASSWORD@localhost:3306/grand_pearl_shadow"
```

URL-encode special characters (`@` → `%40`, `#` → `%23`, etc.). `.env` files are
git-ignored — never commit real secrets.

### 4. Migrate and seed

```bash
npm run db:migrate    # prisma migrate dev — creates tables
npm run db:seed       # roles, halls, settings, chart of accounts, demo users
```

### 5. Run

```bash
npm run dev
```

| App | URL |
| --- | --- |
| Client | http://localhost:5173 |
| API | http://localhost:4000 |

Vite proxies `/api` to the API in development so auth cookies stay same-origin.

## Seeded accounts

After `npm run db:seed` (defaults from `server/.env`):

| Email | Password | Role |
| --- | --- | --- |
| `superadmin@grandpearl.local` | `ChangeMe!123` | super_admin |
| `admin@grandpearl.local` | `ChangeMe!123` | admin |
| `sales@grandpearl.local` | `ChangeMe!123` | sales |
| `accounts@grandpearl.local` | `ChangeMe!123` | accounts |
| `inventory@grandpearl.local` | `ChangeMe!123` | inventory |
| `decor@grandpearl.local` | `ChangeMe!123` | decor |

> Change these before any real use. Set `SEED_DEMO_DATA=false` to seed only the
> super admin.

## Roles & permissions

Six roles, stored through `roles` + `user_roles` (no `role` column). `super_admin`
bypasses all checks and can lock the entire system.

| Role | Typical capabilities |
| --- | --- |
| **super_admin** | Everything; only role that can edit/delete accounts-created entries, delete slips, reopen events and lock the system |
| **admin** | Full operational view of every module plus settings, users and roles; cannot post/edit accounting vouchers or enter event costing |
| **sales** | Customers and bookings; can create bookings but cannot record payments or post vouchers (reports scoped to own bookings) |
| **accounts** | Payments, vouchers, General Ledger, financial reports, event costing/profitability |
| **inventory** | Inventory items, stock movements and stock levels |
| **decor** | Decor register, availability and assignments |

The authoritative matrix lives in [`SECURITY.md`](./SECURITY.md).

## Security model

- **Authentication** — bcrypt passwords; JWT access (15m) + refresh (7d) tokens
  in `httpOnly`, `SameSite=Lax` cookies; `Secure` in production; rate-limited
  login and refresh endpoints.
- **Authorisation** — `requireAuth` + `requireModule` on every route, with
  `requireRole(...)` action gates. Hiding UI is never the control.
- **System lock** — when enabled, only `super_admin` can log in or refresh.
- **CNIC protection** — AES-256-GCM encryption at rest, HMAC-SHA256 blind index
  for exact-match lookup, masked output. Partial CNIC search is impossible by
  design.
- **Accounting integrity** — every voucher must balance (`debit == credit`);
  balances are derived from vouchers; financial records are audit-logged and
  soft-deleted, never erased.
- **Transport & input** — Helmet headers, CORS locked to `CLIENT_ORIGIN`, Zod
  validation on request bodies, central error handler that hides internals in
  production.
- **Least privilege** — the app uses a dedicated MySQL user scoped to its three
  databases, not `root`.

## Reports & PDFs

Every report is available as JSON (for the SPA) and as a print-ready A4 PDF:

| Report | Contents |
| --- | --- |
| **Cash Closing** | Cash/bank movement for a date range |
| **General Ledger** | Per-account transactions with running balance |
| **Supplier Summary** | Vendor payables and activity |
| **Bookings Master** | Booking register for a period |
| **Profit & Loss** | Income vs. expense for a From–To range |

## Testing

```bash
npm test
```

Runs the server suite (15 Vitest suites) against `TEST_DATABASE_URL`. The suite
resets a dedicated `grand_pearl_test` schema, so development data is never
touched. Coverage includes auth/RBAC, money math, gapless numbering, CNIC
crypto, availability, booking totals, payments, accounting, reports, inventory,
event costs and admin controls.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run API + client together |
| `npm run dev:server` | Run the API only (watch mode) |
| `npm run dev:client` | Run the client only |
| `npm run build` | Type-check + build server and client |
| `npm test` | Run the API test suite |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:seed` | Seed roles, halls, settings, chart of accounts |
| `npm run db:reset` | Drop, recreate and reseed the database |

Workspace-level extras: `npm run typecheck --workspace server`,
`npm run typecheck --workspace client`.

## Project structure

```text
grand-pearl-marquee/
├─ client/                  React 18 SPA
│  ├─ src/pages/            Feature screens (bookings, payments, reports, …)
│  ├─ src/components/       Layout, protected routes, shared UI
│  ├─ src/api/              Typed API hooks (TanStack Query)
│  ├─ src/auth/             Auth context
│  └─ src/config/           Module + permission definitions
├─ server/                  Express + Prisma API
│  ├─ src/modules/          Domain routes/services per module
│  ├─ src/services/         Numbering, balances, posting, availability
│  ├─ src/lib/              Money, crypto, JWT, PDF, audit helpers
│  ├─ src/middleware/       Auth, RBAC, error handling
│  ├─ prisma/               Schema, migrations, seed
│  └─ tests/                Vitest + Supertest suites
├─ scripts/                 Local development helpers
├─ DEPLOY.md                VPS/Node deployment guide
├─ SECURITY.md              Security model + hardening checklist
└─ package.json             npm workspaces root
```

## Documentation

| Document | Contents |
| --- | --- |
| [`DEPLOY.md`](./DEPLOY.md) | Production deployment on a VPS/Node host with nginx, TLS and pm2 |
| [`SECURITY.md`](./SECURITY.md) | Security controls, permission matrix and production checklist |
| [`server/.env.example`](./server/.env.example) | Every backend environment variable, documented |
| [`client/.env.example`](./client/.env.example) | Frontend overrides (usually none needed in dev) |

## Status

All eight delivery modules are built and committed with green test suites:

1. **Foundation** — monorepo, schema, auth + RBAC, seeders, numbering, health check.
2. **Customers + Bookings** — availability, GST/totals snapshot, charges, menus, PDFs, calendar.
3. **Payments** — slips, receipt posting, money-driven status machine.
4. **Accounting** — chart of accounts, derived balances, vouchers, General Ledger, close event.
5. **Reports** — Cash Closing, General Ledger, Supplier Summary, Bookings Master, P&L.
6. **Inventory** — items + stock movements, low-stock alerts.
7. **Assets / Decor / Vendors / Event Costs** — registers, costing and profitability.
8. **Admin + Dashboards** — settings, GST, system lock, users & roles, audit log, role-aware dashboard.

---

<div align="center">
  <sub>Built for Grand Pearl Marquee — bookings, money and operations in one place.</sub>
</div>
