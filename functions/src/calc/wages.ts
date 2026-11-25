import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";

/** Spec §7. */
export function dayPay(dailyWage: number, hours: number): number {
  requireNonNeg("dailyWage", dailyWage);
  requireFinite("hours", hours);
  if (hours < 0 || hours > 24) throw new CalcError("hours must be between 0 and 24");
  const base = hours === 0 ? 0 : hours < 4 ? dailyWage / 2 : dailyWage;
  const ot = Math.max(0, hours - 8) * (dailyWage / 8) * 1.5;
  return round2(base + ot);
}

export function monthSalary(days: { dailyWage: number; hours: number }[], advances: number): { gross: number; net: number } {
  requireNonNeg("advances", advances);
  const gross = round2(days.reduce((a, d) => a + dayPay(d.dailyWage, d.hours), 0));
  return { gross, net: round2(gross - advances) };
}
