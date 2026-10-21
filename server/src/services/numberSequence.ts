import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";

type TxClient = Prisma.TransactionClient | PrismaClient;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * Gapless sequence allocator.
 *
 * `next(key, prefix, pad)` allocates the next integer for `key` inside a DB
 * transaction holding a `SELECT … FOR UPDATE` row lock on `number_sequences`,
 * so concurrent requests serialize: they never collide and never skip a number.
 *
 * Pass an existing transaction client (`tx`) to allocate WITHIN the caller's
 * transaction — then if that transaction rolls back, the allocation rolls back
 * too, leaving no gap. With no `tx`, the allocation runs in its own committed
 * transaction.
 *
 * Never use MAX(id)+1.
 */
export const NumberSequenceService = {
  async next(
    key: string,
    prefix = "",
    width = 4,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const run = async (client: Prisma.TransactionClient): Promise<string> => {
      // Ensure the row exists (no-op if already there) so the lock has a target.
      await client.$executeRaw`
        INSERT INTO number_sequences (\`key\`, next, createdAt, updatedAt)
        VALUES (${key}, 1, NOW(3), NOW(3))
        ON DUPLICATE KEY UPDATE \`key\` = \`key\``;

      // Lock the row for the remainder of the transaction.
      const rows = await client.$queryRaw<{ next: number }[]>`
        SELECT next FROM number_sequences WHERE \`key\` = ${key} FOR UPDATE`;

      const current = rows[0]?.next ?? 1;

      await client.$executeRaw`
        UPDATE number_sequences SET next = ${current + 1}, updatedAt = NOW(3)
        WHERE \`key\` = ${key}`;

      return `${prefix}${pad(current, width)}`;
    };

    if (tx) return run(tx);
    // Generous bounds so many concurrent allocations can queue on the row lock
    // without tripping Prisma's default 2s acquire / 5s run limits.
    return prisma.$transaction((client) => run(client), {
      timeout: 20_000,
      maxWait: 20_000,
    });
  },

  /** Peek the next value without consuming it (diagnostics / tests). */
  async peek(key: string, client: TxClient = prisma): Promise<number> {
    const row = await client.numberSequence.findUnique({ where: { key } });
    return row?.next ?? 1;
  },
};

/** Standard sequence keys + prefixes used across the system. */
export const SEQ = {
  booking: { key: "booking_no", prefix: "BKG-" },
  slip: { key: "slip_no", prefix: "SLIP-" },
  customer: { key: "customer_code", prefix: "CUST-" },
  voucher: (type: "RV" | "EV" | "PV" | "JV") => ({
    key: `voucher_no:${type}`,
    prefix: `${type}-`,
  }),
} as const;
