import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";

/**
 * Money math. All amounts flow through Decimal (decimal.js) — NEVER JS floats.
 * Prisma returns Decimal columns as Prisma.Decimal (a decimal.js instance),
 * so these helpers interoperate directly with query results.
 *
 * Convention: 2 decimal places, round-half-up (ROUND_HALF_UP), matching how
 * invoices and vouchers round in practice.
 */

export type Money = Decimal.Value | Prisma.Decimal;

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export function d(value: Money = 0): Decimal {
  // Prisma.Decimal is a decimal.js instance; strings/numbers also accepted.
  return new Decimal(value as Decimal.Value);
}

/** Round to 2 decimal places (half-up). */
export function round2(value: Money): Decimal {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function add(...values: Money[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function sub(a: Money, b: Money): Decimal {
  return d(a).minus(d(b));
}

export function mul(a: Money, b: Money): Decimal {
  return d(a).times(d(b));
}

/** Sum a column of amounts (e.g. charges / slips) with 2dp rounding. */
export function sum(values: Money[]): Decimal {
  return round2(values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0)));
}

export function isZero(value: Money): boolean {
  return d(value).isZero();
}

export function gt(a: Money, b: Money): boolean {
  return d(a).greaterThan(d(b));
}

export function gte(a: Money, b: Money): boolean {
  return d(a).greaterThanOrEqualTo(d(b));
}

export function lte(a: Money, b: Money): boolean {
  return d(a).lessThanOrEqualTo(d(b));
}

export function eq(a: Money, b: Money): boolean {
  return d(a).equals(d(b));
}

/** Convert to the Prisma.Decimal type for persistence. */
export function toPrisma(value: Money): Prisma.Decimal {
  return new Prisma.Decimal(round2(value).toFixed(2));
}

/** Format for display/PDF, e.g. 12345.6 -> "12,345.60". */
export function format(value: Money): string {
  const n = round2(value);
  const [intPart, decPart] = n.toFixed(2).split(".");
  const withSep = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withSep}.${decPart}`;
}
