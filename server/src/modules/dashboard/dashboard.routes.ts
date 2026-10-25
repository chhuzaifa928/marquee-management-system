import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { hasAnyRole } from "../../auth/rbac";
import { d } from "../../lib/money";
import { startOfDay, nextDay, startOfMonth } from "../../lib/dates";
import { AccountBalance } from "../../services/accountBalance";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const roles = req.user!.roles;
    const financial = hasAnyRole(roles, ["accounts", "admin"]);
    const canInventory = hasAnyRole(roles, ["inventory", "admin"]);
    const today = startOfDay(new Date());

    // Upcoming events (any role that can see bookings).
    const upcoming = await prisma.booking.findMany({
      where: { deletedAt: null, status: { not: "cancelled" }, eventDate: { gte: today } },
      include: { customer: { select: { name: true } }, hall: { select: { name: true } } },
      orderBy: { eventDate: "asc" },
      take: 8,
    });
    const todayCount = await prisma.booking.count({
      where: { deletedAt: null, status: { not: "cancelled" }, eventDate: { gte: today, lt: nextDay(today) } },
    });

    const result: Record<string, unknown> = {
      todayCount,
      upcoming: upcoming.map((b) => ({
        id: b.id, bookingNo: b.bookingNo, customer: b.customer.name, hall: b.hall.name,
        eventDate: b.eventDate, slot: b.slot, status: b.status,
        due: b.due.toFixed(2), grandTotal: b.grandTotal.toFixed(2),
      })),
    };

    if (financial) {
      // Cash position across cash + bank accounts.
      const cashAccts = await prisma.account.findMany({ where: { deletedAt: null, type: { in: ["cash", "bank"] } } });
      let cash = d(0);
      for (const a of cashAccts) cash = cash.plus(await AccountBalance.balanceAsOf(a.id));

      const receivablesAgg = await prisma.booking.aggregate({
        _sum: { due: true },
        where: { deletedAt: null, status: { in: ["tentative", "booked"] } },
      });

      // Monthly recognised revenue (credits to income accounts) — last 6 months.
      const incomeAccts = await prisma.account.findMany({ where: { deletedAt: null, type: "income" }, select: { id: true } });
      const incomeIds = incomeAccts.map((a) => a.id);
      const months: { month: string; revenue: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const now = new Date();
        const from = startOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
        const to = startOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1)));
        const agg = incomeIds.length
          ? await prisma.voucher.aggregate({ _sum: { amount: true }, where: { deletedAt: null, creditAccountId: { in: incomeIds }, date: { gte: from, lt: to } } })
          : { _sum: { amount: null as Prisma.Decimal | null } };
        months.push({
          month: from.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
          revenue: d(agg._sum.amount ?? 0).toFixed(2),
        });
      }

      result.cashPosition = cash.toFixed(2);
      result.receivables = d(receivablesAgg._sum.due ?? 0).toFixed(2);
      result.monthlyRevenue = months;
    }

    if (canInventory) {
      const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, select: { qtyOnHand: true, reorderLevel: true } });
      result.lowStockCount = items.filter((i) => d(i.qtyOnHand).lessThanOrEqualTo(i.reorderLevel)).length;
    }

    res.json(result);
  }),
);

export default router;
