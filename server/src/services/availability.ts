import { type Booking, type Slot, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { startOfDay, nextDay } from "../lib/dates";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Hall availability (§4.2). Halls are fully independent — there is NO cross-hall
 * blocking and NO database unique constraint on (hall,date,slot). "Taken" is a
 * code rule: a slot is held only once a booking is CONFIRMED (booked | paid).
 * Many tentatives may overlap the same hall+date+slot; first-confirmed wins.
 */
export const AvailabilityService = {
  /**
   * The first confirmed booking holding this hall+date+slot (ordered by
   * confirmedAt), or null. `ignoreId` excludes a booking from the check (e.g.
   * when re-checking the booking that is itself about to confirm).
   */
  async confirmedConflict(
    hallId: number,
    date: Date | string,
    slot: Slot,
    ignoreId?: number,
    client: Client = prisma,
  ): Promise<Booking | null> {
    return client.booking.findFirst({
      where: {
        hallId,
        slot,
        deletedAt: null,
        status: { in: ["booked", "paid"] },
        eventDate: { gte: startOfDay(date), lt: nextDay(date) },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      orderBy: { confirmedAt: "asc" },
    });
  },

  /** Other tentative bookings overlapping this slot — used to WARN sales. */
  async tentativeOverlaps(
    hallId: number,
    date: Date | string,
    slot: Slot,
    ignoreId?: number,
    client: Client = prisma,
  ): Promise<Booking[]> {
    return client.booking.findMany({
      where: {
        hallId,
        slot,
        deletedAt: null,
        status: "tentative",
        eventDate: { gte: startOfDay(date), lt: nextDay(date) },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /** True when no confirmed booking holds the slot. */
  async canConfirm(
    hallId: number,
    date: Date | string,
    slot: Slot,
    ignoreId?: number,
    client: Client = prisma,
  ): Promise<boolean> {
    const conflict = await this.confirmedConflict(hallId, date, slot, ignoreId, client);
    return conflict === null;
  },
};
