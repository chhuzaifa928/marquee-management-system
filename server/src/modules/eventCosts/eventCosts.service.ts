import { Prisma, type CostType } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { d, gt, toPrisma } from "../../lib/money";
import { writeAudit } from "../../lib/audit";
import { createVoucher, reverseVoucher } from "../../services/vouchers";
import { ACCOUNT_CODES, getAccountByCode, getAccountById } from "../../services/accounts";
import { StockMovementService } from "../../services/stockMovement";

export interface EventCostInput {
  costType: CostType;
  amount?: number | string; // required for vendor/misc; derived for inventory if omitted
  description?: string | null;
  date?: string;
  vendorId?: number | null; // vendor
  paidFromAccountId?: number | null; // misc (cash/bank)
  expenseAccountId?: number | null; // debit head (defaults to Event Consumables 5600)
  inventoryItemId?: number | null; // inventory
  quantity?: number | string | null; // inventory qty consumed
}

async function assertPaid(bookingId: number) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, deletedAt: null } });
  if (!booking) throw AppError.notFound("Booking not found");
  if (booking.status !== "paid") {
    throw AppError.badRequest("Event costing can be entered only after the booking is fully paid");
  }
  return booking;
}

export const EventCostsService = {
  async create(bookingId: number, input: EventCostInput, userId?: number) {
    await assertPaid(bookingId);

    return prisma.$transaction(async (tx) => {
      const expenseHead = input.expenseAccountId
        ? await getAccountById(input.expenseAccountId, tx)
        : await getAccountByCode(ACCOUNT_CODES.eventConsumables, tx);

      let amount = d(input.amount ?? 0);
      let voucherId: number | null = null;
      let stockMovementId: number | null = null;
      let vendorId = input.vendorId ?? null;
      let inventoryItemId = input.inventoryItemId ?? null;

      if (input.costType === "vendor") {
        if (!vendorId) throw AppError.badRequest("vendorId is required for a vendor cost");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
        if (!vendor.accountId) throw AppError.badRequest("Vendor has no linked supplier account");
        if (!gt(amount, 0)) throw AppError.badRequest("amount must be greater than zero");
        const v = await createVoucher(tx, {
          type: "EV", date: input.date ? new Date(input.date) : new Date(),
          category: "Event cost — vendor", remark: input.description ?? `Vendor cost for booking ${bookingId}`,
          debitAccountId: expenseHead.id, creditAccountId: vendor.accountId, amount: toPrisma(amount),
          sourceType: "eventCost", sourceId: bookingId, createdById: userId,
        });
        voucherId = v.id;
      } else if (input.costType === "misc") {
        if (!input.paidFromAccountId) throw AppError.badRequest("paidFromAccountId is required for a misc cost");
        const paidFrom = await getAccountById(input.paidFromAccountId, tx);
        if (paidFrom.type !== "cash" && paidFrom.type !== "bank") throw AppError.badRequest("Misc costs must be paid from a cash/bank account");
        if (!gt(amount, 0)) throw AppError.badRequest("amount must be greater than zero");
        const v = await createVoucher(tx, {
          type: "EV", date: input.date ? new Date(input.date) : new Date(),
          category: "Event cost — misc", remark: input.description ?? `Misc cost for booking ${bookingId}`,
          debitAccountId: expenseHead.id, creditAccountId: paidFrom.id, amount: toPrisma(amount),
          sourceType: "eventCost", sourceId: bookingId, createdById: userId,
        });
        voucherId = v.id;
      } else {
        // inventory consumed → stock-out + JV Dr expense / Cr Inventory
        if (!inventoryItemId) throw AppError.badRequest("inventoryItemId is required for an inventory cost");
        const qty = d(input.quantity ?? 0);
        if (!gt(qty, 0)) throw AppError.badRequest("quantity must be greater than zero");
        const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
        if (!gt(amount, 0)) amount = qty.times(item.unitCost); // default to qty × unit cost
        const inventoryAcct = await getAccountByCode(ACCOUNT_CODES.inventory, tx);

        const movement = await tx.stockMovement.create({
          data: {
            inventoryItemId, type: "out", quantity: toPrisma(qty), unitCost: item.unitCost,
            reference: `Event cost booking ${bookingId}`, bookingId, createdById: userId ?? null,
          },
        });
        await StockMovementService.recalculate(inventoryItemId, tx);
        stockMovementId = movement.id;

        const v = await createVoucher(tx, {
          type: "JV", date: input.date ? new Date(input.date) : new Date(),
          category: "Event cost — inventory", remark: input.description ?? `Inventory consumed for booking ${bookingId}`,
          debitAccountId: expenseHead.id, creditAccountId: inventoryAcct.id, amount: toPrisma(amount),
          sourceType: "eventCost", sourceId: bookingId, createdById: userId,
        });
        voucherId = v.id;
      }

      const cost = await tx.eventCost.create({
        data: {
          bookingId, costType: input.costType, amount: toPrisma(amount),
          description: input.description ?? null, date: input.date ? new Date(input.date) : new Date(),
          vendorId, inventoryItemId, quantity: input.quantity != null ? toPrisma(input.quantity) : null,
          expenseAccountId: expenseHead.id,
          paidFromAccountId: input.costType === "misc" ? input.paidFromAccountId ?? null : null,
          voucherId, stockMovementId, createdById: userId ?? null,
        },
      });
      await writeAudit(tx, { userId, action: "create", model: "EventCost", modelId: cost.id, newData: { costType: input.costType, amount: cost.amount } });

      return cost;
    }).then(() => this.summary(bookingId));
  },

  async remove(costId: number, userId?: number) {
    const cost = await prisma.eventCost.findFirst({ where: { id: costId, deletedAt: null } });
    if (!cost) throw AppError.notFound("Event cost not found");
    await prisma.$transaction(async (tx) => {
      if (cost.voucherId) await reverseVoucher(tx, cost.voucherId, userId);
      if (cost.stockMovementId) {
        await tx.stockMovement.delete({ where: { id: cost.stockMovementId } }).catch(() => undefined);
        if (cost.inventoryItemId) await StockMovementService.recalculate(cost.inventoryItemId, tx);
      }
      await tx.eventCost.update({ where: { id: costId }, data: { deletedAt: new Date() } });
      await writeAudit(tx, { userId, action: "delete", model: "EventCost", modelId: costId, oldData: { amount: cost.amount } });
    });
    return this.summary(cost.bookingId);
  },

  async summary(bookingId: number) {
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        customer: { select: { name: true } },
        eventCosts: {
          where: { deletedAt: null },
          orderBy: { id: "asc" },
          include: { vendor: { select: { name: true } }, inventoryItem: { select: { name: true } }, voucher: { select: { voucherNo: true } } },
        },
      },
    });
    const totalCost = booking.eventCosts.reduce((a, c) => a.plus(c.amount), new Prisma.Decimal(0));
    const netProfit = d(booking.grandTotal).minus(totalCost);
    return {
      bookingId, bookingNo: booking.bookingNo, host: booking.customer.name, status: booking.status,
      grandTotal: d(booking.grandTotal).toFixed(2),
      totalCost: totalCost.toFixed(2),
      netProfit: netProfit.toFixed(2),
      costs: booking.eventCosts.map((c) => ({
        id: c.id, costType: c.costType, amount: c.amount.toFixed(2), description: c.description,
        vendor: c.vendor?.name ?? null, inventoryItem: c.inventoryItem?.name ?? null,
        quantity: c.quantity?.toFixed(2) ?? null, voucherNo: c.voucher?.voucherNo ?? null, date: c.date,
      })),
    };
  },
};
