import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { clientOrigins } from "./env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import authRoutes from "./modules/auth/auth.routes";
import healthRoutes from "./modules/health/health.routes";
import referenceRoutes from "./modules/reference/reference.routes";
import customersRoutes from "./modules/customers/customers.routes";
import bookingsRoutes from "./modules/bookings/bookings.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import accountingRoutes from "./modules/accounting/accounting.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import adminRoutes from "./modules/admin/admin.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import assetsRoutes from "./modules/assets/assets.routes";
import decorRoutes from "./modules/decor/decor.routes";
import vendorsRoutes from "./modules/vendors/vendors.routes";
import eventCostsRoutes from "./modules/eventCosts/eventCosts.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";

/**
 * Build the Express app. Exported as a factory so tests can mount it with
 * Supertest without binding a port.
 */
export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: clientOrigins,
      credentials: true, // allow auth cookies
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Routes
  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api", referenceRoutes);
  app.use("/api/customers", customersRoutes);
  app.use("/api/bookings", bookingsRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/accounting", accountingRoutes);
  app.use("/api/reports", reportsRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/assets", assetsRoutes);
  app.use("/api/decor", decorRoutes);
  app.use("/api/vendors", vendorsRoutes);
  app.use("/api/event-costs", eventCostsRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  // 404 + error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
