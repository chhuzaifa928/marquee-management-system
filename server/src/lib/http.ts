/** Parse a query param as a non-negative integer, or undefined if absent/invalid. */
export function intQuery(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}
