/** Pure parts of Round 9 order cancellation / restore / postpone (api-contract Round 9). Money maths: calc/cancellation. */
import { asArr, asNum, asObj, asStr, Doc } from "../shared/coerce";
import { addDays, dayOfValue, formatDayTe, isValidDay } from "../shared/istDate";
import { formatRupees } from "../shared/templates";
import { CANCEL_REASON_TE, CANCEL_REASONS, CancelReasonCode } from "../calc/cancellation";
import { equipmentOutstanding } from "../calc/round7";
import { isLiveRecord } from "../shared/costTarget";
import { round2 } from "../calc/util";

export { CANCEL_REASONS, CANCEL_REASON_TE };
export type { CancelReasonCode };

/** Booking statuses a cancel / postpone cannot start from. */
export function cancelRefusal(b: Doc): { te: string; en: string } | null {
  const s = asStr(b.status);
  if (s === "Cancelled") return { te: "ఈ ఆర్డర్ ఇప్పటికే రద్దు అయింది.", en: "This order is already cancelled." };
  if (b.closed || s === "Closed") return { te: "ఈ event close అయింది — ముందు reopen చేయండి.", en: "This event is closed; reopen it first." };
  return null;
}

const MOVE_TYPES = new Set(["issue", "return", "damaged", "lost"]);
const moveDay = (m: Doc) => dayOfValue(m.date ?? m.day ?? m.issueDate);

/** An equipment move that has not happened yet (reserved / planned, or dated after today) — released on cancel. */
export function isUnissuedMove(m: Doc, today: string): boolean {
  if (!isLiveRecord(m)) return false;
  const status = asStr(m.status).toLowerCase();
  const type = asStr(m.type).toLowerCase();
  if (["planned", "reserved"].includes(status) || ["reserve", "reserved", "planned"].includes(type)) return true;
  const d = moveDay(m);
  return type === "issue" && !!d && d > today;
}

/** Items still out with the event (issued − returned − damaged − lost), ignoring moves that are released. */
export function issuedOutstanding(moves: Doc[], today: string): Record<string, number> {
  const done = moves.filter((m) => isLiveRecord(m) && !isUnissuedMove(m, today) && MOVE_TYPES.has(asStr(m.type)));
  const out = equipmentOutstanding(done.map((m) => ({ equipmentId: asStr(m.equipmentId), type: asStr(m.type), qty: Math.max(0, asNum(m.qty)) })));
  for (const k of Object.keys(out)) if (out[k] <= 0) delete out[k];
  return out;
}

/** A vehicle trip nobody has driven yet (status planned, or no km / fuel recorded) — released on cancel. */
export function isPlannedTrip(t: Doc): boolean {
  if (!isLiveRecord(t)) return false;
  const status = asStr(t.status).toLowerCase();
  if (status === "planned") return true;
  if (status === "done" || status === "completed") return false;
  return asNum(t.kmEnd) <= 0 && asNum(t.fuelCost) <= 0 && asNum(t.kmStart) <= 0;
}

export function equipmentBlocker(outstanding: Record<string, number>, names: Record<string, string>): { te: string; en: string } | null {
  const ids = Object.keys(outstanding);
  if (!ids.length) return null;
  const list = ids.map((id) => `${names[id] || id} ${outstanding[id]}`).join(", ");
  return {
    te: `ముందు సామాన్లు తిరిగి తీసుకోండి (return నమోదు చేయండి): ${list}. తర్వాత ఆర్డర్ రద్దు చేయండి.`,
    en: `Equipment is still out with this event (${list}); record the return first, then cancel.`,
  };
}

export const METHOD_TE: Record<string, string> = { Cash: "నగదు", UPI: "UPI", BankTransfer: "బ్యాంక్ ట్రాన్స్‌ఫర్", Card: "కార్డ్", Other: "ఇతర" };

/** Telugu WhatsApp text for the customer (copy / share — never auto-sent). */
export function customerCancelMessage(p: { customer: string; day: string | null; refund: number; charge: number; method?: string; business: string }): string {
  const lines = [p.customer ? `నమస్కారం ${p.customer} గారు,` : "నమస్కారం,"];
  lines.push(p.day ? `${formatDayTe(p.day)} న మీ ఆర్డర్ రద్దు చేశాం.` : "మీ ఆర్డర్ రద్దు చేశాం.");
  if (p.refund > 0) lines.push(`${formatRupees(p.refund)} తిరిగి ఇస్తున్నాం${p.method ? ` (${METHOD_TE[p.method] ?? p.method})` : ""}.`);
  if (p.charge > 0) lines.push(`${formatRupees(p.charge)} రద్దు చార్జీగా ఉంచుకున్నాం.`);
  lines.push(`మళ్ళీ అవకాశం ఇవ్వండి. — ${p.business || "Suseela Caterings"}`);
  return lines.join("\n");
}

/** "plan మారింది" notification text when an event is cancelled. */
export function cancelPlanText(customer: string, day: string | null, guests: number): { te: string; en: string } {
  const d = day ? formatDayTe(day) : "";
  return {
    te: `వంట plan మారింది: ${customer} (${d}, ${guests} మంది) ఆర్డర్ రద్దు అయింది — ఈ event వంట చేయకండి.`,
    en: `Cooking plan changed: ${customer} (${d}, ${guests} guests) was cancelled — do not cook for this event.`,
  };
}

