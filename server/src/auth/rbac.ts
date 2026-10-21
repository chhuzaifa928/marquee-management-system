/**
 * Role-based access control.
 *
 * Six roles, stored in the `roles` table and attached to users via `user_roles`
 * (a user may hold several). There is deliberately NO `role` column on users.
 *
 *  - `super_admin` bypasses every permission check (gate-before style).
 *  - Each other role sees only its own set of modules. This map is the single
 *    source of truth, enforced server-side in middleware AND mirrored by the
 *    client nav (the client is never the security boundary).
 */

export const ROLES = [
  "super_admin",
  "admin",
  "sales",
  "accounts",
  "inventory",
  "decor",
] as const;

export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  sales: "Sales",
  accounts: "Accounts",
  inventory: "Inventory",
  decor: "Decor",
};

/** Application modules (mirrors the React screen list in §7). */
export const MODULES = [
  "dashboard",
  "customers",
  "bookings",
  "payments",
  "accounting",
  "event_costs",
  "inventory",
  "assets",
  "decor",
  "vendors",
  "reports",
  "admin",
] as const;

export type ModuleKey = (typeof MODULES)[number];

/**
 * Which modules each role may reach. `super_admin` is handled by bypass and is
 * intentionally omitted (it can reach everything).
 */
export const ROLE_MODULES: Record<Exclude<RoleName, "super_admin">, ModuleKey[]> = {
  admin: [...MODULES], // general manager — all modules (but not super-admin-only actions)
  sales: ["dashboard", "customers", "bookings", "payments"],
  accounts: [
    "dashboard",
    "customers",
    "bookings",
    "payments",
    "accounting",
    "event_costs",
    "vendors",
    "reports",
  ],
  inventory: ["dashboard", "inventory", "assets"],
  decor: ["dashboard", "decor"],
};

export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes("super_admin");
}

/** Does any of the user's roles grant access to the given module? */
export function canAccessModule(roles: string[], moduleKey: ModuleKey): boolean {
  if (isSuperAdmin(roles)) return true;
  return roles.some((r) => {
    const mods = ROLE_MODULES[r as Exclude<RoleName, "super_admin">];
    return mods ? mods.includes(moduleKey) : false;
  });
}

/** Does the user hold at least one of the required roles (super_admin bypass)? */
export function hasAnyRole(roles: string[], required: RoleName[]): boolean {
  if (isSuperAdmin(roles)) return true;
  return required.some((r) => roles.includes(r));
}

/** The full set of modules a user may see (for building the client nav). */
export function modulesForRoles(roles: string[]): ModuleKey[] {
  if (isSuperAdmin(roles)) return [...MODULES];
  const set = new Set<ModuleKey>();
  for (const r of roles) {
    const mods = ROLE_MODULES[r as Exclude<RoleName, "super_admin">];
    if (mods) mods.forEach((m) => set.add(m));
  }
  return MODULES.filter((m) => set.has(m));
}

// ── Special, non-module action rules ─────────────────────────────────────────

/** Only super_admin may edit/delete entries created by `accounts`. */
export function canEditAccountingEntry(roles: string[]): boolean {
  return isSuperAdmin(roles);
}

/** Only `admin` (and super_admin) may change the GST rate. */
export function canEditGstRate(roles: string[]): boolean {
  return hasAnyRole(roles, ["admin"]);
}

/** Only super_admin may toggle the system lock. */
export function canToggleSystemLock(roles: string[]): boolean {
  return isSuperAdmin(roles);
}
