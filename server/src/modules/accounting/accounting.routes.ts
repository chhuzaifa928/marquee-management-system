import { Router } from "express";
import { z } from "zod";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { AccountingService } from "./accounting.service";
import { closeEvent, reopenEvent } from "../../services/closeEvent";

const router = Router();
router.use(requireAuth, requireModule("accounting"));

// Post vouchers / close events: accounts (+ super). Admin may view only.
const postGuard = requireRole("accounts");
// Manage the chart of accounts: admin (+ super).
const chartGuard = requireRole("admin");

const accountTypeEnum = z.enum([
  "cash", "bank", "staff", "asset", "liability", "supplier", "income", "expense", "equity",
]);

function idParam(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw AppError.badRequest("Invalid id");
  return id;
}

// ── Chart of accounts ──────────────────────────────────────────────────────
router.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    const withBalances = req.query.balances === "1" || req.query.balances === "true";
    res.json(await AccountingService.listAccounts({ withBalances }));
  }),
);

router.post(
  "/accounts",
  chartGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ code: z.string().min(1).max(20), name: z.string().min(1).max(120), type: accountTypeEnum, openingBalance: z.coerce.number().optional() })
      .parse(req.body);
    res.status(201).json(await AccountingService.createAccount(body, req.user!.id));
  }),
);

router.put(
  "/accounts/:id",
  chartGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().min(1).max(120).optional(), type: accountTypeEnum.optional(), openingBalance: z.coerce.number().optional(), isActive: z.boolean().optional() })
      .parse(req.body);
    res.json(await AccountingService.updateAccount(idParam(req.params.id), body, req.user!.id));
  }),
);

router.delete(
  "/accounts/:id",
  chartGuard,
  asyncHandler(async (req, res) => {
    await AccountingService.deleteAccount(idParam(req.params.id), req.user!.id);
    res.json({ ok: true });
  }),
);

// ── General Ledger ─────────────────────────────────────────────────────────
router.get(
  "/accounts/:id/ledger",
  asyncHandler(async (req, res) => {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    if (!from || !to) throw AppError.badRequest("from and to are required");
    res.json(await AccountingService.generalLedger(idParam(req.params.id), from, to));
  }),
);

// ── Vouchers ─────────────────────────────────────────────────────────────
router.get(
  "/vouchers",
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json(
      await AccountingService.listVouchers({
        type: typeof q.type === "string" ? (q.type as "RV" | "EV" | "PV" | "JV") : undefined,
        accountId: q.accountId ? Number(q.accountId) : undefined,
        from: typeof q.from === "string" ? q.from : undefined,
        to: typeof q.to === "string" ? q.to : undefined,
        take: q.take ? Number(q.take) : undefined,
        skip: q.skip ? Number(q.skip) : undefined,
      }),
    );
  }),
);

router.get(
  "/vouchers/:id",
  asyncHandler(async (req, res) => {
    res.json(await AccountingService.getVoucher(idParam(req.params.id)));
  }),
);

router.post(
  "/vouchers",
  postGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        type: z.enum(["EV", "PV", "JV"]),
        debitAccountId: z.number().int().positive(),
        creditAccountId: z.number().int().positive(),
        amount: z.coerce.number().positive(),
        date: z.string().optional(),
        category: z.string().max(120).nullish(),
        remark: z.string().max(255).nullish(),
      })
      .parse(req.body);
    res.status(201).json(await AccountingService.postManualVoucher(body, req.user!.id));
  }),
);

// ── Close / reopen event (revenue recognition) ─────────────────────────────
router.post(
  "/bookings/:id/close",
  postGuard,
  asyncHandler(async (req, res) => {
    res.json(await closeEvent(idParam(req.params.id), req.user!.id));
  }),
);

router.post(
  "/bookings/:id/reopen",
  requireRole(), // super_admin only — reversing recognised revenue
  asyncHandler(async (req, res) => {
    res.json(await reopenEvent(idParam(req.params.id), req.user!.id));
  }),
);

export default router;
