import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { intQuery } from "../../lib/http";
import { CustomersService } from "./customers.service";

const router = Router();

router.use(requireAuth, requireModule("customers"));

const CustomerSchema = z.object({
  name: z.string().min(1).max(200),
  careOf: z.string().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  cnic: z.string().max(20).nullish(),
  email: z.string().email().max(200).nullish().or(z.literal("")),
  address: z.string().max(1000).nullish(),
});

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const cnic = typeof req.query.cnic === "string" ? req.query.cnic : undefined;
    const take = intQuery(req.query.take);
    const skip = intQuery(req.query.skip);
    res.json(await CustomersService.list({ q, cnic, take, skip }));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await CustomersService.getById(idParam(req.params.id)));
  }),
);

router.get(
  "/:id/summary",
  asyncHandler(async (req, res) => {
    res.json(await CustomersService.summary(idParam(req.params.id)));
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = CustomerSchema.parse(req.body);
    const created = await CustomersService.create({
      ...body,
      email: body.email === "" ? null : body.email,
    });
    res.status(201).json(created);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = CustomerSchema.partial().parse(req.body);
    const updated = await CustomersService.update(idParam(req.params.id), {
      ...body,
      email: body.email === "" ? null : body.email,
    });
    res.json(updated);
  }),
);

router.delete(
  "/:id",
  requireRole("admin"), // + super_admin via bypass
  asyncHandler(async (req, res) => {
    await CustomersService.remove(idParam(req.params.id));
    res.json({ ok: true });
  }),
);

export default router;
