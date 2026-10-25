import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { EventCostsService } from "./eventCosts.service";

const router = Router();
router.use(requireAuth, requireModule("event_costs"));
// Enter costs: accounts (+ super). Delete: super only (accounts entry).
const createGuard = requireRole("accounts");

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

router.get(
  "/bookings/:id",
  asyncHandler(async (req, res) => {
    res.json(await EventCostsService.summary(idParam(req.params.id)));
  }),
);

router.post(
  "/bookings/:id",
  createGuard,
  asyncHandler(async (req, res) => {
    const body = z.object({
      costType: z.enum(["vendor", "inventory", "misc"]),
      amount: z.coerce.number().min(0).optional(),
      description: z.string().max(255).nullish(),
      date: z.string().optional(),
      vendorId: z.number().int().positive().nullish(),
      paidFromAccountId: z.number().int().positive().nullish(),
      expenseAccountId: z.number().int().positive().nullish(),
      inventoryItemId: z.number().int().positive().nullish(),
      quantity: z.coerce.number().min(0).nullish(),
    }).parse(req.body);
    res.status(201).json(await EventCostsService.create(idParam(req.params.id), body, req.user!.id));
  }),
);

router.delete(
  "/:costId",
  requireRole(), // super_admin only
  asyncHandler(async (req, res) => {
    res.json(await EventCostsService.remove(idParam(req.params.costId), req.user!.id));
  }),
);

export default router;
