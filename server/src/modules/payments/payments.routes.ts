import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { PaymentsService } from "./payments.service";

const router = Router();
router.use(requireAuth, requireModule("payments"));

const SlipSchema = z.object({
  bookingId: z.number().int().positive(),
  accountId: z.number().int().positive(),
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "bank_transfer", "cheque", "card"]).optional(),
  reference: z.string().max(120).nullish(),
  remark: z.string().max(255).nullish(),
  date: z.string().optional(),
});

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

/** Cash/bank accounts money can be received into (for the slip form). */
router.get(
  "/accounts",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null, isActive: true, type: { in: ["cash", "bank"] } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    });
    res.json(accounts);
  }),
);

router.get(
  "/slips",
  asyncHandler(async (req, res) => {
    const bookingId = req.query.bookingId ? Number(req.query.bookingId) : undefined;
    res.json(await PaymentsService.listSlips({ bookingId }));
  }),
);

router.post(
  "/slips",
  asyncHandler(async (req, res) => {
    const body = SlipSchema.parse(req.body);
    res.status(201).json(await PaymentsService.createSlip(body, req.user!.id));
  }),
);

// Only super_admin may delete a posted payment slip (accounts entries are
// immutable to their creators; see §2).
router.delete(
  "/slips/:id",
  requireRole(), // no roles listed → only super_admin passes (bypass)
  asyncHandler(async (req, res) => {
    res.json(await PaymentsService.deleteSlip(idParam(req.params.id), req.user!.id));
  }),
);

export default router;
