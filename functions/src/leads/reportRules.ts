/**
 * Module 1f (18 Nov 2026) — leads report for a period: totals, by source, by person, response speed.
 * Pure: the callable passes the rows, this file only counts. No money here.
 */
export interface ReportLead {
  status: string;
  source: string;
  assignedTo: string;
  assignedName: string;
  createdAtMs: number | null;
  firstResponseAtMs: number | null;
  /** came from an Excel import (old enquiry): counted in totals, left out of response speed */
  imported: boolean;
  cancelled: boolean;
}

export interface Counts {
  total: number;
  open: number;
  won: number;
  lost: number;
  /** duplicate + invalid */
  dropped: number;
  /** won ÷ (total − dropped) × 100, one decimal; null when nothing real came in */
  conversionPct: number | null;
}

export interface ResponseStats {
  /** leads that could be answered (not imported, with a created time) */
  measured: number;
  answered: number;
  /** answered within the limit */
  inTime: number;
  /** still new / assigned */
  unanswered: number;
  /** average minutes to the first response over answered leads; null when none */
  avgMinutes: number | null;
  /** inTime ÷ answered × 100, one decimal; null when none answered */
  inTimePct: number | null;
}

export interface LeadReport {
  totals: Counts;
  bySource: ({ source: string } & Counts)[];
  byPerson: ({ uid: string; name: string } & Counts & { response: ResponseStats })[];
  response: ResponseStats;
}

const OPEN_END = ["won", "lost", "duplicate", "invalid"];
const round1 = (n: number) => Math.round(n * 10) / 10;

function emptyCounts(): Counts {
  return { total: 0, open: 0, won: 0, lost: 0, dropped: 0, conversionPct: null };
}

function addTo(c: Counts, status: string): void {
  c.total++;
  if (status === "won") c.won++;
  else if (status === "lost") c.lost++;
  else if (status === "duplicate" || status === "invalid") c.dropped++;
  else c.open++;
}

function finish(c: Counts): Counts {
  const real = c.total - c.dropped;
  return { ...c, conversionPct: real > 0 ? round1((c.won / real) * 100) : null };
}

function responseOf(rows: ReportLead[], limitMinutes: number): ResponseStats {
  const measuredRows = rows.filter((r) => !r.imported && r.createdAtMs !== null);
  const answeredRows = measuredRows.filter((r) => r.firstResponseAtMs !== null && r.firstResponseAtMs >= (r.createdAtMs as number));
  const minutes = answeredRows.map((r) => ((r.firstResponseAtMs as number) - (r.createdAtMs as number)) / 60000);
  const inTime = minutes.filter((m) => m <= limitMinutes).length;
  return {
    measured: measuredRows.length,
    answered: answeredRows.length,
    inTime,
    unanswered: measuredRows.filter((r) => r.firstResponseAtMs === null && !OPEN_END.includes(r.status) && (r.status === "new" || r.status === "assigned")).length,
    avgMinutes: minutes.length ? round1(minutes.reduce((s, m) => s + m, 0) / minutes.length) : null,
    inTimePct: minutes.length ? round1((inTime / minutes.length) * 100) : null,
  };
}

/** Cancelled leads are left out everywhere. Rows are sorted by total (largest first), then by name. */
export function buildLeadReport(all: ReportLead[], limitMinutes: number): LeadReport {
  const rows = all.filter((r) => !r.cancelled);
  const totals = emptyCounts();
  const sources = new Map<string, Counts>();
  const people = new Map<string, { name: string; counts: Counts; rows: ReportLead[] }>();
  for (const r of rows) {
    addTo(totals, r.status);
    const s = sources.get(r.source) ?? emptyCounts();
    addTo(s, r.status);
    sources.set(r.source, s);
    const p = people.get(r.assignedTo) ?? { name: r.assignedName, counts: emptyCounts(), rows: [] };
    if (!p.name && r.assignedName) p.name = r.assignedName;
    addTo(p.counts, r.status);
    p.rows.push(r);
    people.set(r.assignedTo, p);
  }
  return {
    totals: finish(totals),
    bySource: [...sources.entries()].map(([source, c]) => ({ source, ...finish(c) })).sort((a, b) => b.total - a.total || a.source.localeCompare(b.source)),
    byPerson: [...people.entries()]
      .map(([uid, p]) => ({ uid, name: p.name, ...finish(p.counts), response: responseOf(p.rows, limitMinutes) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    response: responseOf(rows, limitMinutes),
  };
}
