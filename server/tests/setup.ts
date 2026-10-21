import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/prisma";
import { resetDb } from "./helpers";

// Clean slate before every test.
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
