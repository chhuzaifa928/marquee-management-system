import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

type Client = Prisma.TransactionClient | typeof prisma;

export type AuditAction = "create" | "update" | "delete";

/**
 * Write an entry to the generic audit trail. Called on create/update/delete of
 * the audited models (bookings, bookingCharges, paymentSlips, vouchers,
 * accounts, eventCosts). Never throws into the caller's happy path for logging
 * reasons — but we do await it inside the same transaction when given a tx.
 */
export async function writeAudit(
  client: Client,
  opts: {
    userId?: number | null;
    action: AuditAction;
    model: string;
    modelId?: number | null;
    oldData?: unknown;
    newData?: unknown;
  },
): Promise<void> {
  await client.audit.create({
    data: {
      userId: opts.userId ?? null,
      action: opts.action,
      model: opts.model,
      modelId: opts.modelId ?? null,
      oldData: toJson(opts.oldData),
      newData: toJson(opts.newData),
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  // Decimal/Date → JSON-safe via round-trip.
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ) as Prisma.InputJsonValue;
}
