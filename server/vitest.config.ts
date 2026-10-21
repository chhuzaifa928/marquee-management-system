import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load server/.env, then force the suite onto the dedicated TEST database so a
// test run can never touch development/production data.
dotenv.config();
const testUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = "test";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testUrl,
    },
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // One shared test DB → run serially to avoid cross-file interference.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