/** Red band summary for the UI and audit: "₹5,000 తిరిగి, ₹2,000 ఉంచుకున్నాం, 3 staff, 1 vehicle free". */
export function cancelSummaryText(p: { refund: number; charge: number; staff: number; trips: number; moves: number }): { te: string; en: string } {
  const te: string[] = [];
  const en: string[] = [];
  if (p.refund > 0) { te.push(`${formatRupees(p.refund)} తిరిగి`); en.push(`${formatRupees(p.refund)} refunded`); }
  if (p.charge > 0) { te.push(`${formatRupees(p.charge)} ఉంచుకున్నాం`); en.push(`${formatRupees(p.charge)} kept`); }
  if (p.staff > 0) { te.push(`${p.staff} staff free`); en.push(`${p.staff} staff freed`); }
  if (p.trips > 0) { te.push(`${p.trips} vehicle free`); en.push(`${p.trips} vehicle trip(s) released`); }
  if (p.moves > 0) { te.push(`${p.moves} సామాన్ల reservation రద్దు`); en.push(`${p.moves} equipment reservation(s) released`); }
  return { te: te.join(", ") || "డబ్బు లావాదేవీ లేదు", en: en.join(", ") || "No money step" };
}

/** Cancellation charge line appended to the cancelled invoice. */
export function chargeLine(charge: number): Doc {
  return { key: "cancellation-charge", description: "Cancellation charge", descriptionTe: "రద్దు చార్జీ", quantity: 1, unitPrice: round2(charge), amount: round2(charge) };
}

/** restoreBooking is allowed only for a cancelled booking whose event day is today or later. */
export function restoreRefusal(b: Doc, today: string): { te: string; en: string } | null {
  if (asStr(b.status) !== "Cancelled") return { te: "ఈ ఆర్డర్ రద్దు కాలేదు.", en: "This order is not cancelled." };
  const day = dayOfValue(b.eventDate);
  if (!day || day < today) return { te: "Event తేదీ దాటిపోయింది — ఇది తిరిగి తేలేము. కొత్త booking చేయండి.", en: "The event date has passed; it cannot be restored. Create a new booking." };
  return null;
}

/** Status to go back to on restore (never Cancelled / Closed / Completed). */
export function restoreStatus(b: Doc): string {
  const prev = asStr(asObj(b.cancel).previousStatus) || asStr(b.previousStatus);
  return prev && !["Cancelled", "Closed", "Completed"].includes(prev) ? prev : "Confirmed";
}

/** Postpone: shifts each session date by the same number of days as the booking day. */
export function shiftSessions(sessions: unknown, fromDay: string, toDay: string): unknown {
  if (!Array.isArray(sessions)) return sessions;
  const delta = Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);
  if (!delta) return sessions;
  return sessions.map((s) => {
    const o = asObj(s);
    const d = asStr(o.date);
    return isValidDay(d) ? { ...o, date: addDays(d, delta) } : s;
  });
}

/** Booking-day change (postpone) for a live booking: null when the day did not change. */
export function eventDayChange(before: Doc | undefined, after: Doc | undefined): { from: string; to: string } | null {
  if (!before || !after) return null;
  if (asStr(after.status) === "Cancelled" || asStr(before.status) === "Cancelled" || after.archived === true) return null;
  const from = dayOfValue(before.eventDate);
  const to = dayOfValue(after.eventDate);
  return from && to && from !== to ? { from, to } : null;
}

export function dateChangedText(customer: string, from: string, to: string): { te: string; en: string } {
  return {
    te: `తేదీ మారింది: ${customer} ఆర్డర్ ${formatDayTe(from)} → ${formatDayTe(to)}. వంట plan, timeline కొత్త తేదీకి మారాయి.`,
    en: `Date changed: ${customer}'s order ${formatDayTe(from)} → ${formatDayTe(to)}. Cooking plan and timeline moved to the new date.`,
  };
}

/** Invoice money fields that a cancel replaces and a restore puts back. */
export const INVOICE_MONEY_FIELDS = ["status", "lineItems", "subtotal", "discount", "taxable", "gstRate", "cgstAmount", "sgstAmount", "igstAmount", "taxAmount", "totalAmount", "balanceDue"] as const;

/**
 * Cancelled invoice: the old money moves to `beforeCancel`; the document becomes only the charge kept —
 * lines [రద్దు చార్జీ X] (or [] when X = 0), subtotal = taxable = total = amountPaid = X, discount / tax 0, balance 0.
 */
export function cancelledInvoiceFields(inv: Doc, kept: number): Doc {
  const x = round2(Math.max(0, kept));
  const beforeCancel: Doc = {};
  for (const f of INVOICE_MONEY_FIELDS) if (inv[f] !== undefined) beforeCancel[f] = inv[f];
  return {
    beforeCancel,
    lineItems: x > 0 ? [chargeLine(x)] : [],
    subtotal: x,
    discount: 0,
    taxable: x,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    taxAmount: 0,
    totalAmount: x,
    amountPaid: x,
    balanceDue: 0,
    cancellationCharge: x,
    status: "Cancelled",
    previousStatus: asStr(inv.status),
  };
}

/** Restore: the old money fields back from `beforeCancel` (status / amountPaid / balance are re-derived by the caller). */
export function restoredInvoiceMoney(inv: Doc): Doc | null {
  const before = asObj(inv.beforeCancel);
  if (asStr(inv.status) !== "Cancelled" || !Object.keys(before).length) return null;
  const out: Doc = {};
  for (const f of INVOICE_MONEY_FIELDS) if (f !== "status" && f !== "balanceDue" && before[f] !== undefined) out[f] = before[f];
  if (!Array.isArray(out.lineItems)) out.lineItems = asArr(inv.lineItems).filter((l) => asStr(asObj(l).key) !== "cancellation-charge");
  out.totalAmount = asNum(before.totalAmount);
  return out;
}
