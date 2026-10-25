import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { toPrisma } from "../../lib/money";

// Assets register — durable items used & returned (distinct from inventory).
// Managed by Admin/Super only (SRS matrix).
const router = Router();
router.use(requireAuth, requireModule("assets"));
const writeGuard = requireRole("admin");

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

const AssetSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  category: z.string().max(100).nullish(),
  quantity: z.coerce.number().int().min(0).optional(),
  purchaseDate: z.string().nullish(),
  purchaseCost: z.coerce.number().min(0).nullish(),
  condition: z.enum(["new", "good", "fair", "poor"]).optional(),
  status: z.enum(["available", "in_use", "retired"]).optional(),
  notes: z.string().max(1000).nullish(),
});

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await prisma.asset.findMany({ orderBy: { code: "asc" } });
  res.json(rows.map((a) => ({ ...a, purchaseCost: a.purchaseCost?.toFixed(2) ?? null })));
}));

router.post("/", writeGuard, asyncHandler(async (req, res) => {
  const b = AssetSchema.parse(req.body);
  const asset = await prisma.asset.create({
    data: {
      code: b.code.trim(), name: b.name.trim(), category: b.category ?? null,
      quantity: b.quantity ?? 0,
      purchaseDate: b.purchaseDate ? new Date(b.purchaseDate) : null,
      purchaseCost: b.purchaseCost != null ? toPrisma(b.purchaseCost) : null,
      condition: b.condition ?? "good", status: b.status ?? "available", notes: b.notes ?? null,
    },
  });
  res.status(201).json(asset);
}));

router.put("/:id", writeGuard, asyncHandler(async (req, res) => {
  const b = AssetSchema.partial().parse(req.body);
  const data: Record<string, unknown> = { ...b };
  if (b.purchaseDate !== undefined) data.purchaseDate = b.purchaseDate ? new Date(b.purchaseDate) : null;
  if (b.purchaseCost !== undefined) data.purchaseCost = b.purchaseCost != null ? toPrisma(b.purchaseCost) : null;
  delete (data as { code?: unknown }).code; // code is immutable
  res.json(await prisma.asset.update({ where: { id: idParam(req.params.id) }, data }));
}));

router.delete("/:id", writeGuard, asyncHandler(async (req, res) => {
  await prisma.asset.delete({ where: { id: idParam(req.params.id) } });
  res.json({ ok: true });
}));

export default router;
