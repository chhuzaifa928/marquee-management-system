import type { Settings } from "@prisma/client";
import { prisma } from "../../prisma";

export const SETTINGS_ID = 1;

/** Fetch the singleton settings row, creating it with defaults if missing. */
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.settings.create({ data: { id: SETTINGS_ID } });
}

export async function isSystemLocked(): Promise<boolean> {
  const s = await getSettings();
  return s.systemLocked;
}
