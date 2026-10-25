import { Router } from "express";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { getSettings } from "../settings/settings.service";

// Read-only reference data available to any authenticated user (hall picker,
// GST rate for live totals, company info). Admin editing lands in Module 8.
const router = Router();
router.use(requireAuth);

router.get(
  "/halls",
  asyncHandler(async (_req, res) => {
    const halls = await prisma.hall.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, capacity: true },
    });
    res.json(halls);
  }),
);

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({
      companyName: s.companyName,
      companyAddress: s.companyAddress,
      companyPhone: s.companyPhone,
      companyEmail: s.companyEmail,
      currency: s.currency,
      gstRate: s.gstRate.toFixed(2),
      systemLocked: s.systemLocked,
    });
  }),
);

export default router;
