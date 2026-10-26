import { Prisma, type ChargeType, type Slot } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";
import { round2, toPrisma } from "../../lib/money";
import { startOfDay, startOfMonth, startOfNextMonth } from "../../lib/dates";
import { NumberSequenceService, SEQ } from "../../services/numberSequence";
import { BookingTotals } from "../../services/bookingTotals";
import { AvailabilityService } from "../../services/availability";
import { getSettings } from "../settings/settings.service";

export interface ChargeInput {
  chargeType: ChargeType;
  description?: string | null;
  quantity: number | string;
  unitPrice: number | string;
}

export interface FoodInput {
  name: string;
  urduName?: string | null;
  sort?: number;
}

export interface BookingCreateInput {
  customerId: number;
  hallId: number;
  eventDate: string;
  slot: Slot;
  startTime?: string | null;
  endTime?: string | null;
  eventType?: string | null;
  guests: number;
  rackRate: number | string;
  discountedRate: number | string;
  remarks?: string | null;
  arrangements?: string | null;
  bulletinBoard?: string | null;
  charges?: ChargeInput[];
  foods?: FoodInput[];
}

const EDITABLE_STATUSES = new Set(["tentative", "booked"]);

function chargeAmount(input: ChargeInput): Prisma.Decimal {
  return toPrisma(round2(new Prisma.Decimal(input.quantity).times(input.unitPrice)));
}

async function assertEditable(bookingId: number) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: { status: true, isLocked: true },
  });
  if (!b) throw AppError.notFound("Booking not found");
  if (b.isLocked || !EDITABLE_STATUSES.has(b.status)) {
    throw AppError.locked(
      `This booking is ${b.status}${b.isLocked ? " and locked" : ""} and cannot be edited.`,
    );
  }
}

