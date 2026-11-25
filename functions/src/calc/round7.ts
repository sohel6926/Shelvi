/**
 * Round 7 calculations (docs/calc-spec.md §14–§18). Pure.
 */
import { CalcError, requireFinite, requireNonNeg, round2 } from "./util";

/** §14 extra plates: guests beyond the quoted plates are charged at the plate price (per session). */
export function extraPlates(guestCountActual: number, quotedPlates: number, pricePerPlate: number): { qty: number; amount: number } {
  requireNonNeg("guestCountActual", guestCountActual);
  requireNonNeg("quotedPlates", quotedPlates);
  requireNonNeg("pricePerPlate", pricePerPlate);
  if (!Number.isInteger(guestCountActual) || !Number.isInteger(quotedPlates)) throw new CalcError("guest counts must be whole numbers");
  const qty = Math.max(0, guestCountActual - quotedPlates);
  return { qty, amount: round2(qty * pricePerPlate) };
}

/** §15 outside order: cost to the event and amount still due to the vendor (negative = vendor owes us). */
export function outsideOrderAmounts(o: { acceptedQty: number; rate: number; advancePaid: number; paid: number }): { cost: number; amountDue: number } {
  requireNonNeg("acceptedQty", o.acceptedQty);
  requireNonNeg("rate", o.rate);
  requireNonNeg("advancePaid", o.advancePaid);
  requireNonNeg("paid", o.paid);
  const cost = round2(o.acceptedQty * o.rate);
  return { cost, amountDue: round2(cost - o.advancePaid - o.paid) };
}

/** Delivery check: accepted + returned ≤ delivered (rejected items are returned). */
export function checkOutsideDelivery(d: { deliveredQty: number; acceptedQty: number; returnedQty: number }): void {
  requireNonNeg("deliveredQty", d.deliveredQty);
  requireNonNeg("acceptedQty", d.acceptedQty);
  requireNonNeg("returnedQty", d.returnedQty);
  if (d.acceptedQty + d.returnedQty > d.deliveredQty + 1e-9) throw new CalcError("accepted + returned cannot be more than delivered");
}

export type EquipmentMoveType = "issue" | "return" | "damaged" | "lost";

/** §16 vessels/equipment outstanding per item: issued − returned − damaged − lost (never below 0). */
export function equipmentOutstanding(moves: { equipmentId: string; type: string; qty: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) {
    requireNonNeg("qty", m.qty);
    const sign = m.type === "issue" ? 1 : m.type === "return" || m.type === "damaged" || m.type === "lost" ? -1 : 0;
    if (sign === 0) throw new CalcError(`unknown equipment move type ${m.type}`);
    out[m.equipmentId] = round2((out[m.equipmentId] ?? 0) + sign * m.qty);
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0, out[k]);
  return out;
}

/** §16 rented equipment cost: qty × rate × days (days whole ≥ 1). */
export function rentalCost(qty: number, ratePerDay: number, days: number): number {
  requireNonNeg("qty", qty);
  requireNonNeg("rate", ratePerDay);
  if (!Number.isInteger(days) || days < 1) throw new CalcError("days must be a whole number ≥ 1");
  return round2(qty * ratePerDay * days);
}

/** Vehicle trip cost: fuel + ratePerKm × (kmEnd − kmStart) (rented vehicles). */
export function tripCost(t: { fuelCost: number; ratePerKm: number; kmStart: number; kmEnd: number }): number {
  requireNonNeg("fuelCost", t.fuelCost);
  requireNonNeg("ratePerKm", t.ratePerKm);
  requireNonNeg("kmStart", t.kmStart);
  requireNonNeg("kmEnd", t.kmEnd);
  if (t.kmEnd < t.kmStart) throw new CalcError("kmEnd cannot be less than kmStart");
  return round2(t.fuelCost + t.ratePerKm * (t.kmEnd - t.kmStart));
}

export type VendorPaymentStatus = "Unpaid" | "PartiallyPaid" | "Paid";

/** §17 bill payment status from total and paid (one vocabulary for purchases / expenses / outside orders). */
export function billPaymentStatus(total: number, paid: number): { paid: number; balance: number; paymentStatus: VendorPaymentStatus } {
  requireNonNeg("total", total);
  requireFinite("paid", paid);
  const p = round2(paid);
  const balance = round2(Math.max(0, total - p));
  return { paid: p, balance, paymentStatus: balance <= 0 ? "Paid" : p > 0 ? "PartiallyPaid" : "Unpaid" };
}

