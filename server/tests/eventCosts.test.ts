import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedAccounts, seedHalls, seedRoles, seedSettings } from "./helpers";
import { BookingTotals } from "../src/services/bookingTotals";
import { AccountBalance } from "../src/services/accountBalance";

const app = createApp();
let hallId: number, customerId: number, acc: Record<string, number>;

async function base() {
  await seedRoles();
  await seedSettings();
  acc = await seedAccounts();
  const halls = await seedHalls();
  hallId = halls["Pearl Hall"]!;
  customerId = (await prisma.customer.create({ data: { code: "CUST-0001", name: "Host" } })).id;
}

async function paidBooking(accountsAgent: Awaited<ReturnType<typeof authAgent>>) {
  const b = await prisma.booking.create({
    data: { bookingNo: `BKG-${Math.floor(Math.random() * 1e6)}`, customerId, hallId, eventDate: new Date("2026-12-25T00:00:00Z"), slot: "dinner", guests: 100, discountedRate: 1000, gstRate: 16 },
  });
  await BookingTotals.recompute(b.id); // grand = 116000
  await accountsAgent.post("/api/payments/slips").send({ bookingId: b.id, accountId: acc["1010"], amount: 116000 });
  return b.id;
}

describe("Event costs + profitability", () => {
  beforeEach(base);

  it("refuses costing before the booking is fully paid", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const b = await prisma.booking.create({ data: { bookingNo: "BKG-X", customerId, hallId, eventDate: new Date("2026-12-25"), slot: "dinner", guests: 10, discountedRate: 100, gstRate: 16 } });
    await BookingTotals.recompute(b.id);
    const res = await accounts.post(`/api/event-costs/bookings/${b.id}`).send({ costType: "misc", amount: 500, paidFromAccountId: acc["1010"] });
    expect(res.status).toBe(400);
  });

  it("vendor cost posts EV (Dr expense, Cr supplier) and reduces net profit", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await paidBooking(accounts);
    const vendor = await admin.post("/api/vendors").send({ name: "Caterer", openingBalance: 0 });

    const res = await accounts.post(`/api/event-costs/bookings/${bookingId}`).send({ costType: "vendor", vendorId: vendor.body.id, expenseAccountId: acc["5600"], amount: 30000 });
    expect(res.status).toBe(201);
    expect(res.body.totalCost).toBe("30000.00");
    expect(res.body.netProfit).toBe("86000.00"); // 116000 - 30000
    // Expense debit-normal increased; supplier payable credited.
    expect((await AccountBalance.balanceAsOf(acc["5600"]!)).toFixed(2)).toBe("30000.00");
    expect((await AccountBalance.balanceAsOf(vendor.body.account.id)).toFixed(2)).toBe("30000.00");
  });

  it("inventory cost deducts stock and posts JV (Dr expense, Cr Inventory)", async () => {
    const inv = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await paidBooking(accounts);
    const item = await inv.post("/api/inventory/items").send({ code: "INV-0001", name: "Rice", unit: "kg", unitCost: 200 });
    await inv.post(`/api/inventory/items/${item.body.id}/movements`).send({ type: "in", quantity: 100 });

    const res = await accounts.post(`/api/event-costs/bookings/${bookingId}`).send({ costType: "inventory", inventoryItemId: item.body.id, quantity: 40 });
    expect(res.status).toBe(201);
    expect(res.body.totalCost).toBe("8000.00"); // 40 × 200
    const reread = await inv.get(`/api/inventory/items/${item.body.id}`);
    expect(reread.body.item.qtyOnHand).toBe("60.00"); // 100 - 40
    expect((await AccountBalance.balanceAsOf(acc["1500"]!)).toFixed(2)).toBe("-8000.00"); // Inventory (asset) credited
  });

  it("misc cost posts EV against cash", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await paidBooking(accounts);
    const res = await accounts.post(`/api/event-costs/bookings/${bookingId}`).send({ costType: "misc", paidFromAccountId: acc["1010"], expenseAccountId: acc["5600"], amount: 2500, description: "Fuel" });
    expect(res.body.totalCost).toBe("2500.00");
  });

  it("super_admin delete reverses the voucher and restocks inventory", async () => {
    const inv = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });
    const bookingId = await paidBooking(accounts);
    const item = await inv.post("/api/inventory/items").send({ code: "INV-0002", name: "Oil", unitCost: 500 });
    await inv.post(`/api/inventory/items/${item.body.id}/movements`).send({ type: "in", quantity: 50 });
    const cost = await accounts.post(`/api/event-costs/bookings/${bookingId}`).send({ costType: "inventory", inventoryItemId: item.body.id, quantity: 10 });
    const costId = cost.body.costs[0].id;

    const del = await boss.delete(`/api/event-costs/${costId}`);
    expect(del.status).toBe(200);
    expect(del.body.totalCost).toBe("0.00");
    const reread = await inv.get(`/api/inventory/items/${item.body.id}`);
    expect(reread.body.item.qtyOnHand).toBe("50.00"); // restocked
  });

  it("RBAC: admin cannot enter event costs; accounts can; non-super cannot delete", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await paidBooking(accounts);

    const adminTry = await admin.post(`/api/event-costs/bookings/${bookingId}`).send({ costType: "misc", paidFromAccountId: acc["1010"], amount: 100 });
    expect(adminTry.status).toBe(403); // event costing is accounts-only

    const created = await accounts.post(`/api/event-costs/bookings/${bookingId}`).send({ costType: "misc", paidFromAccountId: acc["1010"], amount: 100 });
    const costId = created.body.costs[0].id;
    expect((await accounts.delete(`/api/event-costs/${costId}`)).status).toBe(403); // delete is super-only
  });
});
