import { type PaymentMethod } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { gt, toPrisma } from "../../lib/money";
import { writeAudit } from "../../lib/audit";
import { NumberSequenceService, SEQ } from "../../services/numberSequence";
import { getAccountById } from "../../services/accounts";
import {
  applyPaymentPosting,
  postReceipt,
  reverseReceipt,
} from "../../services/paymentPosting";

export interface SlipInput {
  bookingId: number;
  accountId: number;
  amount: number | string;
  method?: PaymentMethod;
  reference?: string | null;
  remark?: string | null;
  date?: string;
}

export const PaymentsService = {
  /**
   * Record a payment slip: allocate a gapless slipNo, post its Receipt Voucher,
   * and run the booking status machine — all in one transaction so money and
   * state never diverge.
   */
  async createSlip(input: SlipInput, userId?: number) {
    if (!gt(input.amount, 0)) throw AppError.badRequest("Amount must be greater than zero");

    const booking = await prisma.booking.findFirst({
      where: { id: input.bookingId, deletedAt: null },
    });
    if (!booking) throw AppError.notFound("Booking not found");
    if (booking.status === "cancelled") {
      throw AppError.badRequest("Cannot record a payment against a cancelled booking");
    }
    if (booking.eventClosedAt) {
      throw AppError.conflict(
        "This event is closed (revenue recognised). Reopen it before recording more payments.",
      );
    }

    const account = await getAccountById(input.accountId);
    if (account.type !== "cash" && account.type !== "bank") {
      throw AppError.badRequest("Payments must be received into a cash or bank account");
    }

    const result = await prisma.$transaction(async (tx) => {
      const slipNo = await NumberSequenceService.next(SEQ.slip.key, SEQ.slip.prefix, 4, tx);
      const slip = await tx.paymentSlip.create({
        data: {
          slipNo,
          bookingId: input.bookingId,
          accountId: input.accountId,
          amount: toPrisma(input.amount),
          method: input.method ?? "cash",
          reference: input.reference ?? null,
          remark: input.remark ?? null,
          date: input.date ? new Date(input.date) : new Date(),
          createdById: userId ?? null,
        },
      });
      await writeAudit(tx, {
        userId,
        action: "create",
        model: "PaymentSlip",
        modelId: slip.id,
        newData: { slipNo, amount: slip.amount, bookingId: input.bookingId },
      });

      await postReceipt(tx, slip.id, userId);
      const posting = await applyPaymentPosting(tx, input.bookingId, userId);
      return { slipId: slip.id, slipNo, posting };
    });

    return {
      slipNo: result.slipNo,
      bookingStatus: result.posting?.status,
      booking: await this.bookingBrief(input.bookingId),
    };
  },

  /**
   * Delete a payment slip: reverse its RV, soft-delete the slip, and re-run the
   * status machine (which may revert a paid booking to booked, or a booked one
   * to tentative). Restricted to super_admin at the route layer.
   */
  async deleteSlip(slipId: number, userId?: number) {
    const slip = await prisma.paymentSlip.findFirst({
      where: { id: slipId, deletedAt: null },
      include: { booking: { select: { eventClosedAt: true } } },
    });
    if (!slip) throw AppError.notFound("Payment slip not found");
    if (slip.booking.eventClosedAt) {
      throw AppError.conflict(
        "This event is closed (revenue recognised). Reopen it before deleting its payments.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await reverseReceipt(tx, slipId, userId);
      await tx.paymentSlip.update({
        where: { id: slipId },
        data: { deletedAt: new Date() },
      });
      await writeAudit(tx, {
        userId,
        action: "delete",
        model: "PaymentSlip",
        modelId: slipId,
        oldData: { slipNo: slip.slipNo, amount: slip.amount },
      });
      await applyPaymentPosting(tx, slip.bookingId, userId);
    });

    return this.bookingBrief(slip.bookingId);
  },

  async listSlips(params: { bookingId?: number; take?: number; skip?: number }) {
    const where = {
      deletedAt: null,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.paymentSlip.findMany({
        where,
        include: {
          account: { select: { code: true, name: true } },
          booking: { select: { bookingNo: true, customer: { select: { name: true } } } },
          voucher: { select: { voucherNo: true } },
        },
        orderBy: { date: "desc" },
        take: params.take ?? 50,
        skip: params.skip ?? 0,
      }),
      prisma.paymentSlip.count({ where }),
    ]);
    return {
      data: rows.map((s) => ({
        id: s.id,
        slipNo: s.slipNo,
        bookingId: s.bookingId,
        bookingNo: s.booking.bookingNo,
        customer: s.booking.customer.name,
        account: `${s.account.code} ${s.account.name}`,
        amount: s.amount.toFixed(2),
        method: s.method,
        reference: s.reference,
        voucherNo: s.voucher?.voucherNo ?? null,
        date: s.date,
      })),
      total,
    };
  },

  async bookingBrief(bookingId: number) {
    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        id: true,
        bookingNo: true,
        status: true,
        isLocked: true,
        grandTotal: true,
        advanceTotal: true,
        due: true,
      },
    });
    return {
      id: b.id,
      bookingNo: b.bookingNo,
      status: b.status,
      isLocked: b.isLocked,
      grandTotal: b.grandTotal.toFixed(2),
      advanceTotal: b.advanceTotal.toFixed(2),
      due: b.due.toFixed(2),
    };
  },
};
