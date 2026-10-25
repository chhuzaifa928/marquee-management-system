/**
 * Event dates represent a calendar day. We normalise to midnight UTC so a day
 * can be matched with a half-open range [day, nextDay).
 */
export function startOfDay(input: Date | string): Date {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function nextDay(input: Date | string): Date {
  const start = startOfDay(input);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** First day of the month (UTC) for a given date. */
export function startOfMonth(input: Date | string): Date {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** First day of the next month (UTC). */
export function startOfNextMonth(input: Date | string): Date {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
