import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { d } from "../../lib/money";
import { startOfDay } from "../../lib/dates";
import { AccountBalance, toNormalSide } from "../../services/accountBalance";

function rangeBounds(from: string, to: string) {
  const fromD = startOfDay(from);
  const toStart = startOfDay(to);
  const toExclusive = new Date(toStart.getTime() + 86_400_000);
  return { fromD, toStart, toExclusive };
}

export const ReportsService = {
  /**
   * §15.2 Cash Closing Sheet — per cash/bank/staff account: opening balance,
   * every in (debit) / out (credit) transaction in the period with its remark,
   * and closing balance. With section + grand totals.
   */
  async cashClosing(from: string, to: string) {
    const { fromD, toStart, toExclusive } = rangeBounds(from, to);
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null, type: { in: ["cash", "bank", "staff"] } },
      orderBy: { code: "asc" },
    });

    const sections = [];
    let totalOpening = d(0), totalIn = d(0), totalOut = d(0), totalClosing = d(0);

    for (const acc of accounts) {
      const { opening, movementDebit, movementCredit, closing } = await AccountBalance.ledger(
        acc.id,
        { from: fromD, to: toStart },
      );
      const vouchers = await prisma.voucher.findMany({
        where: {
          deletedAt: null,
          date: { gte: fromD, lt: toExclusive },
          OR: [{ debitAccountId: acc.id }, { creditAccountId: acc.id }],
        },
        include: {
          debitAccount: { select: { code: true, name: true } },
          creditAccount: { select: { code: true, name: true } },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      });
      sections.push({
        account: { id: acc.id, code: acc.code, name: acc.name, type: acc.type },
        opening: opening.toFixed(2),
        totalIn: movementDebit.toFixed(2),
        totalOut: movementCredit.toFixed(2),
        closing: closing.toFixed(2),
        lines: vouchers.map((v) => {
          const isIn = v.debitAccountId === acc.id;
          const contra = isIn ? v.creditAccount : v.debitAccount;
          return {
            date: v.date, voucherNo: v.voucherNo,
            remark: v.remark ?? v.category ?? `${contra.code} ${contra.name}`,
            debit: isIn ? v.amount.toFixed(2) : "0.00",
            credit: isIn ? "0.00" : v.amount.toFixed(2),
          };
        }),
      });
      totalOpening = totalOpening.plus(opening);
      totalIn = totalIn.plus(movementDebit);
      totalOut = totalOut.plus(movementCredit);
      totalClosing = totalClosing.plus(closing);
    }

    return {
      range: { from, to },
      sections,
      totals: { opening: totalOpening.toFixed(2), totalIn: totalIn.toFixed(2), totalOut: totalOut.toFixed(2), closing: totalClosing.toFixed(2) },
    };
  },

  /** §15.4 Supplier Summary — per supplier: opening, receivings, payments, balance. */
  async supplierSummary(from: string, to: string) {
    const { fromD, toStart } = rangeBounds(from, to);
    const suppliers = await prisma.account.findMany({
      where: { deletedAt: null, type: "supplier" },
      orderBy: { code: "asc" },
    });
    const rows = [];
    let tOpen = d(0), tRecv = d(0), tPaid = d(0), tBal = d(0);
    for (const s of suppliers) {
      const led = await AccountBalance.ledger(s.id, { from: fromD, to: toStart });
      // Supplier payable is credit-normal: receivings = credits, payments = debits.
      const opening = led.opening;
      const receivings = led.movementCredit;
      const payments = led.movementDebit;
      const balance = led.closing;
      rows.push({
        id: s.id, code: s.code, name: s.name,
        opening: opening.toFixed(2), receivings: receivings.toFixed(2),
        payments: payments.toFixed(2), balance: balance.toFixed(2),
      });
      tOpen = tOpen.plus(opening); tRecv = tRecv.plus(receivings); tPaid = tPaid.plus(payments); tBal = tBal.plus(balance);
    }
    return { range: { from, to }, rows, totals: { opening: tOpen.toFixed(2), receivings: tRecv.toFixed(2), payments: tPaid.toFixed(2), balance: tBal.toFixed(2) } };
  },

  /**
   * §15.5 Bookings Master Report — all bookings in range (by event date): ref,
   * date, host, hall, type, guests, Total, Payments, Balance, Expense, Net Profit.
   * `userId` (when provided) scopes to that salesperson's own bookings.
   */
  async bookingsMaster(from: string, to: string, scopeUserId?: number) {
    const { fromD, toExclusive } = rangeBounds(from, to);
    const bookings = await prisma.booking.findMany({
      where: {
        deletedAt: null,
        eventDate: { gte: fromD, lt: toExclusive },
        ...(scopeUserId ? { createdById: scopeUserId } : {}),
      },
      include: {
        customer: { select: { name: true } },
        hall: { select: { name: true } },
        eventCosts: { where: { deletedAt: null }, select: { amount: true } },
      },
      orderBy: { eventDate: "asc" },
    });

    let tTotal = d(0), tPaid = d(0), tBal = d(0), tExp = d(0), tProfit = d(0);
    const rows = bookings.map((b) => {
      const expense = b.eventCosts.reduce((a, c) => a.plus(c.amount), new Prisma.Decimal(0));
      const netProfit = d(b.grandTotal).minus(expense);
      tTotal = tTotal.plus(b.grandTotal); tPaid = tPaid.plus(b.advanceTotal);
      tBal = tBal.plus(b.due); tExp = tExp.plus(expense); tProfit = tProfit.plus(netProfit);
      return {
        bookingNo: b.bookingNo, eventDate: b.eventDate, host: b.customer.name,
        hall: b.hall.name, eventType: b.eventType ?? "", guests: b.guests, status: b.status,
        total: d(b.grandTotal).toFixed(2), payments: d(b.advanceTotal).toFixed(2),
        balance: d(b.due).toFixed(2), expense: expense.toFixed(2), netProfit: netProfit.toFixed(2),
      };
    });

    return {
      range: { from, to }, count: rows.length, rows,
      totals: { total: tTotal.toFixed(2), payments: tPaid.toFixed(2), balance: tBal.toFixed(2), expense: tExp.toFixed(2), netProfit: tProfit.toFixed(2) },
    };
  },

  /** §15.6 Profit & Loss — income heads vs expense heads for the period. */
  async profitAndLoss(from: string, to: string) {
    const { fromD, toExclusive } = rangeBounds(from, to);
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null, type: { in: ["income", "expense"] } },
      orderBy: { code: "asc" },
    });

    const income = [], expense = [];
    let totalIncome = d(0), totalExpense = d(0);
    for (const acc of accounts) {
      const mv = await AccountBalance.movement(acc.id, { from: fromD, to: toExclusive });
      const natural = toNormalSide(acc.type, mv); // income: credits-debits; expense: debits-credits
      if (acc.type === "income") {
        income.push({ code: acc.code, name: acc.name, amount: natural.toFixed(2) });
        totalIncome = totalIncome.plus(natural);
      } else {
        expense.push({ code: acc.code, name: acc.name, amount: natural.toFixed(2) });
        totalExpense = totalExpense.plus(natural);
      }
    }
    const netProfit = totalIncome.minus(totalExpense);
    return {
      range: { from, to },
      income, expense,
      totals: { income: totalIncome.toFixed(2), expense: totalExpense.toFixed(2), netProfit: netProfit.toFixed(2) },
    };
  },
};
