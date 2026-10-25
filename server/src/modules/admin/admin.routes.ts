import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { canEditGstRate, ROLES } from "../../auth/rbac";
import { AdminService } from "./admin.service";

const router = Router();
router.use(requireAuth, requireModule("admin")); // admin + super_admin

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

// ── Settings ─────────────────────────────────────────────────────────────
router.get("/settings", asyncHandler(async (_req, res) => res.json(await AdminService.getSettings())));

router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        companyName: z.string().max(200).optional(),
        companyAddress: z.string().max(500).nullish(),
        companyPhone: z.string().max(60).nullish(),
        companyEmail: z.string().max(120).nullish(),
        currency: z.string().max(10).optional(),
        gstRate: z.coerce.number().min(0).max(100).optional(),
      })
      .parse(req.body);
    res.json(
      await AdminService.updateSettings(body, {
        gstAllowed: canEditGstRate(req.user!.roles),
        userId: req.user!.id,
      }),
    );
  }),
);

// System lock — super_admin only.
router.post(
  "/system-lock",
  requireRole(),
  asyncHandler(async (req, res) => {
    const { locked } = z.object({ locked: z.boolean() }).parse(req.body);
    res.json(await AdminService.setSystemLock(locked, req.user!.id));
  }),
);

// ── Users & roles ──────────────────────────────────────────────────────────
router.get("/roles", asyncHandler(async (_req, res) => res.json(await AdminService.listRoles())));
router.get("/users", asyncHandler(async (_req, res) => res.json(await AdminService.listUsers())));

const roleEnum = z.enum(ROLES);

router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().min(1).max(120), email: z.string().email(), password: z.string().min(6), roles: z.array(roleEnum).min(1) })
      .parse(req.body);
    res.status(201).json(await AdminService.createUser(body, { requesterRoles: req.user!.roles, userId: req.user!.id }));
  }),
);

router.put(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().min(1).max(120).optional(), isActive: z.boolean().optional(), password: z.string().min(6).optional(), roles: z.array(roleEnum).min(1).optional() })
      .parse(req.body);
    res.json(await AdminService.updateUser(idParam(req.params.id), body, { requesterRoles: req.user!.roles, userId: req.user!.id }));
  }),
);

// ── Audit log ────────────────────────────────────────────────────────────
router.get(
  "/audits",
  asyncHandler(async (req, res) => {
    res.json(
      await AdminService.listAudits({
        model: typeof req.query.model === "string" ? req.query.model : undefined,
        modelId: req.query.modelId ? Number(req.query.modelId) : undefined,
        take: req.query.take ? Number(req.query.take) : undefined,
        skip: req.query.skip ? Number(req.query.skip) : undefined,
      }),
    );
  }),
);

export default router;
