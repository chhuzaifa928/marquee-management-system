import { Prisma, type StockMovementType } from "@prisma/client";
import { prisma } from "../../prisma";
import { AppError } from "../../lib/errors";
import { d, gt, toPrisma } from "../../lib/money";
import { StockMovementService } from "../../services/stockMovement";

export const InventoryService = {
  async list(params: { q?: string; lowStock?: boolean }) {
    const where: Prisma.InventoryItemWhereInput = {};
    if (params.q) where.OR = [{ name: { contains: params.q } }, { code: { contains: params.q } }, { category: { contains: params.q } }];
    const items = await prisma.inventoryItem.findMany({ where, orderBy: { code: "asc" } });
    const mapped = items.map((i) => ({
      id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit,
      qtyOnHand: i.qtyOnHand.toFixed(2), reorderLevel: i.reorderLevel.toFixed(2),
      unitCost: i.unitCost.toFixed(2),
      stockValue: d(i.qtyOnHand).times(i.unitCost).toFixed(2),
      isActive: i.isActive,
      lowStock: d(i.qtyOnHand).lessThanOrEqualTo(i.reorderLevel),
    }));
    return params.lowStock ? mapped.filter((m) => m.lowStock) : mapped;
  },

  async get(id: number) {
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
    const movements = await prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      orderBy: { date: "desc" },
      include: { booking: { select: { bookingNo: true } }, createdBy: { select: { name: true } } },
    });
    return {
      item: {
        id: item.id, code: item.code, name: item.name, category: item.category, unit: item.unit,
        qtyOnHand: item.qtyOnHand.toFixed(2), reorderLevel: item.reorderLevel.toFixed(2),
        unitCost: item.unitCost.toFixed(2), isActive: item.isActive,
      },
      movements: movements.map((m) => ({
        id: m.id, type: m.type, quantity: m.quantity.toFixed(2),
        unitCost: m.unitCost?.toFixed(2) ?? null, reference: m.reference,
        booking: m.booking?.bookingNo ?? null, date: m.date, createdBy: m.createdBy?.name ?? null,
      })),
    };
  },

  async create(input: { code: string; name: string; category?: string | null; unit?: string | null; reorderLevel?: number | string; unitCost?: number | string }) {
    return prisma.inventoryItem.create({
      data: {
        code: input.code.trim(), name: input.name.trim(),
        category: input.category ?? null, unit: input.unit ?? null,
        reorderLevel: toPrisma(input.reorderLevel ?? 0), unitCost: toPrisma(input.unitCost ?? 0),
      },
    });
  },

  async update(id: number, input: { name?: string; category?: string | null; unit?: string | null; reorderLevel?: number | string; unitCost?: number | string; isActive?: boolean }) {
    const data: Prisma.InventoryItemUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.category !== undefined) data.category = input.category;
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.reorderLevel !== undefined) data.reorderLevel = toPrisma(input.reorderLevel);
    if (input.unitCost !== undefined) data.unitCost = toPrisma(input.unitCost);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return prisma.inventoryItem.update({ where: { id }, data });
  },

  async addMovement(
    input: { itemId: number; type: StockMovementType; quantity: number | string; unitCost?: number | string | null; reference?: string | null; bookingId?: number | null; date?: string },
    userId?: number,
  ) {
    if (input.type !== "adjustment" && !gt(input.quantity, 0)) {
      throw AppError.badRequest("Quantity must be greater than zero for in/out movements");
    }
    await prisma.inventoryItem.findUniqueOrThrow({ where: { id: input.itemId } });
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          inventoryItemId: input.itemId, type: input.type,
          quantity: toPrisma(input.quantity),
          unitCost: input.unitCost != null ? toPrisma(input.unitCost) : null,
          reference: input.reference ?? null,
          bookingId: input.bookingId ?? null,
          date: input.date ? new Date(input.date) : new Date(),
          createdById: userId ?? null,
        },
      });
      await StockMovementService.recalculate(input.itemId, tx);
    });
    return this.get(input.itemId);
  },

  async deleteMovement(movementId: number) {
    const m = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movementId } });
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.delete({ where: { id: movementId } });
      await StockMovementService.recalculate(m.inventoryItemId, tx); // restores stock
    });
    return this.get(m.inventoryItemId);
  },
};
