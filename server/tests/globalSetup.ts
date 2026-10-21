import { execSync } from "node:child_process";

/**
 * Runs once before the whole suite: pushes the Prisma schema into the dedicated
 * TEST database (creating it if absent, resetting it for a clean slate).
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL / DATABASE_URL not set for tests");

  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
