import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedAccounts, seedHalls, seedRoles, seedSettings } from "./helpers";
import { BookingTotals } from "../src/services/bookingTotals";
import { AccountBalance } from "../src/services/accountBalance";

const app = createApp();

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

async function paidBooking() {
  const b = await prisma.booking.create({
    data: {
      bookingNo: `BKG-${Math.floor(Math.random() * 1e6)}`,
      customerId, hallId, eventDate: new Date("2026-12-25T00:00:00Z"),
      slot: "dinner", guests: 100, discountedRate: 1000, gstRate: 16,
      charges: { create: [{ chargeType: "dj", quantity: 1, unitPrice: 20000, amount: 20000 }] },
    },
  });
  await BookingTotals.recompute(b.id);
  return b.id;
}

describe("AccountBalance — derived balances", () => {
  beforeEach(base);

  it("derives debit-normal and credit-normal balances from postings", async () => {
    // Opening: Cash 1000 (debit-normal), Owner-less test. Post a voucher Dr Cash / Cr Advances 500.
    await prisma.account.update({ where: { id: acc["1010"]! }, data: { openingBalance: 1000 } });
    await prisma.voucher.create({
      data: { voucherNo: "RV-0001", type: "RV", debitAccountId: acc["1010"]!, creditAccountId: acc["2100"]!, amount: 500 },
    });
    // Cash (debit-normal): 1000 + 500 = 1500
    expect((await AccountBalance.balanceAsOf(acc["1010"]!)).toFixed(2)).toBe("1500.00");
    // Customer Advances (credit-normal liability): 0 + 500 credited = 500
    expect((await AccountBalance.balanceAsOf(acc["2100"]!)).toFixed(2)).toBe("500.00");
  });

  it("computes opening/movement/closing for a General Ledger range", async () => {
    await prisma.voucher.create({ data: { voucherNo: "RV-0001", type: "RV", debitAccountId: acc["1010"]!, creditAccountId: acc["2100"]!, amount: 100, date: new Date("2026-01-10") } });
    await prisma.voucher.create({ data: { voucherNo: "RV-0002", type: "RV", debitAccountId: acc["1010"]!, creditAccountId: acc["2100"]!, amount: 50, date: new Date("2026-02-15") } });
    const led = await AccountBalance.ledger(acc["1010"]!, { from: new Date("2026-02-01"), to: new Date("2026-02-28") });
    expect(led.opening.toFixed(2)).toBe("100.00"); // Jan posting before range
    expect(led.movementDebit.toFixed(2)).toBe("50.00");
    expect(led.closing.toFixed(2)).toBe("150.00");
  });
});

