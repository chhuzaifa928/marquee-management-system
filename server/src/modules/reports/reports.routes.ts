import { Router, type Request } from "express";
import { asyncHandler, AppError } from "../../lib/errors";
import { requireAuth, requireModule, requireRole } from "../../middleware/auth";
import { sendPdf } from "../../lib/pdf";
import { getSettings } from "../settings/settings.service";
import { hasAnyRole } from "../../auth/rbac";
import { ReportsService } from "./reports.service";
import { AccountingService } from "../accounting/accounting.service";
import {
  bookingsMasterPdf,
  cashClosingPdf,
  generalLedgerPdf,
  profitLossPdf,
  supplierSummaryPdf,
} from "./reports.pdf";

const router = Router();
router.use(requireAuth, requireModule("reports"));

// Financial reports are for accounts/admin/super only; sales see bookings only.
const financialGuard = requireRole("accounts", "admin");

function range(req: Request): { from: string; to: string } {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!from || !to) throw AppError.badRequest("from and to are required");
  return { from, to };
}
const wantsPdf = (req: Request) => req.query.format === "pdf";

router.get(
  "/cash-closing",
  financialGuard,
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const data = await ReportsService.cashClosing(from, to);
    if (wantsPdf(req)) return sendPdf(res, await cashClosingPdf(data, await getSettings()), `cash-closing_${from}_${to}.pdf`);
    res.json(data);
  }),
);

router.get(
  "/supplier-summary",
  financialGuard,
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const data = await ReportsService.supplierSummary(from, to);
    if (wantsPdf(req)) return sendPdf(res, await supplierSummaryPdf(data, await getSettings()), `supplier-summary_${from}_${to}.pdf`);
    res.json(data);
  }),
);

router.get(
  "/profit-loss",
  financialGuard,
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const data = await ReportsService.profitAndLoss(from, to);
    if (wantsPdf(req)) return sendPdf(res, await profitLossPdf(data, await getSettings()), `profit-loss_${from}_${to}.pdf`);
    res.json(data);
  }),
);

router.get(
  "/general-ledger",
  financialGuard,
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const accountId = Number(req.query.accountId);
    if (!accountId) throw AppError.badRequest("accountId is required");
    const data = await AccountingService.generalLedger(accountId, from, to);
    if (wantsPdf(req)) return sendPdf(res, await generalLedgerPdf(data, await getSettings()), `general-ledger_${accountId}_${from}_${to}.pdf`);
    res.json(data);
  }),
);

router.get(
  "/bookings-master",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    // Sales (without admin/accounts/super) see only their own bookings.
    const privileged = hasAnyRole(req.user!.roles, ["admin", "accounts"]);
    const scopeUserId = privileged ? undefined : req.user!.id;
    const data = await ReportsService.bookingsMaster(from, to, scopeUserId);
    if (wantsPdf(req)) return sendPdf(res, await bookingsMasterPdf(data, await getSettings()), `bookings-master_${from}_${to}.pdf`);
    res.json(data);
  }),
);

export default router;
