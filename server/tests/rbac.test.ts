import { describe, it, expect } from "vitest";
import {
  canAccessModule,
  modulesForRoles,
  isSuperAdmin,
  canEditAccountingEntry,
  canEditGstRate,
  canToggleSystemLock,
  MODULES,
} from "../src/auth/rbac";

describe("RBAC module matrix", () => {
  it("super_admin can reach every module (bypass)", () => {
    for (const m of MODULES) {
      expect(canAccessModule(["super_admin"], m)).toBe(true);
    }
    expect(modulesForRoles(["super_admin"]).sort()).toEqual([...MODULES].sort());
  });

  it("sales sees only its own modules", () => {
    expect(canAccessModule(["sales"], "bookings")).toBe(true);
    expect(canAccessModule(["sales"], "customers")).toBe(true);
    expect(canAccessModule(["sales"], "payments")).toBe(true);
    expect(canAccessModule(["sales"], "accounting")).toBe(false);
    expect(canAccessModule(["sales"], "inventory")).toBe(false);
    expect(canAccessModule(["sales"], "admin")).toBe(false);
  });

  it("accounts can reach accounting + reports but not admin or inventory", () => {
    expect(canAccessModule(["accounts"], "accounting")).toBe(true);
    expect(canAccessModule(["accounts"], "event_costs")).toBe(true);
    expect(canAccessModule(["accounts"], "reports")).toBe(true);
    expect(canAccessModule(["accounts"], "inventory")).toBe(false);
    expect(canAccessModule(["accounts"], "admin")).toBe(false);
  });

  it("inventory + decor are tightly scoped", () => {
    expect(canAccessModule(["inventory"], "inventory")).toBe(true);
    expect(canAccessModule(["inventory"], "assets")).toBe(true);
    expect(canAccessModule(["inventory"], "bookings")).toBe(false);
    expect(canAccessModule(["decor"], "decor")).toBe(true);
    expect(canAccessModule(["decor"], "accounting")).toBe(false);
  });

  it("a user holding multiple roles gets the union", () => {
    const mods = modulesForRoles(["sales", "inventory"]);
    expect(mods).toContain("bookings");
    expect(mods).toContain("inventory");
    expect(mods).not.toContain("accounting");
  });

  it("special action rules", () => {
    expect(isSuperAdmin(["admin"])).toBe(false);
    expect(canEditAccountingEntry(["accounts"])).toBe(false);
    expect(canEditAccountingEntry(["super_admin"])).toBe(true);
    expect(canEditGstRate(["admin"])).toBe(true);
    expect(canEditGstRate(["accounts"])).toBe(false);
    expect(canEditGstRate(["super_admin"])).toBe(true); // bypass
    expect(canToggleSystemLock(["admin"])).toBe(false);
    expect(canToggleSystemLock(["super_admin"])).toBe(true);
  });
});
