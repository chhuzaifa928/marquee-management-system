import { Prisma, type AccountType, type VoucherType } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { d, toPrisma } from "../../lib/money";
import { writeAudit } from "../../lib/audit";
import { startOfDay } from "../../lib/dates";
import { AccountBalance, isDebitNormal, toNormalSide } from "../../services/accountBalance";
import { createVoucher } from "../../services/vouchers";

const ACCOUNT_TYPES: AccountType[] = [
  "cash", "bank", "staff", "asset", "liability", "supplier", "income", "expense", "equity",
];

export const AccountingService = {
  // ── Chart of accounts ──────────────────────────────────────────────────────
  async listAccounts(opts: { withBalances?: boolean } = {}) {
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    });
    if (!opts.withBalances) {
      return accounts.map((a) => ({
        id: a.id, code: a.code, name: a.name, type: a.type,
        openingBalance: a.openingBalance.toFixed(2), isActive: a.isActive,
      }));
    }
    const out = [];
    for (const a of accounts) {
      const balance = await AccountBalance.balanceAsOf(a.id);
      out.push({
        id: a.id, code: a.code, name: a.name, type: a.type,
        openingBalance: a.openingBalance.toFixed(2),
        isActive: a.isActive,
        normalSide: isDebitNormal(a.type) ? "debit" : "credit",
        balance: balance.toFixed(2),
      });
    }
    return out;
  },

  async createAccount(input: { code: string; name: string; type: AccountType; openingBalance?: number | string }, userId?: number) {
    if (!ACCOUNT_TYPES.includes(input.type)) throw AppError.badRequest("Invalid account type");
    const account = await prisma.account.create({
      data: {
        code: input.code.trim(),
        name: input.name.trim(),
        type: input.type,
        openingBalance: toPrisma(input.openingBalance ?? 0),
      },
    });
    await writeAudit(prisma, { userId, action: "create", model: "Account", modelId: account.id, newData: account });
    return account;
  },

  async updateAccount(id: number, input: { name?: string; type?: AccountType; openingBalance?: number | string; isActive?: boolean }, userId?: number) {
    const data: Prisma.AccountUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.type !== undefined) data.type = input.type;
    if (input.openingBalance !== undefined) data.openingBalance = toPrisma(input.openingBalance);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const before = await prisma.account.findUniqueOrThrow({ where: { id } });
    const account = await prisma.account.update({ where: { id }, data });
    await writeAudit(prisma, { userId, action: "update", model: "Account", modelId: id, oldData: before, newData: account });
    return account;
  },

  async deleteAccount(id: number, userId?: number) {
    const used = await prisma.voucher.count({
      where: { deletedAt: null, OR: [{ debitAccountId: id }, { creditAccountId: id }] },
    });
    if (used > 0) throw AppError.conflict("Account has postings and cannot be deleted; deactivate it instead.");
    await prisma.account.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await writeAudit(prisma, { userId, action: "delete", model: "Account", modelId: id });
  },

  // ── Vouchers ───────────────────────────────────────────────────────────────
  async listVouchers(params: { type?: VoucherType; accountId?: number; from?: string; to?: string; take?: number; skip?: number }) {
    const where: Prisma.VoucherWhereInput = { deletedAt: null };
    if (params.type) where.type = params.type;
    if (params.accountId) where.OR = [{ debitAccountId: params.accountId }, { creditAccountId: params.accountId }];
    if (params.from || params.to) {
      where.date = {};
      if (params.from) where.date.gte = startOfDay(params.from);
      if (params.to) where.date.lte = new Date(new Date(params.to).getTime() + 86_400_000 - 1);
    }
    const [rows, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: {
          debitAccount: { select: { code: true, name: true } },
          creditAccount: { select: { code: true, name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: params.take ?? 100,
        skip: params.skip ?? 0,
      }),
      prisma.voucher.count({ where }),
    ]);
    return {
      data: rows.map((v) => ({
        id: v.id, voucherNo: v.voucherNo, type: v.type, date: v.date,
        category: v.category, remark: v.remark,
        debit: `${v.debitAccount.code} ${v.debitAccount.name}`,
        credit: `${v.creditAccount.code} ${v.creditAccount.name}`,
        amount: v.amount.toFixed(2),
        createdBy: v.createdBy?.name ?? null,
        batchUid: v.batchUid,
        source: v.sourceType ? { type: v.sourceType, id: v.sourceId } : null,
      })),
      total,
    };
  },

  async getVoucher(id: number) {
    const v = await prisma.voucher.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: {
        debitAccount: { select: { code: true, name: true } },
        creditAccount: { select: { code: true, name: true } },
        createdBy: { select: { name: true } },
      },
    });
    return {
      id: v.id, voucherNo: v.voucherNo, type: v.type, date: v.date,
      category: v.category, remark: v.remark,
      debitAccount: `${v.debitAccount.code} ${v.debitAccount.name}`,
      creditAccount: `${v.creditAccount.code} ${v.creditAccount.name}`,
      amount: v.amount.toFixed(2), createdBy: v.createdBy?.name ?? null,
    };
  },

  /** Manual voucher entry for expenses / supplier payments / GST / transfers (EV/PV/JV). */
  async postManualVoucher(
    input: { type: "EV" | "PV" | "JV"; debitAccountId: number; creditAccountId: number; amount: number | string; date?: string; category?: string | null; remark?: string | null },
    userId?: number,
  ) {
    if (!["EV", "PV", "JV"].includes(input.type)) {
      throw AppError.badRequest("Manual vouchers must be EV, PV or JV (RV comes from payment slips)");
    }
    return prisma.$transaction((tx) =>
      createVoucher(tx, {
        type: input.type,
        date: input.date ? new Date(input.date) : new Date(),
        category: input.category ?? null,
        remark: input.remark ?? null,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        amount: input.amount,
        createdById: userId,
      }),
    );
  },

  // ── General Ledger ───────────────────────────────────────────────────────
  async generalLedger(accountId: number, from: string, to: string) {
    const account = await prisma.account.findFirstOrThrow({ where: { id: accountId, deletedAt: null } });
    const fromD = startOfDay(from);
    const toExclusive = new Date(startOfDay(to).getTime() + 86_400_000);

    const summary = await AccountBalance.ledger(accountId, { from: fromD, to: startOfDay(to) });

    const vouchers = await prisma.voucher.findMany({
      where: {
        deletedAt: null,
        date: { gte: fromD, lt: toExclusive },
        OR: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
      },
      include: {
        debitAccount: { select: { code: true, name: true } },
        creditAccount: { select: { code: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });

    let running = summary.opening;
    const rows = vouchers.map((v) => {
      const isDebit = v.debitAccountId === accountId;
      const dr = isDebit ? d(v.amount) : d(0);
      const cr = isDebit ? d(0) : d(v.amount);
      running = running.plus(toNormalSide(account.type, dr.minus(cr)));
      const contra = isDebit ? v.creditAccount : v.debitAccount;
      return {
        date: v.date, voucherNo: v.voucherNo, type: v.type,
        description: v.remark ?? v.category ?? "",
        contra: `${contra.code} ${contra.name}`,
        debit: dr.toFixed(2), credit: cr.toFixed(2),
        balance: running.toFixed(2),
      };
    });

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type, normalSide: isDebitNormal(account.type) ? "debit" : "credit" },
      range: { from, to },
      opening: summary.opening.toFixed(2),
      movementDebit: summary.movementDebit.toFixed(2),
      movementCredit: summary.movementCredit.toFixed(2),
      closing: summary.closing.toFixed(2),
      rows,
    };
  },
};