describe("Close Event — revenue recognition (JV batch)", () => {
  beforeEach(base);

  it("posts a balanced JV batch and nets Customer Advances to zero", async () => {
    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await paidBooking();
    // Pay in full first (grand 139200) so the booking is paid + locked.
    await accountsAgent.post("/api/payments/slips").send({ bookingId, accountId: acc["1010"], amount: 139200 });

    const close = await accountsAgent.post(`/api/accounting/bookings/${bookingId}/close`);
    expect(close.status).toBe(200);
    expect(close.body.alreadyClosed).toBe(false);

    // Income heads credited net of GST.
    expect((await AccountBalance.balanceAsOf(acc["4100"]!)).toFixed(2)).toBe("100000.00"); // Food Sales (headcharge)
    expect((await AccountBalance.balanceAsOf(acc["4400"]!)).toFixed(2)).toBe("20000.00"); // DJ
    expect((await AccountBalance.balanceAsOf(acc["2200"]!)).toFixed(2)).toBe("19200.00"); // GST Payable
    // Cash holds the full receipt; Customer Advances nets to zero (received then recognised).
    expect((await AccountBalance.balanceAsOf(acc["1010"]!)).toFixed(2)).toBe("139200.00");
    expect((await AccountBalance.balanceAsOf(acc["2100"]!)).toFixed(2)).toBe("0.00");
  });

  it("is idempotent and reversible", async () => {
    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });
    const bookingId = await paidBooking();
    await accountsAgent.post("/api/payments/slips").send({ bookingId, accountId: acc["1010"], amount: 139200 });

    await accountsAgent.post(`/api/accounting/bookings/${bookingId}/close`);
    const again = await accountsAgent.post(`/api/accounting/bookings/${bookingId}/close`);
    expect(again.body.alreadyClosed).toBe(true); // idempotent

    const liveBefore = await prisma.voucher.count({ where: { sourceId: bookingId, sourceType: "booking", type: "JV", deletedAt: null } });
    expect(liveBefore).toBeGreaterThan(0);

    const reopen = await boss.post(`/api/accounting/bookings/${bookingId}/reopen`);
    expect(reopen.status).toBe(200);
    const liveAfter = await prisma.voucher.count({ where: { sourceId: bookingId, sourceType: "booking", type: "JV", deletedAt: null } });
    expect(liveAfter).toBe(0); // batch reversed
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.eventClosedAt).toBeNull();
    // Advances restored to the receipt amount (only RV remains).
    expect((await AccountBalance.balanceAsOf(acc["2100"]!)).toFixed(2)).toBe("139200.00");
  });

  it("refuses to close a booking that is not fully paid", async () => {
    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await paidBooking();
    await accountsAgent.post("/api/payments/slips").send({ bookingId, accountId: acc["1010"], amount: 1000 }); // partial
    const close = await accountsAgent.post(`/api/accounting/bookings/${bookingId}/close`);
    expect(close.status).toBe(400);
  });
});

describe("Accounting RBAC + manual vouchers", () => {
  beforeEach(base);

  it("accounts can post a manual EV; it balances; admin cannot post", async () => {
    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const post = await accountsAgent.post("/api/accounting/vouchers").send({
      type: "EV", debitAccountId: acc["5600"], creditAccountId: acc["1010"], amount: 3000, category: "Kitchen", remark: "Grocery",
    });
    expect(post.status).toBe(201);
    expect(post.body.voucherNo).toBe("EV-0001");

    const adminAgent = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const denied = await adminAgent.post("/api/accounting/vouchers").send({
      type: "EV", debitAccountId: acc["5600"], creditAccountId: acc["1010"], amount: 1000,
    });
    expect(denied.status).toBe(403); // admin may view accounting but not post vouchers
  });

  it("rejects an unbalanced voucher (same debit and credit account)", async () => {
    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const res = await accountsAgent.post("/api/accounting/vouchers").send({
      type: "PV", debitAccountId: acc["1010"], creditAccountId: acc["1010"], amount: 100,
    });
    expect(res.status).toBe(400);
  });

  it("admin manages the chart; accounts cannot", async () => {
    const adminAgent = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const created = await adminAgent.post("/api/accounting/accounts").send({ code: "4950", name: "Misc Income", type: "income" });
    expect(created.status).toBe(201);

    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const denied = await accountsAgent.post("/api/accounting/accounts").send({ code: "4960", name: "Nope", type: "income" });
    expect(denied.status).toBe(403);
  });

  it("sales cannot reach the accounting module at all", async () => {
    const salesAgent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    expect((await salesAgent.get("/api/accounting/accounts")).status).toBe(403);
  });

  it("general ledger returns running balances", async () => {
    const accountsAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    await accountsAgent.post("/api/accounting/vouchers").send({ type: "EV", debitAccountId: acc["5600"], creditAccountId: acc["1010"], amount: 3000, date: "2026-03-10" });
    const gl = await accountsAgent.get(`/api/accounting/accounts/${acc["5600"]}/ledger`).query({ from: "2026-03-01", to: "2026-03-31" });
    expect(gl.status).toBe(200);
    expect(gl.body.rows).toHaveLength(1);
    expect(gl.body.closing).toBe("3000.00"); // expense debit-normal
  });
});
