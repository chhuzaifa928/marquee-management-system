import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/prisma";
import { authAgent, seedRoles, seedSettings } from "./helpers";

const app = createApp();

describe("Admin module (super_admin + admin)", () => {
  beforeEach(async () => {
    await seedRoles();
    await seedSettings();
  });

  it("admin can read and update company settings + GST rate", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const res = await admin.put("/api/admin/settings").send({ companyName: "Grand Pearl Marquee", gstRate: 17 });
    expect(res.status).toBe(200);
    expect(res.body.gstRate).toBe("17.00");
    expect(res.body.companyName).toBe("Grand Pearl Marquee");
  });

  it("only super_admin can toggle the system lock", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });

    expect((await admin.post("/api/admin/system-lock").send({ locked: true })).status).toBe(403);

    const lock = await boss.post("/api/admin/system-lock").send({ locked: true });
    expect(lock.status).toBe(200);
    const s = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect(s.systemLocked).toBe(true);
  });

  it("admin creates users but cannot grant super_admin; super_admin can", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const ok = await admin.post("/api/admin/users").send({ name: "New Sales", email: "ns@gp.local", password: "Secret!123", roles: ["sales"] });
    expect(ok.status).toBe(201);

    const denied = await admin.post("/api/admin/users").send({ name: "Hacker", email: "h@gp.local", password: "Secret!123", roles: ["super_admin"] });
    expect(denied.status).toBe(403);

    const boss = await authAgent(app, { email: "boss@gp.local", roles: ["super_admin"] });
    const granted = await boss.post("/api/admin/users").send({ name: "Second Boss", email: "sb@gp.local", password: "Secret!123", roles: ["super_admin"] });
    expect(granted.status).toBe(201);
  });

  it("admin can update a user's roles and active status", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    const created = await admin.post("/api/admin/users").send({ name: "U", email: "u@gp.local", password: "Secret!123", roles: ["sales"] });
    const users = await admin.get("/api/admin/users");
    const u = users.body.find((x: { email: string }) => x.email === "u@gp.local");
    const upd = await admin.put(`/api/admin/users/${u.id}`).send({ roles: ["inventory"], isActive: false });
    expect(upd.status).toBe(200);
    const reread = (await admin.get("/api/admin/users")).body.find((x: { email: string }) => x.email === "u@gp.local");
    expect(reread.roles).toEqual(["inventory"]);
    expect(reread.isActive).toBe(false);
  });

  it("denies the admin module to non-admin roles", async () => {
    const accounts = await authAgent(app, { email: "acct@gp.local", roles: ["accounts"] });
    const sales = await authAgent(app, { email: "sales@gp.local", roles: ["sales"] });
    expect((await accounts.get("/api/admin/settings")).status).toBe(403);
    expect((await sales.get("/api/admin/users")).status).toBe(403);
  });

  it("exposes the audit log to admins", async () => {
    const admin = await authAgent(app, { email: "admin@gp.local", roles: ["admin"] });
    await admin.put("/api/admin/settings").send({ gstRate: 18 }); // writes an audit row
    const audits = await admin.get("/api/admin/audits").query({ model: "Settings" });
    expect(audits.status).toBe(200);
    expect(audits.body.total).toBeGreaterThan(0);
  });
});
