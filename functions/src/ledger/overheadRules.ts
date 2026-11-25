/**
 * Module 4h (19 Nov 2026) — sharing the month's overheads among its events. Pure rules; tested in
 * test/module4l.test.ts.
 *
 * An event's own profit (income − food, labour, transport, rentals tagged to it) leaves out what the business pays
 * anyway: kitchen rent, power, office, vehicles, monthly salaries. This report takes those costs of one month and
 * shares them among that month's events, so the owner sees what each event really left after its share.
 * Three ways to share: by income (default), by guests, or equally. It is a report — nothing is stored, and the
 * books are not changed.
 */
export const OVERHEAD_BASES = ["income", "guests", "equal"] as const;
export type OverheadBasis = (typeof OVERHEAD_BASES)[number];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface EventLine {
  id: string;
  day: string;
  name: string;
  income: number;
  directCost: number;
  guests: number;
}
export interface SharedLine extends EventLine {
  directProfit: number;
  share: number;
  netProfit: number;
  /** net profit as % of income (null when there is no income) */
  marginPct: number | null;
}

/**
 * Shares `pool` among the events. The shares add up to the pool exactly (the last event absorbs the rounding).
 * When the chosen basis is zero for every event (no income yet, no guest counts) the pool is shared equally.
 */
export function shareOverhead(pool: number, events: EventLine[], basis: OverheadBasis): { lines: SharedLine[]; basisUsed: OverheadBasis } {
  const weight = (e: EventLine) => (basis === "income" ? Math.max(0, e.income) : basis === "guests" ? Math.max(0, e.guests) : 1);
  let used: OverheadBasis = basis;
  let weights = events.map(weight);
  let total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    used = "equal";
    weights = events.map(() => 1);
    total = events.length;
  }
  const p = r2(Math.max(0, pool));
  let given = 0;
  const lines = events.map((e, i) => {
    const share = i === events.length - 1 ? r2(p - given) : r2((p * weights[i]) / total);
    given = r2(given + share);
    const directProfit = r2(e.income - e.directCost);
    const netProfit = r2(directProfit - share);
    return { ...e, directProfit, share, netProfit, marginPct: e.income > 0 ? Math.round((netProfit / e.income) * 1000) / 10 : null };
  });
  return { lines, basisUsed: used };
}

export function overheadTotals(lines: SharedLine[]): { income: number; directCost: number; directProfit: number; share: number; netProfit: number } {
  const sum = (f: (l: SharedLine) => number) => r2(lines.reduce((a, l) => a + f(l), 0));
  return { income: sum((l) => l.income), directCost: sum((l) => l.directCost), directProfit: sum((l) => l.directProfit), share: sum((l) => l.share), netProfit: sum((l) => l.netProfit) };
}

/** The pool: overhead-tagged bills and expenses of the month by centre, plus monthly salaries. */
export function overheadPool(costs: { centre: string; amount: number }[], monthlySalaries: number): { total: number; byCentre: { centre: string; amount: number }[] } {
  const m = new Map<string, number>();
  for (const c of costs) if (c.amount > 0) m.set(c.centre, r2((m.get(c.centre) ?? 0) + c.amount));
  if (monthlySalaries > 0) m.set("salaries", r2((m.get("salaries") ?? 0) + monthlySalaries));
  const byCentre = [...m.entries()].map(([centre, amount]) => ({ centre, amount })).sort((a, b) => b.amount - a.amount);
  return { total: r2(byCentre.reduce((a, b) => a + b.amount, 0)), byCentre };
}
