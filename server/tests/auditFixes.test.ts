import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedAccounts, seedHalls, seedRoles, seedSettings } from "./helpers";
import { BookingTotals } from "../src/services/bookingTotals";

const app = createApp();
let pearl: number;
let customerId: number;
let acc: Record<string, number>;

async function base() {
  await seedRoles();
  await seedSettings();
  acc = await seedAccounts();
  pearl = (await seedHalls())["Pearl Hall"]!;
  customerId = (await prisma.customer.create({ data: { code: "CUST-0001", name: "Host" } })).id;
}

async function booking(date: string, guests = 10, rate = 100) {
  const b = await prisma.booking.create({
    data: { bookingNo: `BKG-${Math.floor(Math.random() * 1e6)}`, customerId, hallId: pearl, eventDate: new Date(date), slot: "dinner", guests, discountedRate: rate, gstRate: 16 },
  });
  await BookingTotals.recompute(b.id);
  return b.id;
}

describe("Audit fixes", () => {
  beforeEach(base);

  it("#1 a closed event rejects slip create and delete until reopened", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });
    const id = await booking("2026-12-25"); // grand 1160
    await accounts.post("/api/payments/slips").send({ bookingId: id, accountId: acc["1010"], amount: 1160 });
    await accounts.post(`/api/accounting/bookings/${id}/close`);

    const slip = await prisma.paymentSlip.findFirstOrThrow({ where: { bookingId: id, deletedAt: null } });
    expect((await boss.delete(`/api/payments/slips/${slip.id}`)).status).toBe(409);
    expect((await accounts.post("/api/payments/slips").send({ bookingId: id, accountId: acc["1010"], amount: 100 })).status).toBe(409);

    // After reopen, deletion is allowed again.
    await boss.post(`/api/accounting/bookings/${id}/reopen`);
    expect((await boss.delete(`/api/payments/slips/${slip.id}`)).status).toBe(200);
  });

  it("#3 moving a confirmed booking onto a taken slot is rejected", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const a = await booking("2026-12-01");
    const b = await booking("2026-12-02");
    // Confirm both (first advance → booked).
    await accounts.post("/api/payments/slips").send({ bookingId: a, accountId: acc["1010"], amount: 100 });
    await accounts.post("/api/payments/slips").send({ bookingId: b, accountId: acc["1010"], amount: 100 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b } })).status).toBe("booked");

    // Move B onto A's (now confirmed) slot → conflict.
    const res = await sales.put(`/api/bookings/${b}`).send({ eventDate: "2026-12-01" });
    expect(res.status).toBe(409);
  });

  it("#4 stock cannot go negative (movement or inventory event cost)", async () => {
    const inv = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const item = (await inv.post("/api/inventory/items").send({ code: "INV-9001", name: "Sugar", unit: "kg", unitCost: 100 })).body;
    await inv.post(`/api/inventory/items/${item.id}/movements`).send({ type: "in", quantity: 10 });

    // Out more than on hand → 400.
    expect((await inv.post(`/api/inventory/items/${item.id}/movements`).send({ type: "out", quantity: 25 })).status).toBe(400);

    // Inventory event cost exceeding stock → 400.
    const id = await booking("2026-12-10");
    await accounts.post("/api/payments/slips").send({ bookingId: id, accountId: acc["1010"], amount: 1160 });
    const res = await accounts.post(`/api/event-costs/bookings/${id}`).send({ costType: "inventory", inventoryItemId: item.id, quantity: 50 });
    expect(res.status).toBe(400);
  });

  it("#8 a malformed pagination query does not 500", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const res = await sales.get("/api/bookings").query({ take: "abc", skip: "-5" });
    expect(res.status).toBe(200);
  });
});
