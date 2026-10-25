import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { VendorsService } from "./vendors.service";

const router = Router();
router.use(requireAuth, requireModule("vendors"));
const writeGuard = requireRole("admin"); // assets/vendors = Admin/Super

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

const VendorSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).nullish(),
  phone: z.string().max(60).nullish(),
  email: z.string().max(120).nullish(),
  address: z.string().max(500).nullish(),
  notes: z.string().max(1000).nullish(),
  openingBalance: z.coerce.number().optional(),
});

router.get("/", asyncHandler(async (_req, res) => res.json(await VendorsService.list())));

router.post("/", writeGuard, asyncHandler(async (req, res) => {
  res.status(201).json(await VendorsService.create(VendorSchema.parse(req.body)));
}));

router.put("/:id", writeGuard, asyncHandler(async (req, res) => {
  res.json(await VendorsService.update(idParam(req.params.id), VendorSchema.partial().parse(req.body)));
}));

router.delete("/:id", writeGuard, asyncHandler(async (req, res) => {
  await VendorsService.remove(idParam(req.params.id));
  res.json({ ok: true });
}));

export default router;
