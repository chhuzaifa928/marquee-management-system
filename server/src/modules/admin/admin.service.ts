import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { toPrisma } from "../../lib/money";
import { hashPassword } from "../../lib/password";
import { writeAudit } from "../../lib/audit";
import { isSuperAdmin } from "../../auth/rbac";
import { getSettings } from "../settings/settings.service";

export const AdminService = {
  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings() {
    const s = await getSettings();
    return {
      gstRate: s.gstRate.toFixed(2),
      systemLocked: s.systemLocked,
      companyName: s.companyName,
      companyAddress: s.companyAddress,
      companyPhone: s.companyPhone,
      companyEmail: s.companyEmail,
      currency: s.currency,
      logoPath: s.logoPath,
    };
  },

  /** Update company info + GST rate. GST changes require the gstAllowed flag. */
  async updateSettings(
    input: { companyName?: string; companyAddress?: string | null; companyPhone?: string | null; companyEmail?: string | null; currency?: string; gstRate?: number | string },
    opts: { gstAllowed: boolean; userId?: number },
  ) {
    const data: Prisma.SettingsUpdateInput = {};
    if (input.companyName !== undefined) data.companyName = input.companyName;
    if (input.companyAddress !== undefined) data.companyAddress = input.companyAddress;
    if (input.companyPhone !== undefined) data.companyPhone = input.companyPhone;
    if (input.companyEmail !== undefined) data.companyEmail = input.companyEmail;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.gstRate !== undefined) {
      if (!opts.gstAllowed) throw AppError.forbidden("Only Admin or Super Admin can change the GST rate");
      data.gstRate = toPrisma(input.gstRate);
    }
    await getSettings(); // ensure row exists
    const updated = await prisma.settings.update({ where: { id: 1 }, data });
    await writeAudit(prisma, { userId: opts.userId, action: "update", model: "Settings", modelId: 1, newData: data });
    return this.getSettings();
  },

  /** Toggle the whole-system lock (super_admin only — enforced at the route). */
  async setSystemLock(locked: boolean, userId?: number) {
    await getSettings();
    await prisma.settings.update({ where: { id: 1 }, data: { systemLocked: locked } });
    await writeAudit(prisma, { userId, action: "update", model: "Settings", modelId: 1, newData: { systemLocked: locked } });
    return { systemLocked: locked };
  },

  // ── Users & roles ──────────────────────────────────────────────────────────
  async listRoles() {
    return prisma.role.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, label: true } });
  },

  async listUsers() {
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      include: { roles: { include: { role: true } } },
    });
    return users.map((u) => ({
      id: u.id, name: u.name, email: u.email, isActive: u.isActive,
      roles: u.roles.map((r) => r.role.name),
      createdAt: u.createdAt,
    }));
  },

  async createUser(
    input: { name: string; email: string; password: string; roles: string[] },
    opts: { requesterRoles: string[]; userId?: number },
  ) {
    this.assertRoleAssignment(input.roles, opts.requesterRoles);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: input.name, email: input.email.toLowerCase().trim(), passwordHash },
      });
      await this.syncRoles(tx, created.id, input.roles);
      await writeAudit(tx, { userId: opts.userId, action: "create", model: "User", modelId: created.id, newData: { email: created.email, roles: input.roles } });
      return created;
    });
    return { id: user.id, email: user.email };
  },

  async updateUser(
    id: number,
    input: { name?: string; isActive?: boolean; password?: string; roles?: string[] },
    opts: { requesterRoles: string[]; userId?: number },
  ) {
    if (input.roles) this.assertRoleAssignment(input.roles, opts.requesterRoles);
    await prisma.$transaction(async (tx) => {
      const data: Prisma.UserUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.password) data.passwordHash = await hashPassword(input.password);
      await tx.user.update({ where: { id }, data });
      if (input.roles) await this.syncRoles(tx, id, input.roles);
      await writeAudit(tx, { userId: opts.userId, action: "update", model: "User", modelId: id, newData: { ...input, password: input.password ? "***" : undefined } });
    });
    return { ok: true };
  },

  assertRoleAssignment(roles: string[], requesterRoles: string[]) {
    if (roles.includes("super_admin") && !isSuperAdmin(requesterRoles)) {
      throw AppError.forbidden("Only a Super Admin can grant the super_admin role");
    }
  },

  async syncRoles(tx: Prisma.TransactionClient, userId: number, roleNames: string[]) {
    const roles = await tx.role.findMany({ where: { name: { in: roleNames } } });
    if (roles.length !== roleNames.length) throw AppError.badRequest("Unknown role in list");
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })) });
  },

  // ── Audit log ──────────────────────────────────────────────────────────────
  async listAudits(params: { model?: string; modelId?: number; take?: number; skip?: number }) {
    const where: Prisma.AuditWhereInput = {};
    if (params.model) where.model = params.model;
    if (params.modelId) where.modelId = params.modelId;
    const [rows, total] = await Promise.all([
      prisma.audit.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { id: "desc" },
        take: params.take ?? 100,
        skip: params.skip ?? 0,
      }),
      prisma.audit.count({ where }),
    ]);
    return {
      data: rows.map((a) => ({
        id: a.id, action: a.action, model: a.model, modelId: a.modelId,
        user: a.user ? `${a.user.name}` : "system",
        createdAt: a.createdAt,
        newData: a.newData, oldData: a.oldData,
      })),
      total,
    };
  },
};
