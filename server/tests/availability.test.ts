import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/prisma";
import { AvailabilityService } from "../src/services/availability";
import { seedHalls } from "./helpers";
import { startOfDay } from "../src/lib/dates";

let pearl: number;
let emerald: number;
let customerId: number;

async function makeBooking(opts: {
  hallId: number;
  date: string;
  slot: "lunch" | "dinner";
  status: "tentative" | "booked" | "paid" | "cancelled";
  confirmedAt?: Date;
  no: string;
}) {
  return prisma.booking.create({
    data: {
      bookingNo: opts.no,
      customerId,
      hallId: opts.hallId,
      eventDate: startOfDay(opts.date),
      slot: opts.slot,
      status: opts.status,
      guests: 100,
      gstRate: 16,
      confirmedAt: opts.confirmedAt ?? null,
    },
  });
}

describe("AvailabilityService — first-confirmed-wins, halls independent", () => {
  beforeEach(async () => {
    const halls = await seedHalls();
    pearl = halls["Pearl Hall"]!;
    emerald = halls["Emerald Hall"]!;
    const c = await prisma.customer.create({ data: { code: "CUST-0001", name: "Test" } });
    customerId = c.id;
  });

  const DATE = "2026-12-25";

  it("many tentatives may overlap the same slot (none blocks)", async () => {
    await makeBooking({ hallId: pearl, date: DATE, slot: "dinner", status: "tentative", no: "BKG-0001" });
    await makeBooking({ hallId: pearl, date: DATE, slot: "dinner", status: "tentative", no: "BKG-0002" });
    expect(await AvailabilityService.canConfirm(pearl, DATE, "dinner")).toBe(true);
    const overlaps = await AvailabilityService.tentativeOverlaps(pearl, DATE, "dinner");
    expect(overlaps).toHaveLength(2);
  });

  it("a confirmed booking takes the slot; canConfirm becomes false", async () => {
    const confirmed = await makeBooking({
      hallId: pearl,
      date: DATE,
      slot: "dinner",
      status: "booked",
      confirmedAt: new Date(),
      no: "BKG-0001",
    });
    expect(await AvailabilityService.canConfirm(pearl, DATE, "dinner")).toBe(false);
    const conflict = await AvailabilityService.confirmedConflict(pearl, DATE, "dinner");
    expect(conflict?.id).toBe(confirmed.id);
  });

  it("returns the FIRST confirmed booking by confirmedAt", async () => {
    const early = await makeBooking({
      hallId: pearl, date: DATE, slot: "dinner", status: "booked",
      confirmedAt: new Date("2026-01-01T10:00:00Z"), no: "BKG-0001",
    });
    await makeBooking({
      hallId: pearl, date: DATE, slot: "dinner", status: "paid",
      confirmedAt: new Date("2026-01-02T10:00:00Z"), no: "BKG-0002",
    });
    const conflict = await AvailabilityService.confirmedConflict(pearl, DATE, "dinner");
    expect(conflict?.id).toBe(early.id);
  });

  it("halls are independent — a confirm in Pearl never blocks Emerald", async () => {
    await makeBooking({
      hallId: pearl, date: DATE, slot: "dinner", status: "booked",
      confirmedAt: new Date(), no: "BKG-0001",
    });
    expect(await AvailabilityService.canConfirm(emerald, DATE, "dinner")).toBe(true);
  });

  it("slots are independent — lunch confirm never blocks dinner", async () => {
    await makeBooking({
      hallId: pearl, date: DATE, slot: "lunch", status: "booked",
      confirmedAt: new Date(), no: "BKG-0001",
    });
    expect(await AvailabilityService.canConfirm(pearl, DATE, "dinner")).toBe(true);
  });

  it("ignoreId excludes a booking from its own conflict check", async () => {
    const b = await makeBooking({
      hallId: pearl, date: DATE, slot: "dinner", status: "booked",
      confirmedAt: new Date(), no: "BKG-0001",
    });
    expect(await AvailabilityService.canConfirm(pearl, DATE, "dinner", b.id)).toBe(true);
  });

  it("a cancelled booking does not hold the slot", async () => {
    await makeBooking({
      hallId: pearl, date: DATE, slot: "dinner", status: "cancelled",
      confirmedAt: new Date(), no: "BKG-0001",
    });
    expect(await AvailabilityService.canConfirm(pearl, DATE, "dinner")).toBe(true);
  });
});
