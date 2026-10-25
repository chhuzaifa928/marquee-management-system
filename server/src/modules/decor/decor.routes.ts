import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../prisma";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { toPrisma } from "../../lib/money";

// Decor section — managed independently by the Decor team (and Admin/Super).
const router = Router();
router.use(requireAuth, requireModule("decor"));
const writeGuard = requireRole("decor", "admin");

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

const DecorSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullish(),
  quantity: z.coerce.number().int().min(0).optional(),
  rate: z.coerce.number().min(0).nullish(),
  status: z.enum(["available", "in_use", "retired"]).optional(),
});

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await prisma.decorItem.findMany({ orderBy: { code: "asc" } });
  res.json(rows.map((d) => ({ ...d, rate: d.rate?.toFixed(2) ?? null })));
}));

router.post("/", writeGuard, asyncHandler(async (req, res) => {
  const b = DecorSchema.parse(req.body);
  const item = await prisma.decorItem.create({
    data: {
      code: b.code.trim(), name: b.name.trim(), description: b.description ?? null,
      quantity: b.quantity ?? 0, rate: b.rate != null ? toPrisma(b.rate) : null, status: b.status ?? "available",
    },
  });
  res.status(201).json(item);
}));

router.put("/:id", writeGuard, asyncHandler(async (req, res) => {
  const b = DecorSchema.partial().parse(req.body);
  const data: Record<string, unknown> = { ...b };
  if (b.rate !== undefined) data.rate = b.rate != null ? toPrisma(b.rate) : null;
  delete (data as { code?: unknown }).code;
  res.json(await prisma.decorItem.update({ where: { id: idParam(req.params.id) }, data }));
}));

router.delete("/:id", writeGuard, asyncHandler(async (req, res) => {
  await prisma.decorItem.delete({ where: { id: idParam(req.params.id) } });
  res.json({ ok: true });
}));

export default router;