/** One-time mapping of the old free-text purchase / expense payment statuses (§17). */
export function mapLegacyPaymentStatus(status: string, total: number, advancePaid: number): { paid: number; cancelled: boolean } {
  const s = status.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["paid", "fullypaid", "settled"].includes(s)) return { paid: round2(total), cancelled: false };
  if (s === "cancelled") return { paid: 0, cancelled: true };
  const adv = Number.isFinite(advancePaid) && advancePaid > 0 ? round2(Math.min(advancePaid, total)) : 0;
  return { paid: adv, cancelled: false };
}

/** Purchase → stock: wanted applied quantity per stock item, and the change from what is already applied. */
export function purchaseStockDelta(wanted: Record<string, number>, applied: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(wanted), ...Object.keys(applied)])) {
    const d = round2((wanted[k] ?? 0) - (applied[k] ?? 0));
    if (d !== 0) out[k] = d;
  }
  return out;
}

export interface CloseInput {
  vesselsOutstanding: number;
  outsideOrdersOpen: number;
  pendingExtras: number;
  staffWithoutAttendance: string[];
  customerBalance: number;
  vendorBillsEntered: boolean;
  overrideReason?: string;
}

export interface CloseBlocker {
  code: "vessels" | "outsideOrders" | "extras" | "attendance" | "customerBalance" | "vendorBills";
  te: string;
  en: string;
  /** only the customer balance can be closed over, with a reason */
  overridable: boolean;
}

/** §18 event close blockers. Returns the blockers that still stop the close (overridden balance removed). */
export function closeBlockers(c: CloseInput): CloseBlocker[] {
  const b: CloseBlocker[] = [];
  if (c.vesselsOutstanding > 0) b.push({ code: "vessels", te: `పాత్రలు ఇంకా ${c.vesselsOutstanding} తిరిగి రాలేదు.`, en: `${c.vesselsOutstanding} vessels/equipment not returned.`, overridable: false });
  if (c.outsideOrdersOpen > 0) b.push({ code: "outsideOrders", te: `బయటి ఆర్డర్లు ${c.outsideOrdersOpen} ఇంకా settle కాలేదు.`, en: `${c.outsideOrdersOpen} outside orders not settled.`, overridable: false });
  if (c.pendingExtras > 0) b.push({ code: "extras", te: `అదనపు ఐటమ్స్ ${c.pendingExtras} ఇంకా approve కాలేదు.`, en: `${c.pendingExtras} event extras still pending.`, overridable: false });
  if (c.staffWithoutAttendance.length) b.push({ code: "attendance", te: `${c.staffWithoutAttendance.length} మంది staff కి attendance వేయలేదు.`, en: `Attendance missing for ${c.staffWithoutAttendance.length} assigned staff.`, overridable: false });
  const reasonOk = typeof c.overrideReason === "string" && c.overrideReason.trim().length >= 3;
  if (c.customerBalance > 0.005 && !reasonOk) b.push({ code: "customerBalance", te: `Customer బాకీ ₹${round2(c.customerBalance)} ఉంది (కారణం రాసి close చేయవచ్చు).`, en: `Customer still owes ₹${round2(c.customerBalance)} (close with a reason).`, overridable: true });
  if (!c.vendorBillsEntered) b.push({ code: "vendorBills", te: "Vendor bills అన్నీ నమోదు చేశారని నిర్ధారించండి.", en: "Confirm that all vendor bills are entered.", overridable: false });
  return b;
}

export interface SessionLike {
  date: string;
  serveTime?: string;
  guests: number;
  guestCountConfirmed?: number | null;
  guestCountActual?: number | null;
  status?: string;
}

/** R7-5: booking guestCount = Σ guests of sessions not cancelled; date = earliest session (date, serveTime). */
export function sessionTotals(sessions: SessionLike[]): { guestCount: number; date: string | null; serveTime: string | null; guestCountActual: number | null } {
  const live = sessions.filter((s) => s.status !== "cancelled");
  const guestCount = live.reduce((a, s) => a + (Number.isFinite(s.guests) && s.guests > 0 ? s.guests : 0), 0);
  const first = [...live].sort((a, b) => `${a.date} ${a.serveTime ?? ""}`.localeCompare(`${b.date} ${b.serveTime ?? ""}`))[0];
  const anyActual = live.some((s) => typeof s.guestCountActual === "number" && s.guestCountActual > 0);
  const guestCountActual = anyActual ? live.reduce((a, s) => a + ((s.guestCountActual ?? 0) > 0 ? (s.guestCountActual as number) : (s.guestCountConfirmed ?? 0) > 0 ? (s.guestCountConfirmed as number) : s.guests), 0) : null;
  return { guestCount, date: first?.date ?? null, serveTime: first?.serveTime ?? null, guestCountActual };
}
