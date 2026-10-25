import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { toPrisma } from "../../lib/money";
import { NumberSequenceService } from "../../services/numberSequence";
import { AccountBalance } from "../../services/accountBalance";

export const VendorsService = {
  async list() {
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: "asc" },
      include: { account: { select: { id: true, code: true, name: true } } },
    });
    const out = [];
    for (const v of vendors) {
      const balance = v.accountId ? (await AccountBalance.balanceAsOf(v.accountId)).toFixed(2) : null;
      out.push({
        id: v.id, name: v.name, company: v.company, phone: v.phone, email: v.email,
        address: v.address, notes: v.notes,
        openingBalance: v.openingBalance.toFixed(2),
        account: v.account ? { id: v.account.id, code: v.account.code, name: v.account.name } : null,
        balanceOwed: balance,
      });
    }
    return out;
  },

  /** Create a vendor and (unless one is linked) its own supplier payable account. */
  async create(input: { name: string; company?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; openingBalance?: number | string }) {
    return prisma.$transaction(async (tx) => {
      const code = await NumberSequenceService.next("supplier_acct", "SUPP-", 4, tx);
      const account = await tx.account.create({
        data: {
          code, name: `${input.name.trim()} (Payable)`, type: "supplier",
          openingBalance: toPrisma(input.openingBalance ?? 0),
        },
      });
      return tx.vendor.create({
        data: {
          name: input.name.trim(), company: input.company ?? null, phone: input.phone ?? null,
          email: input.email ?? null, address: input.address ?? null, notes: input.notes ?? null,
          openingBalance: toPrisma(input.openingBalance ?? 0), accountId: account.id,
        },
        include: { account: { select: { id: true, code: true, name: true } } },
      });
    });
  },

  async update(id: number, input: { name?: string; company?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }) {
    const data: Prisma.VendorUpdateInput = {};
    for (const k of ["name", "company", "phone", "email", "address", "notes"] as const) {
      if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
    }
    return prisma.vendor.update({ where: { id }, data });
  },

  async remove(id: number) {
    const costs = await prisma.eventCost.count({ where: { vendorId: id, deletedAt: null } });
    if (costs > 0) throw AppError.conflict("Vendor has event costs recorded; cannot delete.");
    await prisma.vendor.delete({ where: { id } });
  },
};
