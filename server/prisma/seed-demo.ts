/**
 * Demo data seeder — populates the system with realistic sample records by
 * driving the real services, so bookings, payments, vouchers, totals, stock and
 * profitability are all internally consistent. Additive + guarded (skips if demo
 * data already present). Run: `npm run db:seed:demo`.
 */
import { prisma } from "../src/prisma";
import { env } from "../src/env";
import { getAccountByCode } from "../src/services/accounts";
import { CustomersService } from "../src/modules/customers/customers.service";
import { BookingsService } from "../src/modules/bookings/bookings.service";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { closeEvent } from "../src/services/closeEvent";
import { EventCostsService } from "../src/modules/eventCosts/eventCosts.service";
import { InventoryService } from "../src/modules/inventory/inventory.service";
import { VendorsService } from "../src/modules/vendors/vendors.service";
import { AccountingService } from "../src/modules/accounting/accounting.service";

async function main() {
  const existing = await prisma.booking.count({ where: { deletedAt: null } });
  if (existing >= 6) {
    console.log(`Demo data already present (${existing} bookings) — skipping. Use db:reset to start fresh.`);
    return;
  }

  const admin = await prisma.user.findUnique({ where: { email: env.SEED_ADMIN_EMAIL } });
  const uid = admin?.id;
  const halls = await prisma.hall.findMany({ orderBy: { id: "asc" } });
  const pearl = halls.find((h) => h.slug === "pearl-hall")!.id;
  const emerald = halls.find((h) => h.slug === "emerald-hall")!.id;
  const cash = (await getAccountByCode("1010")).id;

  console.log("Seeding demo data…\n");

  // ── Customers ──────────────────────────────────────────────────────────────
  const hosts = [
    { name: "Imran Khan", careOf: "s/o Jahangir Khan", phone: "03001234501", cnic: "35202-1111111-1", address: "Model Town, Lahore" },
    { name: "Fatima Ali", careOf: "d/o Asghar Ali", phone: "03001234502", cnic: "35202-2222222-2", address: "Bahria Town, Rawalpindi" },
    { name: "Ahmed Raza", phone: "03001234503", cnic: "35202-3333333-3", address: "DHA Phase 5, Lahore" },
    { name: "Sana Malik", phone: "03001234504", cnic: "35202-4444444-4" },
    { name: "Bilal Hussain", phone: "03001234505", cnic: "35202-5555555-5" },
    { name: "Zara Sheikh", phone: "03001234506" },
  ];
  const customers = [];
  for (const h of hosts) customers.push(await CustomersService.create(h));
  console.log(`✔ ${customers.length} customers`);

  // ── Vendors (each auto-links a supplier payable account) ─────────────────────
  const khanCaterers = await VendorsService.create({ name: "Khan Caterers", company: "Khan Foods", phone: "03111000001", openingBalance: 0 });
  await VendorsService.create({ name: "Bright Decorators", phone: "03111000002", openingBalance: 15000 });
  await VendorsService.create({ name: "Cool AC Rentals", phone: "03111000003" });
  await VendorsService.create({ name: "Fresh Flowers", phone: "03111000004" });
  console.log("✔ 4 vendors (+ supplier accounts)");

  // ── Inventory + stock ────────────────────────────────────────────────────────
  const rice = await InventoryService.create({ code: "INV-1001", name: "Basmati Rice", category: "Grocery", unit: "kg", reorderLevel: 100, unitCost: 250 });
  await InventoryService.addMovement({ itemId: rice.id, type: "in", quantity: 500, unitCost: 250, reference: "Opening stock" }, uid);
  const oil = await InventoryService.create({ code: "INV-1002", name: "Cooking Oil", category: "Grocery", unit: "litre", reorderLevel: 50, unitCost: 600 });
  await InventoryService.addMovement({ itemId: oil.id, type: "in", quantity: 200, unitCost: 600 }, uid);
  const chicken = await InventoryService.create({ code: "INV-1003", name: "Chicken", category: "Meat", unit: "kg", reorderLevel: 80, unitCost: 550 });
  await InventoryService.addMovement({ itemId: chicken.id, type: "in", quantity: 120, unitCost: 550 }, uid);
  const plates = await InventoryService.create({ code: "INV-1004", name: "Disposable Plates", category: "Consumables", unit: "pack", reorderLevel: 100, unitCost: 350 });
  await InventoryService.addMovement({ itemId: plates.id, type: "in", quantity: 40 }, uid); // below reorder → low stock
  console.log("✔ 4 inventory items + opening stock (1 low)");

  // ── Assets & decor ───────────────────────────────────────────────────────────
  await prisma.asset.createMany({
    data: [
      { code: "AST-1001", name: "Banquet Chairs", category: "Furniture", quantity: 800, condition: "good", status: "available", purchaseCost: 1200000 },
      { code: "AST-1002", name: "Round Tables", category: "Furniture", quantity: 80, condition: "good", status: "available", purchaseCost: 640000 },
      { code: "AST-1003", name: "Sound System", category: "AV", quantity: 2, condition: "new", status: "available", purchaseCost: 900000 },
      { code: "AST-1004", name: "Crockery Set", category: "Kitchen", quantity: 500, condition: "fair", status: "in_use" },
    ],
  });
  await prisma.decorItem.createMany({
    data: [
      { code: "DEC-1001", name: "Stage Setup (Grand)", quantity: 1, rate: 120000, status: "available" },
      { code: "DEC-1002", name: "Fairy Lighting", quantity: 10, rate: 8000, status: "available" },
      { code: "DEC-1003", name: "Floral Centerpieces", quantity: 60, rate: 2500, status: "available" },
    ],
  });
  console.log("✔ 4 assets, 3 decor items");

  // ── Bookings ─────────────────────────────────────────────────────────────────
  const menu = [
    { name: "Chicken Karahi", urduName: "چکن کڑاہی" },
    { name: "Mutton Pulao", urduName: "مٹن پلاؤ" },
    { name: "Seekh Kabab", urduName: "سیخ کباب" },
    { name: "Zarda", urduName: "زردہ" },
    { name: "Raita", urduName: "رائتہ" },
  ];
  const mk = (customerId: number, hallId: number, eventDate: string, slot: "lunch" | "dinner", guests: number, rack: number, disc: number, charges: { chargeType: string; quantity: number; unitPrice: number }[], eventType: string) =>
    BookingsService.create({ customerId, hallId, eventDate, slot, guests, rackRate: rack, discountedRate: disc, eventType, charges: charges as never, foods: menu }, uid);

  const b1 = (await mk(customers[0]!.id, pearl, "2026-11-15", "dinner", 350, 1600, 1400, [{ chargeType: "dj", quantity: 1, unitPrice: 30000 }, { chargeType: "decor", quantity: 1, unitPrice: 80000 }, { chargeType: "cold_drinks", quantity: 1, unitPrice: 20000 }], "Walima")).booking;
  const b2 = (await mk(customers[1]!.id, emerald, "2026-11-20", "lunch", 200, 1300, 1150, [{ chargeType: "ac_heating", quantity: 1, unitPrice: 25000 }], "Mehndi")).booking;
  const b3 = (await mk(customers[2]!.id, pearl, "2026-12-05", "dinner", 500, 1800, 1650, [{ chargeType: "dj", quantity: 1, unitPrice: 35000 }, { chargeType: "decor", quantity: 1, unitPrice: 120000 }, { chargeType: "mineral_water", quantity: 1, unitPrice: 12000 }], "Baraat")).booking;
  const b4 = (await mk(customers[3]!.id, emerald, "2026-11-15", "dinner", 150, 1400, 1250, [{ chargeType: "cold_drinks", quantity: 1, unitPrice: 10000 }], "Nikah")).booking;
  const b5 = (await mk(customers[4]!.id, pearl, "2026-12-25", "lunch", 400, 1700, 1500, [{ chargeType: "decor", quantity: 1, unitPrice: 90000 }], "Walima")).booking; // stays tentative
  const b6 = (await mk(customers[5]!.id, emerald, "2027-01-10", "dinner", 250, 1500, 1350, [{ chargeType: "dj", quantity: 1, unitPrice: 25000 }], "Mehndi")).booking;
  console.log("✔ 6 bookings (both halls, same-date different-hall shows independence)");

  // ── Payments → statuses ───────────────────────────────────────────────────────
  const grand = async (id: number) => Number((await prisma.booking.findUniqueOrThrow({ where: { id } })).grandTotal);
  const pay = (id: number, amount: number) => PaymentsService.createSlip({ bookingId: id, accountId: cash, amount, method: "cash" }, uid);

  await pay(b1.id, await grand(b1.id)); // full → paid
  await pay(b4.id, await grand(b4.id)); // full → paid
  await pay(b2.id, Math.round((await grand(b2.id)) * 0.4)); // advance → booked
  await pay(b3.id, 200000); // advance → booked
  await pay(b6.id, 100000); // advance → booked
  // b5 stays tentative
  console.log("✔ payments recorded (2 paid, 3 booked, 1 tentative)");

  // ── Close events + costing/profitability (on fully-paid bookings) ──────────────
  await closeEvent(b1.id, uid);
  await EventCostsService.create(b1.id, { costType: "vendor", vendorId: khanCaterers.id, amount: 180000, description: "Catering" }, uid);
  await EventCostsService.create(b1.id, { costType: "inventory", inventoryItemId: rice.id, quantity: 120, description: "Rice consumed" }, uid);
  await EventCostsService.create(b1.id, { costType: "misc", paidFromAccountId: cash, amount: 8000, description: "Fuel & transport" }, uid);
  await closeEvent(b4.id, uid);
  await EventCostsService.create(b4.id, { costType: "misc", paidFromAccountId: cash, amount: 15000, description: "Extra staff" }, uid);
  console.log("✔ 2 events closed (revenue recognised) with costing");

  // ── A few operating expenses (for Cash Closing / P&L realism) ──────────────────
  const ev = (debitCode: string, amount: number, remark: string) =>
    (async () => {
      const dr = await getAccountByCode(debitCode);
      return AccountingService.postManualVoucher({ type: "EV", debitAccountId: dr.id, creditAccountId: cash, amount, category: "Operating", remark }, uid);
    })();
  await ev("5300", 120000, "Staff salaries");
  await ev("5400", 90000, "Hall rent");
  await ev("5500", 35000, "Electricity & gas");
  console.log("✔ operating expense vouchers");

  console.log("\nDemo data seeded.");
}

main()
  .catch((e) => { console.error("Demo seed failed:", e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
