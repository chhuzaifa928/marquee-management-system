import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { d, toPrisma } from "../lib/money";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Inventory stock is NEVER an incremented counter — it is recomputed
 * authoritatively from movement history, so it cannot drift:
 *   qtyOnHand = Σ(in) − Σ(out) + Σ(adjustment, signed)
 * Deleting a movement therefore restores stock automatically on recompute.
 */
export const StockMovementService = {
  async recalculate(itemId: number, client: Tx = prisma): Promise<Prisma.Decimal> {
    const movements = await client.stockMovement.findMany({
      where: { inventoryItemId: itemId },
      select: { type: true, quantity: true },
    });
    let qty = d(0);
    for (const m of movements) {
      if (m.type === "in") qty = qty.plus(m.quantity);
      else if (m.type === "out") qty = qty.minus(m.quantity);
      else qty = qty.plus(m.quantity); // adjustment is signed
    }
    await client.inventoryItem.update({
      where: { id: itemId },
      data: { qtyOnHand: toPrisma(qty) },
    });
    return toPrisma(qty);
  },
};
