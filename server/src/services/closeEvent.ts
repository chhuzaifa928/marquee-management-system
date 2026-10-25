import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { AppError } from "../lib/errors";
import { d, gt, toPrisma } from "../lib/money";
import { writeAudit } from "../lib/audit";
import { createVoucher, reverseBatch } from "./vouchers";
import { ACCOUNT_CODES, CHARGE_INCOME_MAP, getAccountByCode } from "./accounts";

/**
 * §6.3 #2 — Close Event → revenue recognition (JV batch), only after a booking
 * is fully paid. Posts, sharing one batchUid:
 *   Dr Customer Advances (2100) · Cr each income head NET of GST (per the
 *   charge→income map; per-head headcharge → Food Sales 4100)
 *   Dr Customer Advances (2100) · Cr GST Payable (2200) for the GST amount
 * Idempotent on eventClosedAt. Costing opens once the event is closed.
 */
export async function closeEvent(bookingId: number, userId?: number | null) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirstOrThrow({
      where: { id: bookingId, deletedAt: null },
      include: { charges: { where: { deletedAt: null } } },
    });

    if (booking.status !== "paid") {
      throw AppError.badRequest("Only a fully-paid booking can be closed");
    }
    if (booking.eventClosedAt) {
      return { alreadyClosed: true as const, bookingId }; // idempotent
    }

    const advances = await getAccountByCode(ACCOUNT_CODES.customerAdvances, tx);
    const gstPayable = await getAccountByCode(ACCOUNT_CODES.gstPayable, tx);

    // Build income lines: headcharge → Food Sales, then charges grouped by head.
    const incomeByCode = new Map<string, Prisma.Decimal>();
    const addIncome = (code: string, amount: Prisma.Decimal | number | string) => {
      incomeByCode.set(code, d(incomeByCode.get(code) ?? 0).plus(d(amount)));
    };
    if (gt(booking.headchargeTotal, 0)) addIncome(ACCOUNT_CODES.foodSales, booking.headchargeTotal);
    for (const charge of booking.charges) {
      const code = CHARGE_INCOME_MAP[charge.chargeType] ?? ACCOUNT_CODES.otherCharges;
      if (gt(charge.amount, 0)) addIncome(code, charge.amount);
    }

    const batchUid = randomUUID();
    const vouchers = [];

    for (const [code, amount] of incomeByCode) {
      const head = await getAccountByCode(code, tx);
      vouchers.push(
        await createVoucher(tx, {
          type: "JV",
          date: new Date(),
          category: "Revenue recognition",
          remark: `Close event ${booking.bookingNo} — ${head.name}`,
          debitAccountId: advances.id,
          creditAccountId: head.id,
          amount: toPrisma(amount),
          sourceType: "booking",
          sourceId: booking.id,
          batchUid,
          createdById: userId,
        }),
      );
    }

    if (gt(booking.gstAmount, 0)) {
      vouchers.push(
        await createVoucher(tx, {
          type: "JV",
          date: new Date(),
          category: "GST on revenue",
          remark: `Close event ${booking.bookingNo} — GST`,
          debitAccountId: advances.id,
          creditAccountId: gstPayable.id,
          amount: toPrisma(booking.gstAmount),
          sourceType: "booking",
          sourceId: booking.id,
          batchUid,
          createdById: userId,
        }),
      );
    }

    await tx.booking.update({
      where: { id: bookingId },
      data: { eventClosedAt: new Date() },
    });
    await writeAudit(tx, {
      userId,
      action: "update",
      model: "Booking",
      modelId: bookingId,
      newData: { eventClosedAt: true, batchUid, vouchers: vouchers.length },
    });

    return { alreadyClosed: false as const, bookingId, batchUid, vouchers: vouchers.length };
  });
}

/** Reverse a closed event: soft-delete the revenue batch and reopen it. */
export async function reopenEvent(bookingId: number, userId?: number | null) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirstOrThrow({ where: { id: bookingId } });
    if (!booking.eventClosedAt) return { reopened: false as const };

    // Find the revenue-recognition batch for this booking.
    const sample = await tx.voucher.findFirst({
      where: { sourceType: "booking", sourceId: bookingId, type: "JV", deletedAt: null, batchUid: { not: null } },
    });
    if (sample?.batchUid) await reverseBatch(tx, sample.batchUid, userId);

    await tx.booking.update({ where: { id: bookingId }, data: { eventClosedAt: null } });
    await writeAudit(tx, {
      userId,
      action: "update",
      model: "Booking",
      modelId: bookingId,
      newData: { eventClosedAt: null, reopened: true },
    });
    return { reopened: true as const };
  });
}
