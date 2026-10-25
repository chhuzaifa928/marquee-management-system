import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedAccounts, seedHalls, seedRoles, seedSettings } from "./helpers";

const app = createApp();

let hallId: number;
let customerId: number;
let cashId: number;
let advancesId: number;

async function base() {
  await seedRoles();
  await seedSettings();
  const halls = await seedHalls();
  hallId = halls["Pearl Hall"]!;
  const accounts = await seedAccounts();
  cashId = accounts["1010"]!;
  advancesId = accounts["2100"]!;
  const c = await prisma.customer.create({ data: { code: "CUST-0001", name: "Host" } });
  customerId = c.id;
}

/** Create a booking directly (grand total = rate*guests + GST). */
async function makeBooking(overrides: Partial<{ guests: number; rate: number; date: string }> = {}) {
  const guests = overrides.guests ?? 100;
  const rate = overrides.rate ?? 1000;
  // grand = 100000 + 16% = 116000 at defaults
  const b = await prisma.booking.create({
    data: {
      bookingNo: `BKG-${Math.floor(Math.random() * 1e6)}`,
      customerId,
      hallId,
      eventDate: new Date(overrides.date ?? "2026-12-25T00:00:00Z"),
      slot: "dinner",
      guests,
      discountedRate: rate,
      gstRate: 16,
    },
  });
  // Persist snapshot totals.
  const { BookingTotals } = await import("../src/services/bookingTotals");
  await BookingTotals.recompute(b.id);
  return b.id;
}

describe("Payments — RV posting + status machine", () => {
  beforeEach(base);

  it("records a slip, posts a balanced RV (Dr cash, Cr advances), links it", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking();

    const res = await sales
      .post("/api/payments/slips")
      .send({ bookingId, accountId: cashId, amount: 50000, method: "cash" });
    expect(res.status).toBe(201);
    expect(res.body.slipNo).toBe("SLIP-0001");

    const slip = await prisma.paymentSlip.findFirstOrThrow({ where: { bookingId } });
    expect(slip.voucherId).toBeTruthy();
    const voucher = await prisma.voucher.findUniqueOrThrow({ where: { id: slip.voucherId! } });
    expect(voucher.type).toBe("RV");
    expect(voucher.voucherNo).toBe("RV-0001");
    expect(voucher.debitAccountId).toBe(cashId); // Dr Cash
    expect(voucher.creditAccountId).toBe(advancesId); // Cr Customer Advances
    expect(voucher.amount.toFixed(2)).toBe("50000.00"); // gross
  });

  it("first advance confirms a tentative booking → booked (slot open)", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking();
    const res = await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 50000 });
    expect(res.body.bookingStatus).toBe("booked");
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.confirmedAt).not.toBeNull();
    expect(b.isLocked).toBe(false);
  });

  it("full payment marks the booking paid + locked", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking(); // grand 116000
    await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 116000 });
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("paid");
    expect(b.isLocked).toBe(true);
    expect(b.due.toFixed(2)).toBe("0.00");
  });

  it("first-to-pay wins: a second tentative on the same slot stays tentative", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const a = await makeBooking();
    const b = await makeBooking(); // same hall/date/slot
    // A pays first → A booked.
    const payA = await sales.post("/api/payments/slips").send({ bookingId: a, accountId: cashId, amount: 50000 });
    expect(payA.body.bookingStatus).toBe("booked");
    // B pays → slot already confirmed by A, so B stays tentative (payment still recorded).
    const payB = await sales.post("/api/payments/slips").send({ bookingId: b, accountId: cashId, amount: 50000 });
    expect(payB.body.bookingStatus).toBe("tentative");
    const bb = await prisma.booking.findUniqueOrThrow({ where: { id: b } });
    expect(bb.advanceTotal.toFixed(2)).toBe("50000.00"); // money captured
  });

  it("deleting the slip (super_admin) reverses the RV and reverts status", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });
    const bookingId = await makeBooking();

    await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 116000 });
    let b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("paid");

    const slip = await prisma.paymentSlip.findFirstOrThrow({ where: { bookingId } });
    const del = await boss.delete(`/api/payments/slips/${slip.id}`);
    expect(del.status).toBe(200);

    b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("tentative"); // all advance removed → slot released
    expect(b.advanceTotal.toFixed(2)).toBe("0.00");
    const voucher = await prisma.voucher.findFirstOrThrow({ where: { sourceId: slip.id, sourceType: "paymentSlip" } });
    expect(voucher.deletedAt).not.toBeNull(); // RV reversed
    const reread = await prisma.paymentSlip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(reread.deletedAt).not.toBeNull();
  });

  it("paid → booked revert when a partial payment remains after a drop", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });
    const bookingId = await makeBooking(); // grand 116000

    await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 66000 });
    await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 50000 });
    let b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("paid");

    // Remove the second slip → 66000 remains (partial) → revert to booked.
    const slips = await prisma.paymentSlip.findMany({ where: { bookingId }, orderBy: { id: "asc" } });
    const del = await boss.delete(`/api/payments/slips/${slips[1]!.id}`);
    expect(del.status).toBe(200);
    b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe("booked");
    expect(b.isLocked).toBe(false);
  });

  it("allocates gapless slip numbers", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking();
    const r1 = await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 1000 });
    const r2 = await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 1000 });
    expect([r1.body.slipNo, r2.body.slipNo]).toEqual(["SLIP-0001", "SLIP-0002"]);
  });

  it("forbids a non-super_admin from deleting a slip", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking();
    await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 1000 });
    const slip = await prisma.paymentSlip.findFirstOrThrow({ where: { bookingId } });
    const del = await sales.delete(`/api/payments/slips/${slip.id}`);
    expect(del.status).toBe(403);
  });

  it("rejects payment into a non-cash/bank account", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking();
    const res = await sales.post("/api/payments/slips").send({ bookingId, accountId: advancesId, amount: 1000 });
    expect(res.status).toBe(400);
  });

  it("rejects payment against a cancelled booking", async () => {
    const sales = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const bookingId = await makeBooking();
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "cancelled" } });
    const res = await sales.post("/api/payments/slips").send({ bookingId, accountId: cashId, amount: 1000 });
    expect(res.status).toBe(400);
  });
});
