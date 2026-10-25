import { describe, it, expect } from "vitest";
import {
  canAccessModule,
  modulesForRoles,
  isSuperAdmin,
  canEditAccountingEntry,
  canEditGstRate,
  canToggleSystemLock,
  canPostVoucher,
  canRecordPayment,
  canManageAssetsVendors,
  MODULES,
} from "../src/auth/rbac";

describe("RBAC module matrix", () => {
  it("super_admin can reach every module (bypass)", () => {
    for (const m of MODULES) {
      expect(canAccessModule(["super_admin"], m)).toBe(true);
    }
    expect(modulesForRoles(["super_admin"]).sort()).toEqual([...MODULES].sort());
  });

  it("sales sees only its own modules (no payments/accounting)", () => {
    expect(canAccessModule(["sales"], "bookings")).toBe(true);
    expect(canAccessModule(["sales"], "customers")).toBe(true);
    expect(canAccessModule(["sales"], "reports")).toBe(true);
    expect(canAccessModule(["sales"], "payments")).toBe(false); // sales cannot record payments
    expect(canAccessModule(["sales"], "accounting")).toBe(false);
    expect(canAccessModule(["sales"], "inventory")).toBe(false);
    expect(canAccessModule(["sales"], "admin")).toBe(false);
  });

  it("accounts can reach accounting + payments + reports but not admin or inventory", () => {
    expect(canAccessModule(["accounts"], "accounting")).toBe(true);
    expect(canAccessModule(["accounts"], "payments")).toBe(true);
    expect(canAccessModule(["accounts"], "event_costs")).toBe(true);
    expect(canAccessModule(["accounts"], "reports")).toBe(true);
    expect(canAccessModule(["accounts"], "inventory")).toBe(false);
    expect(canAccessModule(["accounts"], "admin")).toBe(false);
  });

  it("inventory + decor are tightly scoped (inventory has no assets)", () => {
    expect(canAccessModule(["inventory"], "inventory")).toBe(true);
    expect(canAccessModule(["inventory"], "assets")).toBe(false); // assets are admin/super only
    expect(canAccessModule(["inventory"], "bookings")).toBe(false);
    expect(canAccessModule(["decor"], "decor")).toBe(true);
    expect(canAccessModule(["decor"], "accounting")).toBe(false);
  });

  it("admin reaches assets/vendors/admin; inventory/decor do not", () => {
    expect(canAccessModule(["admin"], "assets")).toBe(true);
    expect(canAccessModule(["admin"], "vendors")).toBe(true);
    expect(canAccessModule(["admin"], "admin")).toBe(true);
    expect(canAccessModule(["super_admin"], "admin")).toBe(true);
  });

  it("a user holding multiple roles gets the union", () => {
    const mods = modulesForRoles(["sales", "inventory"]);
    expect(mods).toContain("bookings");
    expect(mods).toContain("inventory");
    expect(mods).not.toContain("accounting");
  });

  it("special action rules match the SRS permission matrix", () => {
    expect(isSuperAdmin(["admin"])).toBe(false);
    // Edit/delete Accounts entries → super only
    expect(canEditAccountingEntry(["accounts"])).toBe(false);
    expect(canEditAccountingEntry(["super_admin"])).toBe(true);
    // Post vouchers → accounts + super, NOT admin
    expect(canPostVoucher(["accounts"])).toBe(true);
    expect(canPostVoucher(["admin"])).toBe(false);
    expect(canPostVoucher(["super_admin"])).toBe(true);
    // Record payments → admin + accounts, NOT sales
    expect(canRecordPayment(["accounts"])).toBe(true);
    expect(canRecordPayment(["admin"])).toBe(true);
    expect(canRecordPayment(["sales"])).toBe(false);
    // GST → admin + super
    expect(canEditGstRate(["admin"])).toBe(true);
    expect(canEditGstRate(["accounts"])).toBe(false);
    // Assets/vendors → admin + super
    expect(canManageAssetsVendors(["admin"])).toBe(true);
    expect(canManageAssetsVendors(["accounts"])).toBe(false);
    // Lock → super only
    expect(canToggleSystemLock(["admin"])).toBe(false);
    expect(canToggleSystemLock(["super_admin"])).toBe(true);
  });
});
