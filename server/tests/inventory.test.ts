import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedRoles, seedSettings } from "./helpers";

const app = createApp();

describe("Inventory + stock movements", () => {
  beforeEach(async () => {
    await seedRoles();
    await seedSettings();
  });

  it("recomputes qtyOnHand authoritatively (in − out + adjustment)", async () => {
    const inv = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const item = await inv.post("/api/inventory/items").send({ code: "INV-0001", name: "Chairs", unit: "pcs", reorderLevel: 50 });
    const id = item.body.id;

    await inv.post(`/api/inventory/items/${id}/movements`).send({ type: "in", quantity: 100 });
    await inv.post(`/api/inventory/items/${id}/movements`).send({ type: "out", quantity: 30 });
    const res = await inv.post(`/api/inventory/items/${id}/movements`).send({ type: "adjustment", quantity: -5 });
    expect(res.body.item.qtyOnHand).toBe("65.00"); // 100 - 30 - 5
  });

  it("restores stock when a movement is deleted", async () => {
    const inv = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const item = await inv.post("/api/inventory/items").send({ code: "INV-0002", name: "Tables" });
    const id = item.body.id;
    await inv.post(`/api/inventory/items/${id}/movements`).send({ type: "in", quantity: 40 });
    const outRes = await inv.post(`/api/inventory/items/${id}/movements`).send({ type: "out", quantity: 10 });
    expect(outRes.body.item.qtyOnHand).toBe("30.00");

    const outId = outRes.body.movements.find((m: { type: string }) => m.type === "out").id;
    const del = await inv.delete(`/api/inventory/movements/${outId}`);
    expect(del.body.item.qtyOnHand).toBe("40.00"); // restored
  });

  it("flags low stock at or below reorder level", async () => {
    const inv = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const item = await inv.post("/api/inventory/items").send({ code: "INV-0003", name: "Plates", reorderLevel: 100 });
    await inv.post(`/api/inventory/items/${item.body.id}/movements`).send({ type: "in", quantity: 80 });
    const low = await inv.get("/api/inventory/items").query({ lowStock: "1" });
    expect(low.body.some((i: { code: string }) => i.code === "INV-0003")).toBe(true);
  });

  it("RBAC: sales cannot reach inventory; admin can", async () => {
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    expect((await sales.get("/api/inventory/items")).status).toBe(403);
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    expect((await admin.get("/api/inventory/items")).status).toBe(200);
  });
});
