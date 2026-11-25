/**
 * Module 1c (18 Nov 2026) — HOT / WARM / COLD for an open lead. Pure, explainable, no AI: every point comes from a
 * field the team typed, and the reasons are shown to the user. A person can override it (lead.scoreManual).
 * The web copy of this rule is web/src/modules/leads/leadScore.ts — keep the two the same.
 *
 * Points (max 100): event date 35 · guests 20 · budget 15 · stage 20 · source 10.  HOT ≥ 60 · WARM ≥ 35 · else COLD.
 */
export type LeadBand = "hot" | "warm" | "cold";

export interface ScoreLead {
  status: string;
  source: string;
  /** YYYY-MM-DD or "" */
  eventDate: string;
  guests: number | null;
  budget: number | null;
  /** "hot" | "warm" | "cold" set by a person; anything else = automatic */
  scoreManual?: string;
}

export interface LeadScore {
  /** 0–100 automatic points (also returned when a manual band is set) */
  score: number;
  band: LeadBand;
  manual: boolean;
  reasons: { te: string; en: string; points: number }[];
}

const CLOSED = ["won", "lost", "duplicate", "invalid"];
export const HOT_MIN = 60;
export const WARM_MIN = 35;

const STAGE_POINTS: Record<string, number> = { new: 0, assigned: 0, contacted: 6, requirement: 10, tasting: 14, qualified: 16, quoted: 20 };
const SOURCE_POINTS: Record<string, number> = { referral: 10, walkin: 8, google: 5, justdial: 5, instagram: 4, facebook: 4, other: 2 };

/** Whole days from `today` to `day` (both YYYY-MM-DD); null when `day` is not a real date. */
export function daysUntil(day: string, today: string): number | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(day) || !re.test(today)) return null;
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export const bandOf = (score: number): LeadBand => (score >= HOT_MIN ? "hot" : score >= WARM_MIN ? "warm" : "cold");

/** null for a closed lead (won / lost / duplicate / invalid): nothing to chase. */
export function scoreLead(lead: ScoreLead, today: string): LeadScore | null {
  if (CLOSED.includes(lead.status)) return null;
  const reasons: LeadScore["reasons"] = [];
  const add = (points: number, te: string, en: string) => reasons.push({ te, en, points });

  const d = lead.eventDate ? daysUntil(lead.eventDate, today) : null;
  if (d === null) add(0, "Event తేదీ తెలియదు", "Event date not known");
  else if (d < 0) add(0, "Event తేదీ దాటిపోయింది", "Event date has passed");
  else if (d <= 7) add(35, `Event ${d} రోజుల్లో`, `Event in ${d} days`);
  else if (d <= 30) add(28, `Event ${d} రోజుల్లో`, `Event in ${d} days`);
  else if (d <= 90) add(18, `Event ${d} రోజుల్లో`, `Event in ${d} days`);
  else add(8, `Event ${d} రోజుల తర్వాత`, `Event in ${d} days`);

  const g = typeof lead.guests === "number" && lead.guests >= 1 ? lead.guests : null;
  if (g === null) add(0, "అతిథుల సంఖ్య తెలియదు", "Guest count not known");
  else add(g >= 500 ? 20 : g >= 200 ? 15 : g >= 100 ? 10 : 5, `${g} మంది అతిథులు`, `${g} guests`);

  const b = typeof lead.budget === "number" && lead.budget > 0 ? lead.budget : null;
  if (b === null) add(0, "బడ్జెట్ చెప్పలేదు", "Budget not stated");
  else if (g === null) add(8, "బడ్జెట్ చెప్పారు", "Budget stated");
  else {
    const perPlate = b / g;
    add(perPlate >= 300 ? 15 : perPlate >= 150 ? 10 : 5, `ప్లేటుకి సుమారు ₹${Math.round(perPlate)}`, `About ₹${Math.round(perPlate)} per plate`);
  }

  const stage = STAGE_POINTS[lead.status] ?? 0;
  add(stage, stage > 0 ? "మనతో మాట్లాడుతున్నారు (దశ ముందుకు వెళ్ళింది)" : "ఇంకా మాట్లాడలేదు", stage > 0 ? "Already talking to us (stage has moved on)" : "Not contacted yet");

  const src = SOURCE_POINTS[lead.source] ?? SOURCE_POINTS.other;
  add(src, lead.source === "referral" ? "తెలిసినవారి ద్వారా వచ్చారు" : lead.source === "walkin" ? "నేరుగా వచ్చారు" : "Online / ఇతర మార్గం", lead.source === "referral" ? "Came by referral" : lead.source === "walkin" ? "Walked in" : "Online / other source");

  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  const manual = lead.scoreManual === "hot" || lead.scoreManual === "warm" || lead.scoreManual === "cold";
  return { score, band: manual ? (lead.scoreManual as LeadBand) : bandOf(score), manual, reasons };
}