export const BookingsService = {
  async create(input: BookingCreateInput, userId?: number) {
    const [customer, hall, settings] = await Promise.all([
      prisma.customer.findUnique({ where: { id: input.customerId } }),
      prisma.hall.findUnique({ where: { id: input.hallId } }),
      getSettings(),
    ]);
    if (!customer) throw AppError.badRequest("Customer not found");
    if (!hall || !hall.isActive) throw AppError.badRequest("Hall not found or inactive");

    const booking = await prisma.$transaction(async (tx) => {
      const bookingNo = await NumberSequenceService.next(
        SEQ.booking.key,
        SEQ.booking.prefix,
        4,
        tx,
      );

      const created = await tx.booking.create({
        data: {
          bookingNo,
          customerId: input.customerId,
          hallId: input.hallId,
          eventDate: startOfDay(input.eventDate),
          slot: input.slot,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          eventType: input.eventType ?? null,
          guests: input.guests,
          rackRate: toPrisma(input.rackRate),
          discountedRate: toPrisma(input.discountedRate),
          status: "tentative",
          gstRate: settings.gstRate, // SNAPSHOT at creation
          remarks: input.remarks ?? null,
          arrangements: input.arrangements ?? null,
          bulletinBoard: input.bulletinBoard ?? null,
          createdById: userId ?? null,
          charges: input.charges?.length
            ? {
                create: input.charges.map((c) => ({
                  chargeType: c.chargeType,
                  description: c.description ?? null,
                  quantity: toPrisma(c.quantity),
                  unitPrice: toPrisma(c.unitPrice),
                  amount: chargeAmount(c),
                })),
              }
            : undefined,
          foods: input.foods?.length
            ? {
                create: input.foods.map((f, i) => ({
                  name: f.name,
                  urduName: f.urduName ?? null,
                  sort: f.sort ?? i,
                })),
              }
            : undefined,
        },
      });

      await BookingTotals.recompute(created.id, tx);
      await writeAudit(tx, {
        userId,
        action: "create",
        model: "Booking",
        modelId: created.id,
        newData: { bookingNo, customerId: input.customerId, hallId: input.hallId },
      });
      return created;
    });

    const warning = await this.availabilityInfo(
      input.hallId,
      input.eventDate,
      input.slot,
      booking.id,
    );
    return { booking: await this.getById(booking.id), availability: warning };
  },

  async update(id: number, input: Partial<BookingCreateInput>, userId?: number) {
    await assertEditable(id);

    // If a CONFIRMED (booked) booking is being moved to a different hall/date/slot,
    // re-check availability so it can't land on a slot another booking has taken.
    if (input.hallId !== undefined || input.eventDate !== undefined || input.slot !== undefined) {
      const current = await prisma.booking.findUniqueOrThrow({
        where: { id },
        select: { status: true, hallId: true, eventDate: true, slot: true },
      });
      if (current.status === "booked") {
        const hallId = input.hallId ?? current.hallId;
        const date = input.eventDate ?? current.eventDate;
        const slot = input.slot ?? current.slot;
        const ok = await AvailabilityService.canConfirm(hallId, date, slot, id);
        if (!ok) {
          throw AppError.conflict("That hall/date/slot is already confirmed by another booking.");
        }
      }
    }

    const data: Prisma.BookingUpdateInput = {};
    if (input.eventDate !== undefined) data.eventDate = startOfDay(input.eventDate);
    if (input.slot !== undefined) data.slot = input.slot;
    if (input.startTime !== undefined) data.startTime = input.startTime;
    if (input.endTime !== undefined) data.endTime = input.endTime;
    if (input.eventType !== undefined) data.eventType = input.eventType;
    if (input.guests !== undefined) data.guests = input.guests;
    if (input.rackRate !== undefined) data.rackRate = toPrisma(input.rackRate);
    if (input.discountedRate !== undefined)
      data.discountedRate = toPrisma(input.discountedRate);
    if (input.remarks !== undefined) data.remarks = input.remarks;
    if (input.arrangements !== undefined) data.arrangements = input.arrangements;
    if (input.bulletinBoard !== undefined) data.bulletinBoard = input.bulletinBoard;
    if (input.hallId !== undefined) {
      const hall = await prisma.hall.findUnique({ where: { id: input.hallId } });
      if (!hall) throw AppError.badRequest("Hall not found");
      data.hall = { connect: { id: input.hallId } };
    }

    await prisma.$transaction(async (tx) => {
      const before = await tx.booking.findUniqueOrThrow({ where: { id } });
      await tx.booking.update({ where: { id }, data });
      await BookingTotals.recompute(id, tx);
      await writeAudit(tx, {
        userId,
        action: "update",
        model: "Booking",
        modelId: id,
        oldData: { guests: before.guests, discountedRate: before.discountedRate },
        newData: input,
      });
    });
    return this.getById(id);
  },

  async cancel(id: number, userId?: number) {
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
    });
    if (!booking) throw AppError.notFound("Booking not found");
    if (booking.status === "cancelled") return this.getById(id);
    if (booking.status === "paid" || booking.isLocked) {
      throw AppError.locked("A fully-paid/locked booking cannot be cancelled here.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { status: "cancelled" },
      });
      await writeAudit(tx, {
        userId,
        action: "update",
        model: "Booking",
        modelId: id,
        oldData: { status: booking.status },
        newData: { status: "cancelled" },
      });
    });
    return this.getById(id);
  },

  async remove(id: number, userId?: number) {
    await assertEditable(id);
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeAudit(tx, { userId, action: "delete", model: "Booking", modelId: id });
    });
  },

  // ── Charges ────────────────────────────────────────────────────────────────
  async addCharge(bookingId: number, input: ChargeInput, userId?: number) {
    await assertEditable(bookingId);
    await prisma.$transaction(async (tx) => {
      const charge = await tx.bookingCharge.create({
        data: {
          bookingId,
          chargeType: input.chargeType,
          description: input.description ?? null,
          quantity: toPrisma(input.quantity),
          unitPrice: toPrisma(input.unitPrice),
          amount: chargeAmount(input),
        },
      });
      await BookingTotals.recompute(bookingId, tx);
      await writeAudit(tx, {
        userId,
        action: "create",
        model: "BookingCharge",
        modelId: charge.id,
        newData: charge,
      });
    });
    return this.getById(bookingId);
  },

  async removeCharge(bookingId: number, chargeId: number, userId?: number) {
    await assertEditable(bookingId);
    const charge = await prisma.bookingCharge.findFirst({
      where: { id: chargeId, bookingId, deletedAt: null },
    });
    if (!charge) throw AppError.notFound("Charge not found");
    await prisma.$transaction(async (tx) => {
      await tx.bookingCharge.update({
        where: { id: chargeId },
        data: { deletedAt: new Date() },
      });
      await BookingTotals.recompute(bookingId, tx);
      await writeAudit(tx, {
        userId,
        action: "delete",
        model: "BookingCharge",
        modelId: chargeId,
        oldData: charge,
      });
    });
    return this.getById(bookingId);
  },

  // ── Decor items (added by the decor team; billed as `decor` charges) ───────
  /** Add a decor line item (fireworks, dance floor, stage decoration, …) to the bill. */
  async addDecorItem(
    bookingId: number,
    input: { item: string; quantity?: number | string; unitPrice: number | string },
    userId?: number,
  ) {
    return this.addCharge(
      bookingId,
      {
        chargeType: "decor",
        description: input.item,
        quantity: input.quantity ?? 1,
        unitPrice: input.unitPrice,
      },
      userId,
    );
  },

  /** Remove a decor item — only charges of type `decor` can be removed this way. */
  async removeDecorItem(bookingId: number, chargeId: number, userId?: number) {
    const charge = await prisma.bookingCharge.findFirst({
      where: { id: chargeId, bookingId, deletedAt: null },
    });
    if (!charge) throw AppError.notFound("Decor item not found");
    if (charge.chargeType !== "decor") {
      throw AppError.forbidden("Only decor items can be removed here");
    }
    return this.removeCharge(bookingId, chargeId, userId);
  },

  // ── Foods (menu lines) ───────────────────────────────────────────────────
  /** Replace the whole food list for a booking (simplest to keep ordering sane). */
  async setFoods(bookingId: number, foods: FoodInput[], userId?: number) {
    await assertEditable(bookingId);
    await prisma.$transaction(async (tx) => {
      await tx.bookingFood.deleteMany({ where: { bookingId } });
      if (foods.length) {
        await tx.bookingFood.createMany({
          data: foods.map((f, i) => ({
            bookingId,
            name: f.name,
            urduName: f.urduName ?? null,
            sort: f.sort ?? i,
          })),
        });
      }
      await writeAudit(tx, {
        userId,
        action: "update",
        model: "Booking",
        modelId: bookingId,
        newData: { foods: foods.length },
      });
    });
    return this.getById(bookingId);
  },

  // ── Availability ───────────────────────────────────────────────────────────
  async availabilityInfo(
    hallId: number,
    date: Date | string,
    slot: Slot,
    ignoreId?: number,
  ) {
    const [conflict, overlaps] = await Promise.all([
      AvailabilityService.confirmedConflict(hallId, date, slot, ignoreId),
      AvailabilityService.tentativeOverlaps(hallId, date, slot, ignoreId),
    ]);
    return {
      canConfirm: conflict === null,
      confirmedConflict: conflict
        ? { id: conflict.id, bookingNo: conflict.bookingNo }
        : null,
      tentativeOverlaps: overlaps.map((o) => ({
        id: o.id,
        bookingNo: o.bookingNo,
      })),
      tentativeOverlapCount: overlaps.length,
    };
  },

  // ── Calendar ─────────────────────────────────────────────────────────────
  async calendar(hallId: number, monthDate: Date | string) {
    const rows = await prisma.booking.findMany({
      where: {
        hallId,
        deletedAt: null,
        eventDate: {
          gte: startOfMonth(monthDate),
          lt: startOfNextMonth(monthDate),
        },
      },
      include: { customer: { select: { name: true } } },
      orderBy: [{ eventDate: "asc" }, { slot: "asc" }],
    });
    return rows.map((b) => ({
      id: b.id,
      bookingNo: b.bookingNo,
      customer: b.customer.name,
      eventDate: b.eventDate,
      slot: b.slot,
      status: b.status,
      guests: b.guests,
      grandTotal: b.grandTotal.toFixed(2),
    }));
  },

  // ── Read ─────────────────────────────────────────────────────────────────
  async list(params: {
    hallId?: number;
    status?: string;
    customerId?: number;
    from?: string;
    to?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.BookingWhereInput = { deletedAt: null };
    if (params.hallId) where.hallId = params.hallId;
    if (params.customerId) where.customerId = params.customerId;
    if (params.status) where.status = params.status as Prisma.BookingWhereInput["status"];
    if (params.from || params.to) {
      where.eventDate = {};
      if (params.from) where.eventDate.gte = startOfDay(params.from);
      if (params.to) where.eventDate.lte = startOfDay(params.to);
    }
    const [rows, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          hall: { select: { name: true } },
        },
        orderBy: { eventDate: "desc" },
        take: params.take ?? 50,
        skip: params.skip ?? 0,
      }),
      prisma.booking.count({ where }),
    ]);
    return {
      data: rows.map((b) => ({
        id: b.id,
        bookingNo: b.bookingNo,
        customer: b.customer.name,
        phone: b.customer.phone,
        hall: b.hall.name,
        eventDate: b.eventDate,
        slot: b.slot,
        status: b.status,
        guests: b.guests,
        grandTotal: b.grandTotal.toFixed(2),
        advanceTotal: b.advanceTotal.toFixed(2),
        due: b.due.toFixed(2),
      })),
      total,
    };
  },

  async getById(id: number) {
    const b = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: true,
        hall: true,
        charges: { where: { deletedAt: null }, orderBy: { id: "asc" } },
        foods: { orderBy: { sort: "asc" } },
        paymentSlips: {
          where: { deletedAt: null },
          orderBy: { date: "asc" },
          select: { id: true, slipNo: true, amount: true, method: true, date: true },
        },
      },
    });
    if (!b) throw AppError.notFound("Booking not found");

    return {
      id: b.id,
      bookingNo: b.bookingNo,
      customer: { id: b.customer.id, code: b.customer.code, name: b.customer.name, phone: b.customer.phone },
      hall: { id: b.hall.id, name: b.hall.name },
      eventDate: b.eventDate,
      bookingDate: b.bookingDate,
      slot: b.slot,
      startTime: b.startTime,
      endTime: b.endTime,
      eventType: b.eventType,
      guests: b.guests,
      rackRate: b.rackRate.toFixed(2),
      discountedRate: b.discountedRate.toFixed(2),
      status: b.status,
      isLocked: b.isLocked,
      gstRate: b.gstRate.toFixed(2),
      remarks: b.remarks,
      arrangements: b.arrangements,
      bulletinBoard: b.bulletinBoard,
      confirmedAt: b.confirmedAt,
      eventClosedAt: b.eventClosedAt,
      charges: b.charges.map((c) => ({
        id: c.id,
        chargeType: c.chargeType,
        description: c.description,
        quantity: c.quantity.toFixed(2),
        unitPrice: c.unitPrice.toFixed(2),
        amount: c.amount.toFixed(2),
      })),
      foods: b.foods.map((f) => ({ id: f.id, name: f.name, urduName: f.urduName, sort: f.sort })),
      paymentSlips: b.paymentSlips.map((s) => ({
        id: s.id,
        slipNo: s.slipNo,
        amount: s.amount.toFixed(2),
        method: s.method,
        date: s.date,
      })),
      totals: {
        headchargeTotal: b.headchargeTotal.toFixed(2),
        chargesTotal: b.chargesTotal.toFixed(2),
        subtotal: b.subtotal.toFixed(2),
        gstAmount: b.gstAmount.toFixed(2),
        grandTotal: b.grandTotal.toFixed(2),
        advanceTotal: b.advanceTotal.toFixed(2),
        due: b.due.toFixed(2),
      },
    };
  },
};
