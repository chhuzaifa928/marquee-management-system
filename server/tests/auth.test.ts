import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { createUser, seedRoles, seedSettings } from "./helpers";

const app = createApp();

describe("auth + system lock", () => {
  beforeEach(async () => {
    await seedRoles();
    await seedSettings();
    await createUser({ email: "sales@gp.local", password: "Secret!123", roles: ["sales"] });
    await createUser({
      email: "boss@gp.local",
      password: "Secret!123",
      roles: ["super_admin"],
    });
  });

  it("logs in with correct credentials and returns role modules", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "sales@gp.local", password: "Secret!123" });
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toEqual(["sales"]);
    expect(res.body.modules).toContain("bookings");
    expect(res.body.modules).not.toContain("accounting");
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.join(";")).toContain("gp_access");
  });

  it("rejects a wrong password with a uniform 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "sales@gp.local", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("rejects an unknown email with the same uniform 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ghost@gp.local", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("validates the request body (422)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "x" });
    expect(res.status).toBe(422);
  });

  it("while locked, only super_admin can log in", async () => {
    await seedSettings({ systemLocked: true });

    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email: "sales@gp.local", password: "Secret!123" });
    expect(blocked.status).toBe(403);

    const allowed = await request(app)
      .post("/api/auth/login")
      .send({ email: "boss@gp.local", password: "Secret!123" });
    expect(allowed.status).toBe(200);
    expect(allowed.body.user.roles).toContain("super_admin");
  });

  it("/me requires auth and returns the profile with a cookie session", async () => {
    const agent = request.agent(app);
    const unauth = await agent.get("/api/auth/me");
    expect(unauth.status).toBe(401);

    await agent.post("/api/auth/login").send({ email: "sales@gp.local", password: "Secret!123" });
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("sales@gp.local");
  });

  it("refresh issues a new session from the refresh cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "sales@gp.local", password: "Secret!123" });
    const res = await agent.post("/api/auth/refresh");
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("logout clears the session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "sales@gp.local", password: "Secret!123" });
    await agent.post("/api/auth/logout");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("a disabled account cannot log in", async () => {
    await createUser({
      email: "gone@gp.local",
      password: "Secret!123",
      roles: ["sales"],
      isActive: false,
    });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "gone@gp.local", password: "Secret!123" });
    expect(res.status).toBe(403);
  });
});
