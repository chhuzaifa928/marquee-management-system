import { Prisma } from "@prisma/client";
import { writeAudit } from "../lib/audit";
import { d, gt, lte } from "../lib/money";
import { BookingTotals } from "./bookingTotals";
import { AvailabilityService } from "./availability";
import { createVoucher, reverseVoucher } from "./vouchers";
import { ACCOUNT_CODES, getAccountByCode } from "./accounts";

type Tx = Prisma.TransactionClient;

/**
 * §6.3 #1 — Payment slip → Receipt Voucher (RV).
 * Dr Cash/Bank (account money was received into) · Cr Customer Advances (2100),
 * for the GROSS amount (incl. GST). Idempotent: if the slip already has a
 * voucher, do nothing.
 */
export async function postReceipt(tx: Tx, slipId: number, userId?: number | null) {
  const slip = await tx.paymentSlip.findUniqueOrThrow({ where: { id: slipId } });
  if (slip.voucherId) return; // already posted — idempotent

  const advances = await getAccountByCode(ACCOUNT_CODES.customerAdvances, tx);

  const voucher = await createVoucher(tx, {
    type: "RV",
    date: slip.date,
    category: "receipt",
    remark: `Receipt for slip ${slip.slipNo}`,
    debitAccountId: slip.accountId, // cash/bank received into
    creditAccountId: advances.id, // customer advances
    amount: slip.amount,
    sourceType: "paymentSlip",
    sourceId: slip.id,
    createdById: userId ?? slip.createdById,
  });

  await tx.paymentSlip.update({
    where: { id: slip.id },
    data: { voucherId: voucher.id },
  });
  return voucher;
}

/** Reverse an RV: soft-delete the voucher and unlink it from the slip. */
export async function reverseReceipt(tx: Tx, slipId: number, userId?: number | null) {
  const slip = await tx.paymentSlip.findUniqueOrThrow({ where: { id: slipId } });
  if (!slip.voucherId) return;
  await reverseVoucher(tx, slip.voucherId, userId);
  await tx.paymentSlip.update({ where: { id: slip.id }, data: { voucherId: null } });
}

/**
 * §4.3 — PaymentPosting.apply. Run after any slip create/edit/delete.
 *  1. Recompute totals from DB.
 *  2. First advance moves tentative → booked ONLY if canConfirm (first-to-pay
 *     wins); sets confirmedAt/confirmedById.
 *  3. due <= 0 && grand > 0 → paid + isLocked.
 *  4. A later drop below fully-paid reverts paid → booked and unlocks; removing
 *     all advances releases the slot back to tentative. cancelled is terminal.
 */
export async function applyPaymentPosting(
  tx: Tx,
  bookingId: number,
  userId?: number | null,
) {
  const totals = await BookingTotals.recompute(bookingId, tx);
  const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status === "cancelled") return; // terminal

  const grand = d(totals.grandTotal);
  const advance = d(totals.advanceTotal);
  const due = d(totals.due);

  let status = booking.status;
  let isLocked = booking.isLocked;
  let confirmedAt = booking.confirmedAt;
  let confirmedById = booking.confirmedById;

  const fullyPaid = gt(grand, 0) && lte(due, 0);

  if (fullyPaid) {
    status = "paid";
    isLocked = true;
    if (!confirmedAt) {
      confirmedAt = new Date();
      confirmedById = userId ?? confirmedById ?? null;
    }
  } else if (gt(advance, 0)) {
    // Some advance, not fully paid.
    if (booking.status === "paid") {
      // dropped below fully-paid → revert to booked + unlock
      status = "booked";
      isLocked = false;
    } else if (booking.status === "tentative") {
      // First advance: confirm only if the slot is still open (first-to-pay wins).
      const canConfirm = await AvailabilityService.canConfirm(
        booking.hallId,
        booking.eventDate,
        booking.slot,
        booking.id,
        tx,
      );
      if (canConfirm) {
        status = "booked";
        confirmedAt = confirmedAt ?? new Date();
        confirmedById = confirmedById ?? userId ?? null;
      }
    }
  } else {
    // No advance at all → release the slot back to tentative.
    if (booking.status === "paid" || booking.status === "booked") {
      status = "tentative";
      isLocked = false;
      confirmedAt = null;
      confirmedById = null;
    }
  }

  if (
    status !== booking.status ||
    isLocked !== booking.isLocked ||
    confirmedAt !== booking.confirmedAt
  ) {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status, isLocked, confirmedAt, confirmedById },
    });
    await writeAudit(tx, {
      userId,
      action: "update",
      model: "Booking",
      modelId: bookingId,
      oldData: { status: booking.status, isLocked: booking.isLocked },
      newData: { status, isLocked },
    });
  }

  return { status, isLocked, totals };
}
