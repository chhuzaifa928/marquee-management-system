import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../lib/errors";

type Client = Prisma.TransactionClient | typeof prisma;

/** Well-known account codes from the seeded chart of accounts (§6.1). */
export const ACCOUNT_CODES = {
  cash: "1010",
  pettyCash: "1020",
  bank1: "1101",
  bank2: "1102",
  staffHolding: "1201",
  inventory: "1500",
  fixedAssets: "1600",
  customerAdvances: "2100",
  gstPayable: "2200",
  suppliersPayable: "2301",
  ownerCapital: "3000",
  foodSales: "4100",
  hallCharges: "4200",
  acHeating: "4300",
  dj: "4400",
  decorSale: "4500",
  coldDrinkWater: "4600",
  otherCharges: "4900",
  eventConsumables: "5600",
} as const;

/** Charge-type → income-head code map (§6.2). GST portion → 2200 (handled separately). */
export const CHARGE_INCOME_MAP: Record<string, string> = {
  menu: ACCOUNT_CODES.foodSales,
  hall_charges: ACCOUNT_CODES.hallCharges,
  ac_heating: ACCOUNT_CODES.acHeating,
  dj: ACCOUNT_CODES.dj,
  decor: ACCOUNT_CODES.decorSale,
  cold_drinks: ACCOUNT_CODES.coldDrinkWater,
  mineral_water: ACCOUNT_CODES.coldDrinkWater,
  other_charges: ACCOUNT_CODES.otherCharges,
};

export async function getAccountByCode(code: string, client: Client = prisma) {
  const account = await client.account.findFirst({
    where: { code, deletedAt: null },
  });
  if (!account) {
    throw AppError.badRequest(
      `Account ${code} is missing from the chart of accounts. Run the seeder.`,
    );
  }
  return account;
}

export async function getAccountById(id: number, client: Client = prisma) {
  const account = await client.account.findFirst({ where: { id, deletedAt: null } });
  if (!account) throw AppError.badRequest(`Account ${id} not found`);
  return account;
}
