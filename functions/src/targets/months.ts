import { asArr } from "../shared/coerce";

/** How many months of `year` are finished on IST day `today` (Jan = month 0). */
export function finishedMonths(year: number, today: string): number {
  const y = Number(today.slice(0, 4));
  if (year < y) return 12;
  if (year > y) return 0;
  return Number(today.slice(5, 7)) - 1;
}

export function monthKey(year: number, i: number): string {
  return `${year}-${String(i + 1).padStart(2, "0")}`;
}


/** Stored manualMonths → 12 entries of whole number ≥ 0 or null (anything else counts as automatic). */
export function readManualMonths(v: unknown): (number | null)[] {
  const a = asArr(v);
  return Array.from({ length: 12 }, (_, i) => {
    const x = a[i];
    return typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null;
  });
}

/**
 * setYearTarget inputs (contract audit fix 4): a value not sent keeps the year's stored value; settings are used
 * only for a year that has no document yet. manualMonths not sent → stored typed months; 12 nulls → automatic.
 */
export function resolveYearTargetInputs(
  sent: { profitMarginPct?: number; weights?: number[]; manualMonths?: (number | null)[] },
  stored: { profitMarginPct: number; weights: number[] | null; manualMonths: (number | null)[] } | null,
  defaults: { profitMarginPct: number; seasonWeights: number[] },
): { profitMarginPct: number; weights: number[]; manualMonths: (number | null)[]; manualMonthsSent: boolean } {
  const allNull: (number | null)[] = Array.from({ length: 12 }, () => null);
  return {
    profitMarginPct: sent.profitMarginPct ?? stored?.profitMarginPct ?? defaults.profitMarginPct,
    weights: sent.weights ?? stored?.weights ?? defaults.seasonWeights,
    manualMonths: sent.manualMonths ?? stored?.manualMonths ?? allNull,
    manualMonthsSent: sent.manualMonths !== undefined,
  };
}
