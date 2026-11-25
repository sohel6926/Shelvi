/**
 * Module 1c — HOT / WARM / COLD for an open lead. This is the web copy of functions/src/leads/scoreRules.ts
 * (tested there in functions/test/module1c.test.ts) — keep the two the same.
 * Points (max 100): event date 35 · guests 20 · budget 15 · stage 20 · source 10.  HOT ≥ 60 · WARM ≥ 35 · else COLD.
 */
export type LeadBand = "hot" | "warm" | "cold";

export interface ScoreLead {
  status: string;
  source: string;
  eventDate: string;
  guests: number | null;
  budget: number | null;
  scoreManual?: string;
}

export interface LeadScore {
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

export function daysUntil(day: string, today: string): number | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(day) || !re.test(today)) return null;
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export const bandOf = (score: number): LeadBand => (score >= HOT_MIN ? "hot" : score >= WARM_MIN ? "warm" : "cold");

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

export const BAND_LABEL: Record<LeadBand, { te: string; en: string; color: "error" | "warning" | "info" }> = {
  hot: { te: "HOT (వేడి)", en: "HOT", color: "error" },
  warm: { te: "WARM (మధ్యస్థం)", en: "WARM", color: "warning" },
  cold: { te: "COLD (చల్లని)", en: "COLD", color: "info" },
};

/** Last 10 digits of a phone, for the duplicate warning ("" when there are fewer than 10 digits). */
export function phoneKey(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}
