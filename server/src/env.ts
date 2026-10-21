import dotenv from "dotenv";
import { z } from "zod";

// Load .env (no-op in production where env is injected by the platform).
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET too short"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET too short"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // 64 hex chars = 32 bytes for AES-256.
  CNIC_ENC_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "CNIC_ENC_KEY must be 64 hex chars"),
  CNIC_INDEX_KEY: z.string().min(16, "CNIC_INDEX_KEY too short"),

  SEED_ADMIN_EMAIL: z.string().email().default("superadmin@grandpearl.local"),
  SEED_ADMIN_PASSWORD: z.string().min(6).default("ChangeMe!123"),
  SEED_DEMO_DATA: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Fail fast and loud — a misconfigured server must not boot.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/**
 * Allowed CORS origins (comma-separated CLIENT_ORIGIN supported).
 */
export const clientOrigins = env.CLIENT_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
