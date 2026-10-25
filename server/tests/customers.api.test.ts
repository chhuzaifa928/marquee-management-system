import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { authAgent, seedRoles, seedSettings } from "./helpers";

const app = createApp();

describe("Customers API", () => {
  beforeEach(async () => {
    await seedRoles();
    await seedSettings();
  });

  it("creates a customer with a gapless CUST- code and masked CNIC", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const res = await agent.post("/api/customers").send({
      name: "Imran Khan",
      phone: "03001234567",
      cnic: "35202-1234567-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("CUST-0001");
    expect(res.body.cnicMasked).toMatch(/7-1$/);
    expect(JSON.stringify(res.body)).not.toContain("3520212345671");
  });

  it("finds a customer by exact CNIC but not by a partial one", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    await agent.post("/api/customers").send({ name: "Ali", cnic: "35202-1234567-1" });

    const exact = await agent.get("/api/customers").query({ cnic: "3520212345671" });
    expect(exact.body.total).toBe(1);
    expect(exact.body.data[0].name).toBe("Ali");

    const partial = await agent.get("/api/customers").query({ cnic: "3520212" });
    expect(partial.body.total).toBe(0);
  });

  it("rejects an invalid CNIC length", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const res = await agent.post("/api/customers").send({ name: "Bad", cnic: "123" });
    expect(res.status).toBe(400);
  });

  it("returns total business in the summary", async () => {
    const agent = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    const c = await agent.post("/api/customers").send({ name: "Host" });
    const summary = await agent.get(`/api/customers/${c.body.id}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.stats.bookingsCount).toBe(0);
    expect(summary.body.stats.totalBusiness).toBe("0.00");
  });

  it("denies access to a role without the customers module", async () => {
    const agent = await authAgent(app, { email: "inv@gp.local", roles: ["inventory"] });
    const res = await agent.get("/api/customers");
    expect(res.status).toBe(403);
  });
});
