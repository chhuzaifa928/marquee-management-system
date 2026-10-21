import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { clientOrigins } from "./env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import authRoutes from "./modules/auth/auth.routes";
import healthRoutes from "./modules/health/health.routes";

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

  // 404 + error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
