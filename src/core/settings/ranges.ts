/** The values a numeric setting accepts. */
export type Range = Readonly<{ min: number; max: number; integer?: boolean }>;

/**
 * `raw` as a number when it is one within `range`, `fallback` otherwise:
 * missing, empty, non-numeric, out of range or - for an integer range - with
 * a fraction. Shared by the settings classes reading stored data.
 */
export function inRange(raw: unknown, range: Range, fallback: number): number {
  const value = raw === null || raw === "" || typeof raw === "boolean" ? NaN : Number(raw);
  const { min, max, integer = false } = range;
  return Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
    ? value
    : fallback;
}
