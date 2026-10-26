import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { intQuery } from "../../lib/http";
import { sendPdf } from "../../lib/pdf";
import { getSettings } from "../settings/settings.service";
import { BookingsService } from "./bookings.service";
import {
  advanceReceipt,
  eventBookingSheet,
  finalInvoice,
  kitchenVoucher,
} from "./bookings.pdf";

const router = Router();
router.use(requireAuth, requireModule("bookings"));

const writeGuard = requireRole("sales", "admin"); // + super_admin via bypass
const decorGuard = requireRole("decor", "sales", "admin"); // decor items on the bill

const slotEnum = z.enum(["lunch", "dinner"]);
const chargeTypeEnum = z.enum([
  "hall_charges",
  "ac_heating",
  "dj",
  "decor",
  "cold_drinks",
  "mineral_water",
  "other_charges",
]);

const ChargeSchema = z.object({
  chargeType: chargeTypeEnum,
  description: z.string().max(255).nullish(),
  quantity: z.coerce.number().nonnegative(),
  unitPrice: z.coerce.number().nonnegative(),
});

const FoodSchema = z.object({
  name: z.string().min(1).max(200),
  urduName: z.string().max(200).nullish(),
  sort: z.number().int().optional(),
});

const CreateSchema = z.object({
  customerId: z.number().int().positive(),
  hallId: z.number().int().positive(),
  eventDate: z.string().min(4),
  slot: slotEnum,
  startTime: z.string().max(20).nullish(),
  endTime: z.string().max(20).nullish(),
  eventType: z.string().max(100).nullish(),
  guests: z.coerce.number().int().nonnegative(),
  rackRate: z.coerce.number().nonnegative(),
  discountedRate: z.coerce.number().nonnegative(),
  remarks: z.string().max(2000).nullish(),
  arrangements: z.string().max(2000).nullish(),
  bulletinBoard: z.string().max(2000).nullish(),
  charges: z.array(ChargeSchema).optional(),
  foods: z.array(FoodSchema).optional(),
});

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

// ── Availability + calendar (read) ───────────────────────────────────────────
router.get(
  "/availability",
  asyncHandler(async (req, res) => {
    const hallId = Number(req.query.hallId);
    const date = String(req.query.date ?? "");
    const slot = slotEnum.parse(req.query.slot);
    const ignoreId = req.query.ignoreId ? Number(req.query.ignoreId) : undefined;
    if (!hallId || !date) throw AppError.badRequest("hallId and date are required");
    res.json(await BookingsService.availabilityInfo(hallId, date, slot, ignoreId));
  }),
);

router.get(
  "/calendar",
  asyncHandler(async (req, res) => {
    const hallId = Number(req.query.hallId);
    const month = String(req.query.month ?? new Date().toISOString());
    if (!hallId) throw AppError.badRequest("hallId is required");
    res.json(await BookingsService.calendar(hallId, month));
  }),
);

// ── List + read ──────────────────────────────────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      await BookingsService.list({
        hallId: intQuery(q.hallId),
        status: typeof q.status === "string" ? q.status : undefined,
        customerId: intQuery(q.customerId),
        from: typeof q.from === "string" ? q.from : undefined,
        to: typeof q.to === "string" ? q.to : undefined,
        take: intQuery(q.take),
        skip: intQuery(q.skip),
      }),
    );
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await BookingsService.getById(idParam(req.params.id)));
  }),
);

// ── PDFs ─────────────────────────────────────────────────────────────────────
const PDF_BUILDERS = {
  "booking-sheet": { fn: eventBookingSheet, name: "booking-sheet" },
  "kitchen-voucher": { fn: kitchenVoucher, name: "kitchen-voucher" },
  invoice: { fn: finalInvoice, name: "invoice" },
  "advance-receipt": { fn: advanceReceipt, name: "advance-receipt" },
} as const;

router.get(
  "/:id/pdf/:doc",
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const key = req.params.doc as keyof typeof PDF_BUILDERS;
    const builder = PDF_BUILDERS[key];
    if (!builder) throw AppError.badRequest("Unknown document type");
    const [booking, settings] = await Promise.all([
      BookingsService.getById(id),
      getSettings(),
    ]);
    const buffer = await builder.fn(booking, settings);
    sendPdf(res, buffer, `${booking.bookingNo}-${builder.name}.pdf`);
  }),
);

// ── Mutations ────────────────────────────────────────────────────────────────
router.post(
  "/",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = CreateSchema.parse(req.body);
    const result = await BookingsService.create(body, req.user!.id);
    res.status(201).json(result);
  }),
);

router.put(
  "/:id",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = CreateSchema.partial().parse(req.body);
    res.json(await BookingsService.update(idParam(req.params.id), body, req.user!.id));
  }),
);

router.post(
  "/:id/cancel",
  writeGuard,
  asyncHandler(async (req, res) => {
    res.json(await BookingsService.cancel(idParam(req.params.id), req.user!.id));
  }),
);

router.delete(
  "/:id",
  writeGuard,
  asyncHandler(async (req, res) => {
    await BookingsService.remove(idParam(req.params.id), req.user!.id);
    res.json({ ok: true });
  }),
);

router.post(
  "/:id/charges",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = ChargeSchema.parse(req.body);
    res.status(201).json(
      await BookingsService.addCharge(idParam(req.params.id), body, req.user!.id),
    );
  }),
);

router.delete(
  "/:id/charges/:chargeId",
  writeGuard,
  asyncHandler(async (req, res) => {
    res.json(
      await BookingsService.removeCharge(
        idParam(req.params.id),
        idParam(req.params.chargeId),
        req.user!.id,
      ),
    );
  }),
);

router.put(
  "/:id/foods",
  writeGuard,
  asyncHandler(async (req, res) => {
    const body = z.object({ foods: z.array(FoodSchema) }).parse(req.body);
    res.json(await BookingsService.setFoods(idParam(req.params.id), body.foods, req.user!.id));
  }),
);

// Decor items on the bill — addable by the decor team (and sales/admin/super).
const DecorItemSchema = z.object({
  item: z.string().min(1).max(200),
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().nonnegative(),
});

router.post(
  "/:id/decor-items",
  decorGuard,
  asyncHandler(async (req, res) => {
    const body = DecorItemSchema.parse(req.body);
    res.status(201).json(await BookingsService.addDecorItem(idParam(req.params.id), body, req.user!.id));
  }),
);

router.delete(
  "/:id/decor-items/:chargeId",
  decorGuard,
  asyncHandler(async (req, res) => {
    res.json(
      await BookingsService.removeDecorItem(idParam(req.params.id), idParam(req.params.chargeId), req.user!.id),
    );
  }),
);

export default router;
