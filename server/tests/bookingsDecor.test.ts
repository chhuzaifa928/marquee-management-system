import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedHalls, seedRoles, seedSettings } from "./helpers";

const app = createApp();
let hallId: number;
let customerId: number;

async function base() {
  await seedRoles();
  await seedSettings();
  hallId = (await seedHalls())["Pearl Hall"]!;
  customerId = (await prisma.customer.create({ data: { code: "CUST-0001", name: "Host" } })).id;
}

const bookingBody = () => ({
  customerId, hallId, eventDate: "2026-12-25", slot: "dinner", guests: 100, rackRate: 1200, discountedRate: 1000,
});

describe("Decor team adds decor items to a booking's bill", () => {
  beforeEach(base);

  it("decor can open bookings and add a decor item that lands on the bill", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const decor = await authAgent(app, { email: "decor@gp.local", roles: ["decor"] });
    const created = await sales.post("/api/bookings").send(bookingBody());
    const id = created.body.booking.id;

    // Decor can see bookings now.
    expect((await decor.get(`/api/bookings/${id}`)).status).toBe(200);

    // Decor adds a stage decoration item → becomes a `decor` charge on the bill.
    const res = await decor.post(`/api/bookings/${id}/decor-items`).send({ item: "Stage Decoration", unitPrice: 60000 });
    expect(res.status).toBe(201);
    const decorCharge = res.body.charges.find((c: { chargeType: string }) => c.chargeType === "decor");
    expect(decorCharge.description).toBe("Stage Decoration");
    expect(decorCharge.amount).toBe("60000.00");
    // Reflected in the bill totals (100000 head + 60000 decor = 160000 subtotal).
    expect(res.body.totals.chargesTotal).toBe("60000.00");
    expect(res.body.totals.subtotal).toBe("160000.00");

    // A second item (fireworks) with quantity.
    const res2 = await decor.post(`/api/bookings/${id}/decor-items`).send({ item: "Fireworks", quantity: 2, unitPrice: 15000 });
    expect(res2.body.totals.chargesTotal).toBe("90000.00"); // 60000 + 2×15000
  });

  it("decor cannot create a booking or add non-decor charges", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const decor = await authAgent(app, { email: "decor@gp.local", roles: ["decor"] });
    const id = (await sales.post("/api/bookings").send(bookingBody())).body.booking.id;

    expect((await decor.post("/api/bookings").send(bookingBody())).status).toBe(403);
    expect((await decor.post(`/api/bookings/${id}/charges`).send({ chargeType: "dj", quantity: 1, unitPrice: 1000 })).status).toBe(403);
  });

  it("decor-items delete only removes decor charges, not other types", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const decor = await authAgent(app, { email: "decor@gp.local", roles: ["decor"] });
    const id = (await sales.post("/api/bookings").send(bookingBody())).body.booking.id;
    // sales adds a DJ (non-decor) charge
    const withDj = await sales.post(`/api/bookings/${id}/charges`).send({ chargeType: "dj", quantity: 1, unitPrice: 20000 });
    const djId = withDj.body.charges.find((c: { chargeType: string }) => c.chargeType === "dj").id;

    // decor tries to remove the DJ charge via the decor endpoint → forbidden
    expect((await decor.delete(`/api/bookings/${id}/decor-items/${djId}`)).status).toBe(403);

    // decor adds + removes its own decor item successfully
    const added = await decor.post(`/api/bookings/${id}/decor-items`).send({ item: "Dance Floor", unitPrice: 40000 });
    const decorId = added.body.charges.find((c: { chargeType: string }) => c.chargeType === "decor").id;
    const removed = await decor.delete(`/api/bookings/${id}/decor-items/${decorId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.charges.some((c: { chargeType: string }) => c.chargeType === "decor")).toBe(false);
  });
});
