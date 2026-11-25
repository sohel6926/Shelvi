/** Pure parts of eventPlan / dayPlan (§13.3–13.5) and plan notifications. */
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { sameValue } from "../shared/historyDiff";
import { round2 } from "../calc/util";

export interface PlanDishLine {
  key: string;
  dishId: string;
  variantId: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  qty: number | null;
}

export function planLineKey(sessionId: string, dishId: string, variantId: string): string {
  return `${sessionId || "-"}|${dishId}|${variantId || "-"}`;
}

/** Fields whose change can change a booking's plan (planSnapshot / updatedBy etc. are ignored → no trigger loops). */
export const PLAN_INPUT_FIELDS = ["guestCount", "guestCountConfirmed", "guestCountActual", "sessions", "serviceStyle", "packageId", "menuPackageId", "eventTypeCode", "quotationId", "status", "eventDate", "mealType"];

export function planInputsChanged(before: Doc | undefined, after: Doc | undefined): boolean {
  if (!after) return false;
  if (!before) return true;
  return PLAN_INPUT_FIELDS.some((f) => !sameValue(before[f], after[f]));
}

export interface PlanChange {
  key: string;
  nameTe: string;
  nameEn: string;
  unit: string;
  old: number | null;
  now: number | null;
}

/** Differences between the stored snapshot (key → qty) and the new plan lines. */
export function planChanges(old: Record<string, number>, lines: PlanDishLine[]): PlanChange[] {
  const out: PlanChange[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    seen.add(l.key);
    const was = typeof old[l.key] === "number" ? old[l.key] : null;
    if (was !== l.qty) out.push({ key: l.key, nameTe: l.nameTe, nameEn: l.nameEn, unit: l.unit, old: was, now: l.qty });
  }
  for (const [k, v] of Object.entries(old)) if (!seen.has(k)) out.push({ key: k, nameTe: k.split("|")[1], nameEn: k.split("|")[1], unit: "", old: v, now: null });
  return out;
}

export function snapshotOf(lines: PlanDishLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) if (typeof l.qty === "number") out[l.key] = l.qty;
  return out;
}

const qtyText = (q: number | null, unit: string) => (q === null ? "-" : `${q} ${unit}`.trim());

/** In-app notification texts (Telugu first). */
export function planReadyText(customer: string, day: string, lines: PlanDishLine[]): { te: string; en: string } {
  const top = lines.filter((l) => l.qty !== null).slice(0, 4);
  return {
    te: `వంట plan సిద్ధం: ${customer} (${day}) — ${top.map((l) => `${l.nameTe || l.nameEn} ${qtyText(l.qty, l.unit)}`).join(", ")}`,
    en: `Cooking plan ready: ${customer} (${day}) — ${top.map((l) => `${l.nameEn || l.nameTe} ${qtyText(l.qty, l.unit)}`).join(", ")}`,
  };
}

export function planChangedText(customer: string, changes: PlanChange[]): { te: string; en: string } {
  const c = changes.slice(0, 5);
  return {
    te: `వంట plan మారింది: ${customer} — ${c.map((x) => `${x.nameTe || x.nameEn} ${qtyText(x.old, x.unit)} → ${qtyText(x.now, x.unit)}`).join(", ")}`,
    en: `Cooking plan changed: ${customer} — ${c.map((x) => `${x.nameEn || x.nameTe} ${qtyText(x.old, x.unit)} → ${qtyText(x.now, x.unit)}`).join(", ")}`,
  };
}

export function tomorrowText(events: number, dishes: { nameTe: string; nameEn: string; unit: string; total: number }[]): { te: string; en: string } {
  const top = [...dishes].sort((a, b) => b.total - a.total).slice(0, 4);
  return {
    te: `రేపటి వంట plan సిద్ధం: ${events} events, ${top.map((d) => `${d.nameTe || d.nameEn} ${round2(d.total)} ${d.unit}`).join(", ")}`,
    en: `Tomorrow's cooking plan is ready: ${events} events, ${top.map((d) => `${d.nameEn || d.nameTe} ${round2(d.total)} ${d.unit}`).join(", ")}`,
  };
}

/** Menu options of a quotation for the booking or one of its sessions (only options linked to a dish). */
export function quotationMenuOptions(quotation: Doc | undefined, sessionId: string): Doc[] {
  if (!quotation) return [];
  const sq = asArr(quotation.sessionQuotes).map(asObj);
  const choices = sessionId && sq.length ? asArr(sq.find((x) => asStr(x.sessionId) === sessionId)?.menuChoices) : asArr(quotation.menuChoices);
  return choices.map(asObj).filter((o) => asStr(o.dishId));
}
