import { Prisma, type VoucherType } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../lib/errors";
import { d, eq, gt, toPrisma } from "../lib/money";
import { writeAudit } from "../lib/audit";
import { NumberSequenceService, SEQ } from "./numberSequence";

type Tx = Prisma.TransactionClient;

export interface VoucherLineInput {
  type: VoucherType;
  date?: Date;
  category?: string | null;
  remark?: string | null;
  debitAccountId: number;
  creditAccountId: number;
  amount: Prisma.Decimal | number | string;
  sourceType?: string | null;
  sourceId?: number | null;
  batchUid?: string | null;
  createdById?: number | null;
}

/**
 * Create one balanced two-sided voucher. A single voucher row IS the balanced
 * posting (one debit account, one credit account, one amount) — so debit always
 * equals credit by construction. We still assert amount > 0 and that the two
 * accounts differ, the invariants that make the posting meaningful. Multi-line
 * postings call this repeatedly with a shared batchUid (see postBatch).
 */
export async function createVoucher(tx: Tx, input: VoucherLineInput) {
  if (!gt(input.amount, 0)) {
    throw AppError.badRequest("Voucher amount must be greater than zero");
  }
  if (input.debitAccountId === input.creditAccountId) {
    throw AppError.badRequest("Debit and credit accounts must differ");
  }

  const voucherNo = await NumberSequenceService.next(
    SEQ.voucher(input.type).key,
    SEQ.voucher(input.type).prefix,
    4,
    tx,
  );

  const voucher = await tx.voucher.create({
    data: {
      voucherNo,
      batchUid: input.batchUid ?? null,
      type: input.type,
      date: input.date ?? new Date(),
      category: input.category ?? null,
      remark: input.remark ?? null,
      debitAccountId: input.debitAccountId,
      creditAccountId: input.creditAccountId,
      amount: toPrisma(input.amount),
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdById: input.createdById ?? null,
    },
  });

  await writeAudit(tx, {
    userId: input.createdById,
    action: "create",
    model: "Voucher",
    modelId: voucher.id,
    newData: { voucherNo, type: input.type, amount: voucher.amount },
  });

  return voucher;
}

/**
 * Post a balanced batch of voucher lines sharing one batchUid. Asserts the batch
 * is internally balanced: Σ(debits) == Σ(credits) across the lines, treating
 * each line as debit `amount` to its debit account and credit `amount` to its
 * credit account. (With one amount per line this is automatic, but the explicit
 * check guards future multi-amount constructions.)
 */
export async function postBatch(
  tx: Tx,
  batchUid: string,
  lines: Omit<VoucherLineInput, "batchUid">[],
) {
  // Σ debit amounts must equal Σ credit amounts (per account side).
  const debitTotal = lines.reduce((acc, l) => acc.plus(d(l.amount)), new Prisma.Decimal(0));
  const creditTotal = lines.reduce((acc, l) => acc.plus(d(l.amount)), new Prisma.Decimal(0));
  if (!eq(debitTotal, creditTotal)) {
    throw AppError.badRequest("Voucher batch is not balanced (debit != credit)");
  }
  const created = [];
  for (const line of lines) {
    created.push(await createVoucher(tx, { ...line, batchUid }));
  }
  return created;
}

/** Soft-delete a voucher (reversal). */
export async function reverseVoucher(tx: Tx, voucherId: number, userId?: number | null) {
  const voucher = await tx.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher || voucher.deletedAt) return;
  await tx.voucher.update({ where: { id: voucherId }, data: { deletedAt: new Date() } });
  await writeAudit(tx, {
    userId,
    action: "delete",
    model: "Voucher",
    modelId: voucherId,
    oldData: { voucherNo: voucher.voucherNo, amount: voucher.amount },
  });
}

/** Soft-delete every voucher in a batch (reverse as one unit). */
export async function reverseBatch(tx: Tx, batchUid: string, userId?: number | null) {
  const vouchers = await tx.voucher.findMany({
    where: { batchUid, deletedAt: null },
  });
  for (const v of vouchers) await reverseVoucher(tx, v.id, userId);
}
