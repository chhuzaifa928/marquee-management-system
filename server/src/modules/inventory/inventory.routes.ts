import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { InventoryService } from "./inventory.service";

const router = Router();
router.use(requireAuth, requireModule("inventory"));
const writeGuard = requireRole("inventory", "admin"); // + super

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

router.get(
  "/items",
  asyncHandler(async (req, res) => {
    res.json(await InventoryService.list({ q: typeof req.query.q === "string" ? req.query.q : undefined, lowStock: req.query.lowStock === "1" }));
  }),
);

router.get("/items/:id", asyncHandler(async (req, res) => res.json(await InventoryService.get(idParam(req.params.id)))));

router.post(
  "/items",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = z.object({
      code: z.string().min(1).max(40), name: z.string().min(1).max(200),
      category: z.string().max(100).nullish(), unit: z.string().max(40).nullish(),
      reorderLevel: z.coerce.number().min(0).optional(), unitCost: z.coerce.number().min(0).optional(),
    }).parse(req.body);
    res.status(201).json(await InventoryService.create(body));
  }),
);

router.put(
  "/items/:id",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = z.object({
      name: z.string().min(1).max(200).optional(), category: z.string().max(100).nullish(),
      unit: z.string().max(40).nullish(), reorderLevel: z.coerce.number().min(0).optional(),
      unitCost: z.coerce.number().min(0).optional(), isActive: z.boolean().optional(),
    }).parse(req.body);
    res.json(await InventoryService.update(idParam(req.params.id), body));
  }),
);

router.post(
  "/items/:id/movements",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = z.object({
      type: z.enum(["in", "out", "adjustment"]),
      quantity: z.coerce.number(),
      unitCost: z.coerce.number().min(0).nullish(),
      reference: z.string().max(120).nullish(),
      bookingId: z.number().int().positive().nullish(),
      date: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await InventoryService.addMovement({ itemId: idParam(req.params.id), ...body }, req.user!.id));
  }),
);

router.delete(
  "/movements/:id",
  writeGuard,
  asyncHandler(async (req, res) => {
    res.json(await InventoryService.deleteMovement(idParam(req.params.id)));
  }),
);

export default router;
