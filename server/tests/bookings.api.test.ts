import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedHalls, seedRoles, seedSettings } from "./helpers";

const app = createApp();

let hallId: number;
let emeraldId: number;
let customerId: number;

async function seedBase() {
  await seedRoles();
  await seedSettings();
  const halls = await seedHalls();
  hallId = halls["Pearl Hall"]!;
  emeraldId = halls["Emerald Hall"]!;
  const c = await prisma.customer.create({ data: { code: "CUST-0001", name: "Host" } });
  customerId = c.id;
}

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    customerId,
    hallId,
    eventDate: "2026-12-25",
    slot: "dinner",
    guests: 100,
    rackRate: 1200,
    discountedRate: 1000,
    charges: [{ chargeType: "dj", quantity: 1, unitPrice: 20000 }],
    foods: [{ name: "Chicken Karahi", urduName: "چکن کڑاہی" }],
    ...overrides,
  };
}

describe("Bookings API", () => {
  beforeEach(seedBase);

  it("creates a tentative booking with computed totals and availability info", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const res = await agent.post("/api/bookings").send(bookingBody());
    expect(res.status).toBe(201);
    const { booking, availability } = res.body;
    expect(booking.status).toBe("tentative");
    expect(booking.bookingNo).toBe("BKG-0001");
    expect(booking.totals.headchargeTotal).toBe("100000.00");
    expect(booking.totals.chargesTotal).toBe("20000.00");
    expect(booking.totals.subtotal).toBe("120000.00");
    expect(booking.totals.gstAmount).toBe("19200.00");
    expect(booking.totals.grandTotal).toBe("139200.00");
    expect(booking.totals.due).toBe("139200.00");
    expect(booking.foods[0].urduName).toBe("چکن کڑاہی");
    expect(availability.canConfirm).toBe(true);
  });

  it("snapshots the GST rate at creation (later rate changes don't apply)", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const first = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    expect(first.body.booking.gstRate).toBe("16.00");

    // Admin raises the GST rate.
    await prisma.settings.update({ where: { id: 1 }, data: { gstRate: 25 } });

    const second = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    expect(second.body.booking.gstRate).toBe("25.00");

    // The first booking's GST is unchanged (still 16%).
    const reread = await agent.get(`/api/bookings/${first.body.booking.id}`);
    expect(reread.body.gstRate).toBe("16.00");
    expect(reread.body.totals.gstAmount).toBe("16000.00"); // 16% of 100000
  });

  it("adds a charge and reflects it in totals", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const created = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    const id = created.body.booking.id;

    const res = await agent
      .post(`/api/bookings/${id}/charges`)
      .send({ chargeType: "decor", quantity: 2, unitPrice: 15000 });
    expect(res.status).toBe(201);
    expect(res.body.totals.chargesTotal).toBe("30000.00"); // 2*15000
    expect(res.body.charges).toHaveLength(1);
  });

  it("warns about tentative overlaps but still allows creation", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    const second = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    expect(second.status).toBe(201);
    expect(second.body.availability.tentativeOverlapCount).toBe(1);
    expect(second.body.availability.canConfirm).toBe(true);
  });

  it("reports a confirmed conflict via the availability endpoint", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const created = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    // Simulate confirmation (Module 3 does this via payment).
    await prisma.booking.update({
      where: { id: created.body.booking.id },
      data: { status: "booked", confirmedAt: new Date() },
    });
    const res = await agent
      .get("/api/bookings/availability")
      .query({ hallId, date: "2026-12-25", slot: "dinner" });
    expect(res.body.canConfirm).toBe(false);
    expect(res.body.confirmedConflict.bookingNo).toBe("BKG-0001");
  });

  it("refuses to edit a locked/paid booking (423)", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const created = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    await prisma.booking.update({
      where: { id: created.body.booking.id },
      data: { status: "paid", isLocked: true },
    });
    const res = await agent
      .put(`/api/bookings/${created.body.booking.id}`)
      .send({ guests: 200 });
    expect(res.status).toBe(423);
  });

  it("serves the Event Booking Sheet as a PDF", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const created = await agent.post("/api/bookings").send(bookingBody());
    const res = await agent
      .get(`/api/bookings/${created.body.booking.id}/pdf/booking-sheet`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).slice(0, 4).toString()).toBe("%PDF");
  });

  it("enforces RBAC: inventory cannot reach bookings; accounts can read but not create", async () => {
    const invAgent = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    expect((await invAgent.get("/api/bookings")).status).toBe(403);

    const acctAgent = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    expect((await acctAgent.get("/api/bookings")).status).toBe(200);
    const create = await acctAgent.post("/api/bookings").send(bookingBody());
    expect(create.status).toBe(403); // accounts may view but not create bookings
  });

  it("keeps halls independent across the API", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const created = await agent.post("/api/bookings").send(bookingBody({ charges: [], foods: [] }));
    await prisma.booking.update({
      where: { id: created.body.booking.id },
      data: { status: "booked", confirmedAt: new Date() },
    });
    const emerald = await agent
      .get("/api/bookings/availability")
      .query({ hallId: emeraldId, date: "2026-12-25", slot: "dinner" });
    expect(emerald.body.canConfirm).toBe(true);
  });
});
