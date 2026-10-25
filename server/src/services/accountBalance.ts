import { Prisma, type AccountType } from "@prisma/client";
import { prisma } from "../prisma";
import { d } from "../lib/money";

type Client = Prisma.TransactionClient | typeof prisma;

/** Debit-normal account types (debits increase the balance). */
const DEBIT_NORMAL: AccountType[] = ["cash", "bank", "staff", "asset", "expense"];

export function isDebitNormal(type: AccountType): boolean {
  return DEBIT_NORMAL.includes(type);
}

/**
 * Convert a debit-positive movement (Σdebits − Σcredits) into the account's
 * natural side. Debit-normal accounts keep the sign; credit-normal accounts
 * (income, liability, supplier, equity) invert it.
 */
export function toNormalSide(type: AccountType, movement: Prisma.Decimal): Prisma.Decimal {
  return isDebitNormal(type) ? movement : movement.negated();
}

/**
 * Raw debit-positive movement for an account over an optional [from, to) window.
 * movement = Σ(debits) − Σ(credits) across non-deleted vouchers.
 */
export async function movement(
  accountId: number,
  opts: { from?: Date; to?: Date } = {},
  client: Client = prisma,
): Promise<Prisma.Decimal> {
  const dateFilter: Prisma.DateTimeFilter = {};
  if (opts.from) dateFilter.gte = opts.from;
  if (opts.to) dateFilter.lt = opts.to;
  const hasRange = opts.from || opts.to;

  const [debits, credits] = await Promise.all([
    client.voucher.aggregate({
      _sum: { amount: true },
      where: { debitAccountId: accountId, deletedAt: null, ...(hasRange ? { date: dateFilter } : {}) },
    }),
    client.voucher.aggregate({
      _sum: { amount: true },
      where: { creditAccountId: accountId, deletedAt: null, ...(hasRange ? { date: dateFilter } : {}) },
    }),
  ]);
  return d(debits._sum.amount ?? 0).minus(d(credits._sum.amount ?? 0));
}

export interface LedgerBalance {
  opening: Prisma.Decimal; // natural-side balance as of `from`
  movementDebit: Prisma.Decimal; // Σ debits in range
  movementCredit: Prisma.Decimal; // Σ credits in range
  closing: Prisma.Decimal; // natural-side balance as of `to`
}

export const AccountBalance = {
  isDebitNormal,
  toNormalSide,
  movement,

  /** Natural-side balance of an account as of an instant (default: now). */
  async balanceAsOf(accountId: number, asOf?: Date, client: Client = prisma): Promise<Prisma.Decimal> {
    const account = await client.account.findUniqueOrThrow({ where: { id: accountId } });
    const mv = await movement(accountId, asOf ? { to: asOf } : {}, client);
    return d(account.openingBalance).plus(toNormalSide(account.type, mv));
  },

  /**
   * Opening / movement / closing for a General Ledger over [from, to].
   * opening = openingBalance + natural(movement before `from`)
   * closing = opening + natural(movement within range)
   */
  async ledger(
    accountId: number,
    range: { from: Date; to: Date },
    client: Client = prisma,
  ): Promise<LedgerBalance> {
    const account = await client.account.findUniqueOrThrow({ where: { id: accountId } });
    const toExclusive = new Date(range.to.getTime() + 24 * 60 * 60 * 1000); // inclusive day

    const beforeMv = await movement(accountId, { to: range.from }, client);
    const opening = d(account.openingBalance).plus(toNormalSide(account.type, beforeMv));

    const [debits, credits] = await Promise.all([
      client.voucher.aggregate({
        _sum: { amount: true },
        where: { debitAccountId: accountId, deletedAt: null, date: { gte: range.from, lt: toExclusive } },
      }),
      client.voucher.aggregate({
        _sum: { amount: true },
        where: { creditAccountId: accountId, deletedAt: null, date: { gte: range.from, lt: toExclusive } },
      }),
    ]);
    const movementDebit = d(debits._sum.amount ?? 0);
    const movementCredit = d(credits._sum.amount ?? 0);
    const closing = opening.plus(toNormalSide(account.type, movementDebit.minus(movementCredit)));

    return { opening, movementDebit, movementCredit, closing };
  },
};
