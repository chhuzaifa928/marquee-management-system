import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedAccounts, seedHalls, seedRoles, seedSettings } from "./helpers";
import { BookingTotals } from "../src/services/bookingTotals";

const app = createApp();
const TODAY = new Date().toISOString().slice(0, 10);

let hallId: number;
let customerId: number;
let acc: Record<string, number>;

async function base() {
  await seedRoles();
  await seedSettings();
  acc = await seedAccounts();
  const halls = await seedHalls();
  hallId = halls["Pearl Hall"]!;
  const c = await prisma.customer.create({ data: { code: "CUST-0001", name: "Host" } });
  customerId = c.id;
}

async function paidClosedBooking(agent: Awaited<ReturnType<typeof authAgent>>) {
  const b = await prisma.booking.create({
    data: {
      bookingNo: `BKG-${Math.floor(Math.random() * 1e6)}`,
      customerId, hallId, eventDate: new Date("2026-12-25T00:00:00Z"),
      slot: "dinner", guests: 100, discountedRate: 1000, gstRate: 16,
      charges: { create: [{ chargeType: "dj", quantity: 1, unitPrice: 20000, amount: 20000 }] },
    },
  });
  await BookingTotals.recompute(b.id);
  await agent.post("/api/payments/slips").send({ bookingId: b.id, accountId: acc["1010"], amount: 139200 });
  await agent.post(`/api/accounting/bookings/${b.id}/close`);
  return b.id;
}

describe("Reports", () => {
  beforeEach(base);

  it("Cash Closing shows opening, collections, payments and closing per account", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    await paidClosedBooking(accounts); // RV Dr Cash 139200
    await accounts.post("/api/accounting/vouchers").send({ type: "EV", debitAccountId: acc["5600"], creditAccountId: acc["1010"], amount: 5000, remark: "Grocery" });

    const res = await accounts.get("/api/reports/cash-closing").query({ from: TODAY, to: TODAY });
    expect(res.status).toBe(200);
    const cash = res.body.sections.find((s: { account: { code: string } }) => s.account.code === "1010");
    expect(cash.opening).toBe("0.00");
    expect(cash.totalIn).toBe("139200.00");
    expect(cash.totalOut).toBe("5000.00");
    expect(cash.closing).toBe("134200.00");
  });

  it("Profit & Loss nets income heads against expenses", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    await paidClosedBooking(accounts); // income 120000 + GST (GST not income)
    await accounts.post("/api/accounting/vouchers").send({ type: "EV", debitAccountId: acc["5600"], creditAccountId: acc["1010"], amount: 5000 });

    const res = await accounts.get("/api/reports/profit-loss").query({ from: TODAY, to: TODAY });
    expect(res.body.totals.income).toBe("120000.00"); // Food 100000 + DJ 20000
    expect(res.body.totals.expense).toBe("5000.00");
    expect(res.body.totals.netProfit).toBe("115000.00");
  });

  it("Supplier Summary shows opening, receivings, payments and balance", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    // Goods received on credit: Dr expense / Cr supplier 3000. Payment: Dr supplier / Cr cash 1000.
    await accounts.post("/api/accounting/vouchers").send({ type: "EV", debitAccountId: acc["5600"], creditAccountId: acc["2301"], amount: 3000 });
    await accounts.post("/api/accounting/vouchers").send({ type: "PV", debitAccountId: acc["2301"], creditAccountId: acc["1010"], amount: 1000 });

    const res = await accounts.get("/api/reports/supplier-summary").query({ from: TODAY, to: TODAY });
    const row = res.body.rows.find((r: { code: string }) => r.code === "2301");
    expect(row.receivings).toBe("3000.00");
    expect(row.payments).toBe("1000.00");
    expect(row.balance).toBe("2000.00");
  });

  it("Bookings Master lists events with totals and net profit", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    await paidClosedBooking(accounts);
    const res = await accounts.get("/api/reports/bookings-master").query({ from: "2026-12-01", to: "2026-12-31" });
    expect(res.body.count).toBe(1);
    expect(res.body.totals.total).toBe("139200.00");
    expect(res.body.totals.payments).toBe("139200.00");
    expect(res.body.totals.balance).toBe("0.00");
    expect(res.body.totals.netProfit).toBe("139200.00"); // no event costs yet
  });

  it("exports a report as PDF", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const res = await accounts
      .get("/api/reports/profit-loss")
      .query({ from: TODAY, to: TODAY, format: "pdf" })
      .buffer(true)
      .parse((r, cb) => { const ch: Buffer[] = []; r.on("data", (c: Buffer) => ch.push(c)); r.on("end", () => cb(null, Buffer.concat(ch))); });
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).slice(0, 4).toString()).toBe("%PDF");
  });

  it("RBAC: sales see only bookings-master (scoped), not financial reports", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    expect((await sales.get("/api/reports/cash-closing").query({ from: TODAY, to: TODAY })).status).toBe(403);
    expect((await sales.get("/api/reports/profit-loss").query({ from: TODAY, to: TODAY })).status).toBe(403);
    expect((await sales.get("/api/reports/bookings-master").query({ from: "2026-12-01", to: "2026-12-31" })).status).toBe(200);
  });

  it("scopes the Bookings Master to the salesperson's own bookings", async () => {
    // Two sales users; each creates a booking; each sees only their own in the report.
    const salesA = await authAgent(app, { email: "a@gp.local", roles: ["sales"] });
    const salesB = await authAgent(app, { email: "b@gp.local", roles: ["sales"] });
    const body = { customerId, hallId, eventDate: "2026-12-10", slot: "dinner", guests: 50, rackRate: 1000, discountedRate: 900 };
    await salesA.post("/api/bookings").send(body);
    await salesB.post("/api/bookings").send(body);

    const aRep = await salesA.get("/api/reports/bookings-master").query({ from: "2026-12-01", to: "2026-12-31" });
    expect(aRep.body.count).toBe(1); // only A's booking
  });
});
