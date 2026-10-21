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
