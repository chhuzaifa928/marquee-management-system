import { Router } from "express";
import { prisma } from "../../prisma";
import { asyncHandler } from "../../lib/errors";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    res.status(db ? 200 : 503).json({
      status: db ? "ok" : "degraded",
      db,
      time: new Date().toISOString(),
    });
  }),
);

export default router;
