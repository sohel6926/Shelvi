/**
 * Round 11 — Target Board first for everyone (owner request, 5 Nov 2026).
 * Pure: builds the board numbers from the stored plan + stats with the existing calc-spec §4 formulas
 * (dailyNeeded, profitTarget, percentOf) and filters them by role on the server:
 *   - admin: everything, including profit;
 *   - manager / staff: percentages, progress, days left, events; ₹ sales figures only when the owner
 *     switched settings.targetBoardShowRupeesToAll on; profit (₹ or %) never.
 * No firebase imports so it is unit-tested in test/round11.test.ts.
 */
import { dailyNeeded, profitTarget } from "../calc/targets";
import { percentOf } from "../calc/ops";

export type BoardRole = "admin" | "manager" | "staff";

export interface CountProgress {
  actual: number;
  target: number | null;
}

export interface BoardInputs {
  /** "YYYY-MM" shown on the board */
  month: string;
  /** IST day "YYYY-MM-DD" */
  today: string;
  yearTarget: number;
  profitMarginPct: number;
  /** this month's target from the (re)plan (§4 / §4b) */
  monthTarget: number;
  monthAutoValue: number;
  monthCalcMode: "auto" | "manual";
  monthActual: number;
  /** today's income (dailyStats/{today}); only used when `month` is the current month */
  todayActual: number;
  yearActual: number;
  /** §4 aheadOrBehind = round2(Σactual − Σoriginal) over the finished months */
  aheadOrBehind: number;
  monthProfit: number;
  events: CountProgress;
  bookings: CountProgress;
  daysInMonth: number;
}

export type AheadStatus = "ahead" | "behind" | "onTrack";

/** Every number of the board before the role filter (what the owner sees). */
export interface FullBoard {
  year: number;
  month: string;
  yearTarget: number;
  yearActual: number;
  yearPct: number | null;
  monthTarget: number;
  monthActual: number;
  incomePct: number | null;
  monthCalcMode: "auto" | "manual";
  monthAutoValue: number;
  todayTarget: number | null;
  todayActual: number | null;
  todayPct: number | null;
  todayHit: boolean;
  dailyNeeded: number;
  daysLeft: number;
  hitTarget: boolean;
  aheadOrBehind: number;
  aheadStatus: AheadStatus;
  events: CountProgress;
  bookings: CountProgress;
  profitTarget: number;
  profitActual: number;
  profitPct: number | null;
}

/** ₹ sales fields: null for manager / staff unless the owner shows ₹ to everyone. */
export const RUPEE_KEYS = ["yearTarget", "yearActual", "monthTarget", "monthActual", "monthAutoValue", "todayTarget", "todayActual", "dailyNeeded", "aheadOrBehind"] as const;
/** Profit fields: admin only, always. */
export const PROFIT_KEYS = ["profitTarget", "profitActual", "profitPct"] as const;

type RupeeKey = (typeof RUPEE_KEYS)[number];
type ProfitKey = (typeof PROFIT_KEYS)[number];

export type BoardView = Omit<FullBoard, RupeeKey | ProfitKey> & { [K in RupeeKey]: number | null } & { [K in ProfitKey]: number | null } & {
  /** true = no ₹ sales amounts in this answer (percentages and progress only) */
  percentOnly: boolean;
  /** true = profit fields are filled (admin) */
  showProfit: boolean;
};

export function aheadStatusOf(aheadOrBehind: number): AheadStatus {
  if (aheadOrBehind >= 0.5) return "ahead";
  if (aheadOrBehind <= -0.5) return "behind";
  return "onTrack";
}

/** Days left in `month` including today (0 for a past month, all days for a future month). */
export function daysLeftIn(month: string, today: string, daysInMonth: number): number {
  const current = today.slice(0, 7);
  if (month < current) return 0;
  if (month > current) return daysInMonth;
  return daysInMonth - Number(today.slice(8, 10)) + 1;
}

export function buildFullBoard(i: BoardInputs): FullBoard {
  const daysLeft = daysLeftIn(i.month, i.today, i.daysInMonth);
  const isCurrent = i.month === i.today.slice(0, 7);
  const need = daysLeft >= 1 ? dailyNeeded(i.monthTarget, i.monthActual, daysLeft) : 0;
  // Today's target = what was still needed per day when today started (same §4 dailyNeeded, without today's sales).
  const todayTarget = isCurrent && daysLeft >= 1 ? dailyNeeded(i.monthTarget, Math.max(0, i.monthActual - i.todayActual), daysLeft) : null;
  const todayActual = isCurrent ? i.todayActual : null;
  const todayPct = todayTarget !== null && todayActual !== null ? percentOf(todayActual, todayTarget, 1) : null;
  const pTarget = i.monthTarget > 0 ? profitTarget(i.monthTarget, i.profitMarginPct) : 0;
  return {
    year: Number(i.month.slice(0, 4)),
    month: i.month,
    yearTarget: i.yearTarget,
    yearActual: i.yearActual,
    yearPct: percentOf(i.yearActual, i.yearTarget, 1),
    monthTarget: i.monthTarget,
    monthActual: i.monthActual,
    incomePct: percentOf(i.monthActual, i.monthTarget, 1),
    monthCalcMode: i.monthCalcMode,
    monthAutoValue: i.monthAutoValue,
    todayTarget,
    todayActual,
    todayPct,
    todayHit: todayTarget !== null && todayActual !== null && todayActual >= todayTarget,
    dailyNeeded: need,
    daysLeft,
    hitTarget: i.monthTarget > 0 && i.monthActual >= i.monthTarget,
    aheadOrBehind: i.aheadOrBehind,
    aheadStatus: aheadStatusOf(i.aheadOrBehind),
    events: i.events,
    bookings: i.bookings,
    profitTarget: pTarget,
    profitActual: i.monthProfit,
    profitPct: percentOf(i.monthProfit, pTarget, 1),
  };
}

/** The role filter. Never trust the client to hide: fields the caller may not see are sent as null. */
export function filterBoard(full: FullBoard, role: BoardRole, showRupeesToAll: boolean): BoardView {
  const showProfit = role === "admin";
  const showRupees = role === "admin" || showRupeesToAll === true;
  const out = { ...full, percentOnly: !showRupees, showProfit } as unknown as Record<string, unknown>;
  if (!showRupees) for (const k of RUPEE_KEYS) out[k] = null;
  if (!showProfit) for (const k of PROFIT_KEYS) out[k] = null;
  return out as unknown as BoardView;
}
