import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/prisma";
import { hashPassword } from "../src/lib/password";
import { ROLE_LABELS, ROLES, type RoleName } from "../src/auth/rbac";

// All mapped table names, children-first is unnecessary because we disable FK
// checks around the truncation.
const TABLES = [
  "audits",
  "event_costs",
  "vouchers",
  "payment_slips",
  "booking_foods",
  "booking_charges",
  "stock_movements",
  "bookings",
  "inventory_items",
  "vendors",
  "accounts",
  "customers",
  "halls",
  "settings",
  "number_sequences",
  "user_roles",
  "roles",
  "users",
];

/** Wipe every table — called before each test for isolation. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
}

/** Seed the six roles; returns a name→id map. */
export async function seedRoles(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  for (const name of ROLES) {
    const role = await prisma.role.create({
      data: { name, label: ROLE_LABELS[name] },
    });
    map[name] = role.id;
  }
  return map;
}

/** Ensure the settings singleton exists; optionally lock the system. */
export async function seedSettings(opts: { systemLocked?: boolean } = {}) {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: { systemLocked: opts.systemLocked ?? false },
    create: { id: 1, systemLocked: opts.systemLocked ?? false },
  });
}

/** Create a user holding the given roles (roles must be seeded first). */
export async function createUser(opts: {
  name?: string;
  email: string;
  password?: string;
  roles: RoleName[];
  isActive?: boolean;
}) {
  const passwordHash = await hashPassword(opts.password ?? "Password!123");
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? opts.email,
      email: opts.email,
      passwordHash,
      isActive: opts.isActive ?? true,
    },
  });
  for (const roleName of opts.roles) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return user;
}

/** Seed the chart-of-accounts entries used by posting logic; returns code→id. */
export async function seedAccounts(): Promise<Record<string, number>> {
  const defs: { code: string; name: string; type: import("@prisma/client").AccountType }[] = [
    { code: "1010", name: "Cash", type: "cash" },
    { code: "1101", name: "Bank Account 1", type: "bank" },
    { code: "1201", name: "Staff / Holding", type: "staff" },
    { code: "1500", name: "Inventory", type: "asset" },
    { code: "2100", name: "Customer Advances", type: "liability" },
    { code: "2200", name: "GST Payable", type: "liability" },
    { code: "2301", name: "Suppliers Payable — General", type: "supplier" },
    { code: "4100", name: "Food Sales", type: "income" },
    { code: "4200", name: "Hall Charges", type: "income" },
    { code: "4400", name: "DJ", type: "income" },
    { code: "5600", name: "Event Consumables", type: "expense" },
  ];
  const map: Record<string, number> = {};
  for (const a of defs) {
    const acc = await prisma.account.create({ data: { ...a, openingBalance: 0 } });
    map[a.code] = acc.id;
  }
  return map;
}

/** Seed the two halls; returns name→id. */
export async function seedHalls(): Promise<Record<string, number>> {
  const defs = [
    { name: "Pearl Hall", slug: "pearl-hall" },
    { name: "Emerald Hall", slug: "emerald-hall" },
  ];
  const map: Record<string, number> = {};
  for (const h of defs) {
    const hall = await prisma.hall.create({ data: h });
    map[h.name] = hall.id;
  }
  return map;
}

/** Create a user with the given roles and return a logged-in supertest agent. */
export async function authAgent(
  app: Express,
  opts: { email: string; password?: string; roles: RoleName[] },
) {
  const password = opts.password ?? "Password!123";
  await createUser({ email: opts.email, password, roles: opts.roles });
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ email: opts.email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${opts.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}
