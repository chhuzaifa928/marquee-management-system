import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { add, d, mul, round2, sub, sum, toPrisma } from "../lib/money";

type Client = Prisma.TransactionClient | typeof prisma;

export interface TotalsInput {
  discountedRate: Prisma.Decimal | number | string;
  guests: number;
  gstRate: Prisma.Decimal | number | string; // snapshot rate
  chargeAmounts: (Prisma.Decimal | number | string)[];
  slipAmounts: (Prisma.Decimal | number | string)[];
}

export interface Totals {
  headchargeTotal: Prisma.Decimal;
  chargesTotal: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  advanceTotal: Prisma.Decimal;
  due: Prisma.Decimal;
}

/**
 * Pure totals calculation (§4.4). Uses the SNAPSHOT gstRate passed in, never the
 * live settings rate, so historical bookings stay stable when the rate changes.
 */
export function computeTotals(input: TotalsInput): Totals {
  const headcharge = round2(mul(input.discountedRate, input.guests));
  const chargesTotal = sum(input.chargeAmounts);
  const subtotal = round2(add(headcharge, chargesTotal));
  const gstAmount = round2(mul(subtotal, d(input.gstRate).div(100)));
  const grandTotal = round2(add(subtotal, gstAmount));
  const advanceTotal = sum(input.slipAmounts);
  const due = round2(sub(grandTotal, advanceTotal));

  return {
    headchargeTotal: toPrisma(headcharge),
    chargesTotal: toPrisma(chargesTotal),
    subtotal: toPrisma(subtotal),
    gstAmount: toPrisma(gstAmount),
    grandTotal: toPrisma(grandTotal),
    advanceTotal: toPrisma(advanceTotal),
    due: toPrisma(due),
  };
}

export const BookingTotals = {
  /**
   * Recompute a booking's snapshot totals from authoritative DB rows (charges +
   * slips), then persist them onto the booking. Returns the booking's computed
   * totals. Always sums from the database, never stale in-memory collections.
   */
  async recompute(bookingId: number, client: Client = prisma): Promise<Totals> {
    const booking = await client.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { discountedRate: true, guests: true, gstRate: true },
    });

    const [charges, slips] = await Promise.all([
      client.bookingCharge.findMany({
        where: { bookingId, deletedAt: null },
        select: { amount: true },
      }),
      client.paymentSlip.findMany({
        where: { bookingId, deletedAt: null },
        select: { amount: true },
      }),
    ]);

    const totals = computeTotals({
      discountedRate: booking.discountedRate,
      guests: booking.guests,
      gstRate: booking.gstRate,
      chargeAmounts: charges.map((c) => c.amount),
      slipAmounts: slips.map((s) => s.amount),
    });

    await client.booking.update({ where: { id: bookingId }, data: totals });
    return totals;
  },
};
