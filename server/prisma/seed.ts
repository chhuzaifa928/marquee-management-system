import { PrismaClient, type AccountType } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { encryptCnic, cnicBlindIndex } from "../src/lib/crypto";
import { ROLE_LABELS, ROLES } from "../src/auth/rbac";
import { env } from "../src/env";

const prisma = new PrismaClient();

// ── Chart of accounts (§6.1) ─────────────────────────────────────────────────
interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
}

const CHART_OF_ACCOUNTS: SeedAccount[] = [
  // 1000 Assets
  { code: "1010", name: "Cash", type: "cash" },
  { code: "1020", name: "Petty Cash", type: "cash" },
  { code: "1101", name: "Bank Account 1", type: "bank" },
  { code: "1102", name: "Bank Account 2", type: "bank" },
  { code: "1201", name: "Staff / Holding", type: "staff" },
  { code: "1500", name: "Inventory", type: "asset" },
  { code: "1600", name: "Fixed Assets", type: "asset" },
  // 2000 Liabilities
  { code: "2100", name: "Customer Advances", type: "liability" },
  { code: "2200", name: "GST Payable", type: "liability" },
  { code: "2301", name: "Suppliers Payable — General", type: "supplier" },
  // 3000 Equity
  { code: "3000", name: "Owner Capital", type: "equity" },
  // 4000 Income
  { code: "4100", name: "Food Sales", type: "income" },
  { code: "4200", name: "Hall Charges", type: "income" },
  { code: "4300", name: "AC / Heating", type: "income" },
  { code: "4400", name: "DJ", type: "income" },
  { code: "4500", name: "Decor Sale", type: "income" },
  { code: "4600", name: "Cold Drink & Water", type: "income" },
  { code: "4900", name: "Other Charges", type: "income" },
  // 5000 Expenses
  { code: "5100", name: "Meat", type: "expense" },
  { code: "5150", name: "Spices", type: "expense" },
  { code: "5200", name: "Grocery", type: "expense" },
  { code: "5300", name: "Salary", type: "expense" },
  { code: "5400", name: "Rent", type: "expense" },
  { code: "5500", name: "Utilities", type: "expense" },
  { code: "5600", name: "Event Consumables", type: "expense" },
  { code: "5700", name: "Fuel", type: "expense" },
  { code: "5800", name: "Maintenance", type: "expense" },
];

const HALLS = [
  { name: "Pearl Hall", slug: "pearl-hall" },
  { name: "Emerald Hall", slug: "emerald-hall" },
];

async function seedRoles() {
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: { label: ROLE_LABELS[name] },
      create: { name, label: ROLE_LABELS[name] },
    });
  }
  console.log(`✔ roles (${ROLES.length})`);
}

async function seedSettings() {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      gstRate: 16,
      companyName: "Grand Pearl Marquee",
      currency: "PKR",
    },
  });
  console.log("✔ settings (singleton)");
}

async function seedHalls() {
  for (const hall of HALLS) {
    await prisma.hall.upsert({
      where: { slug: hall.slug },
      update: { name: hall.name },
      create: hall,
    });
  }
  console.log(`✔ halls (${HALLS.length})`);
}

async function seedChartOfAccounts() {
  for (const acc of CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: { name: acc.name, type: acc.type },
      create: { ...acc, openingBalance: 0 },
    });
  }
  console.log(`✔ chart of accounts (${CHART_OF_ACCOUNTS.length})`);
}

async function createUserWithRole(
  name: string,
  email: string,
  password: string,
  roleName: string,
) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { name, email, passwordHash, isActive: true },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  return user;
}

async function seedUsers() {
  await createUserWithRole(
    "Super Admin",
    env.SEED_ADMIN_EMAIL,
    env.SEED_ADMIN_PASSWORD,
    "super_admin",
  );
  console.log(`✔ super_admin  (${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD})`);

  if (!env.SEED_DEMO_DATA) return;

  const demoRoles = ["admin", "sales", "accounts", "inventory", "decor"] as const;
  for (const roleName of demoRoles) {
    const email = `${roleName}@grandpearl.local`;
    await createUserWithRole(
      `Demo ${ROLE_LABELS[roleName]}`,
      email,
      env.SEED_ADMIN_PASSWORD,
      roleName,
    );
    console.log(`✔ demo user    (${email} / ${env.SEED_ADMIN_PASSWORD})  [${roleName}]`);
  }
}

async function seedDemoData() {
  if (!env.SEED_DEMO_DATA) return;

  // A demo customer with an encrypted CNIC + blind index (exercises crypto).
  const cnic = "3520212345671";
  await prisma.customer.upsert({
    where: { code: "CUST-0001" },
    update: {},
    create: {
      code: "CUST-0001",
      name: "Demo Customer",
      careOf: "s/o Demo",
      phone: "03001234567",
      cnicEnc: encryptCnic(cnic),
      cnicIndex: cnicBlindIndex(cnic),
      email: "demo.customer@example.com",
      address: "Demo Street, Lahore",
    },
  });
  // Keep the customer_code sequence consistent with the seeded CUST-0001.
  await prisma.numberSequence.upsert({
    where: { key: "customer_code" },
    update: {},
    create: { key: "customer_code", next: 2 },
  });

  // A couple of inventory items + an asset + a decor item for walkthroughs.
  await prisma.inventoryItem.upsert({
    where: { code: "INV-0001" },
    update: {},
    create: {
      code: "INV-0001",
      name: "Chairs (banquet)",
      category: "Furniture",
      unit: "pcs",
      reorderLevel: 50,
      unitCost: 1500,
    },
  });
  await prisma.asset.upsert({
    where: { code: "AST-0001" },
    update: {},
    create: { code: "AST-0001", name: "Generator 25kVA", category: "Power", quantity: 1 },
  });
  await prisma.decorItem.upsert({
    where: { code: "DEC-0001" },
    update: {},
    create: { code: "DEC-0001", name: "Stage Backdrop (floral)", quantity: 2, rate: 25000 },
  });

  console.log("✔ demo data    (1 customer, 1 inventory item, 1 asset, 1 decor item)");
}

async function main() {
  console.log("Seeding Grand Pearl Marquee database…\n");
  await seedRoles();
  await seedSettings();
  await seedHalls();
  await seedChartOfAccounts();
  await seedUsers();
  await seedDemoData();
  console.log("\nSeed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
