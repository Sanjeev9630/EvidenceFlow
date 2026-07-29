const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a date without JavaScript's silent calendar roll-over, so that an
 * impossible date such as 2024-04-31 is rejected instead of becoming 1 May.
 */
export function parseStrictDate(value: string): Date | null {
  const text = value.trim();
  if (text === "") return null;

  const isoMatch = ISO_DATE.exec(text);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(Date.UTC(year, month - 1, day));
    const validCalendarDate =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    return validCalendarDate ? date : null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
