import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/prisma";
import { computeTotals, BookingTotals } from "../src/services/bookingTotals";
import { seedHalls, seedSettings } from "./helpers";
import { startOfDay } from "../src/lib/dates";

describe("computeTotals (pure, §4.4)", () => {
  it("computes head charge, GST and grand total from the snapshot rate", () => {
    const t = computeTotals({
      discountedRate: "1200.00",
      guests: 350,
      gstRate: "16.00",
      chargeAmounts: ["50000.00", "25000.00"],
      slipAmounts: ["100000.00"],
    });
    expect(t.headchargeTotal.toFixed(2)).toBe("420000.00"); // 1200*350
    expect(t.chargesTotal.toFixed(2)).toBe("75000.00");
    expect(t.subtotal.toFixed(2)).toBe("495000.00");
    expect(t.gstAmount.toFixed(2)).toBe("79200.00"); // 16% of 495000
    expect(t.grandTotal.toFixed(2)).toBe("574200.00");
    expect(t.advanceTotal.toFixed(2)).toBe("100000.00");
    expect(t.due.toFixed(2)).toBe("474200.00");
  });

  it("rounds GST half-up to 2dp without float drift", () => {
    const t = computeTotals({
      discountedRate: "333.33",
      guests: 3,
      gstRate: "16.00",
      chargeAmounts: [],
      slipAmounts: [],
    });
    // 333.33*3 = 999.99; GST 16% = 159.9984 -> 160.00
    expect(t.headchargeTotal.toFixed(2)).toBe("999.99");
    expect(t.gstAmount.toFixed(2)).toBe("160.00");
    expect(t.grandTotal.toFixed(2)).toBe("1159.99");
  });
});

describe("BookingTotals.recompute (DB-backed) + GST snapshot stability", () => {
  let hallId: number;
  let customerId: number;

  beforeEach(async () => {
    await seedSettings();
    const halls = await seedHalls();
    hallId = halls["Pearl Hall"]!;
    const c = await prisma.customer.create({ data: { code: "CUST-0001", name: "Test" } });
    customerId = c.id;
  });

  async function makeBooking(gstRate: number) {
    return prisma.booking.create({
      data: {
        bookingNo: `BKG-${Math.floor(Math.random() * 1e6)}`,
        customerId,
        hallId,
        eventDate: startOfDay("2026-12-01"),
        slot: "dinner",
        guests: 100,
        discountedRate: 1000,
        gstRate,
      },
    });
  }

  it("recomputes totals from DB charges and slips", async () => {
    const b = await makeBooking(16);
    await prisma.bookingCharge.create({
      data: { bookingId: b.id, chargeType: "dj", quantity: 1, unitPrice: 20000, amount: 20000 },
    });
    await prisma.paymentSlip.create({
      data: { slipNo: "SLIP-0001", bookingId: b.id, accountId: await cashAccount(), amount: 50000 },
    });

    await BookingTotals.recompute(b.id);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(after.headchargeTotal.toFixed(2)).toBe("100000.00"); // 1000*100
    expect(after.chargesTotal.toFixed(2)).toBe("20000.00");
    expect(after.subtotal.toFixed(2)).toBe("120000.00");
    expect(after.gstAmount.toFixed(2)).toBe("19200.00");
    expect(after.grandTotal.toFixed(2)).toBe("139200.00");
    expect(after.advanceTotal.toFixed(2)).toBe("50000.00");
    expect(after.due.toFixed(2)).toBe("89200.00");
  });

  it("uses the booking's snapshot gstRate, not the live settings rate", async () => {
    const b = await makeBooking(16); // snapshot 16%
    // Raise the global GST rate afterwards.
    await prisma.settings.update({ where: { id: 1 }, data: { gstRate: 25 } });

    await BookingTotals.recompute(b.id);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    // Still 16% of 100000 = 16000, NOT 25%.
    expect(after.gstAmount.toFixed(2)).toBe("16000.00");
    expect(after.grandTotal.toFixed(2)).toBe("116000.00");
  });

  async function cashAccount(): Promise<number> {
    const existing = await prisma.account.findUnique({ where: { code: "1010" } });
    if (existing) return existing.id;
    const acc = await prisma.account.create({
      data: { code: "1010", name: "Cash", type: "cash" },
    });
    return acc.id;
  }
});
