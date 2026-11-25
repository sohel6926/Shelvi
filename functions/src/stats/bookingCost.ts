import { getFirestore, FieldValue, QuerySnapshot, DocumentData } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asObj, asStr, Doc, nonNeg } from "../shared/coerce";
import { round2 } from "../calc/util";
import { bookingCost, BookingCostResult } from "./bookingCostCalc";

export { bookingCost };

function merge(...snaps: QuerySnapshot<DocumentData>[]): Doc[] {
  const m = new Map<string, Doc>();
  for (const s of snaps) for (const d of s.docs) m.set(d.ref.path, d.data() as Doc);
  return [...m.values()];
}

/** Loads everything tagged to the booking (costTarget.bookingId or legacy bookingId) and computes §R7-1 event cost. */
export async function loadBookingCost(bookingId: string, cancellationCharge = 0): Promise<BookingCostResult> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const byField = (col: string, field: string) => db.collection(col).where(field, "==", bookingId).get();
  const [invoices, p1, p2, e1, e2, attendance, vehicleTrips, equipmentMoves, o1, o2] = await Promise.all([
    byField(c.INVOICES, "bookingId"),
    byField(c.PURCHASES, "bookingId"),
    byField(c.PURCHASES, "costTarget.bookingId"),
    byField(c.EXPENSES, "bookingId"),
    byField(c.EXPENSES, "costTarget.bookingId"),
    byField(c.ATTENDANCE, "bookingId"),
    byField(c.VEHICLE_TRIPS, "bookingId"),
    byField(c.EQUIPMENT_MOVES, "bookingId"),
    byField(c.OUTSIDE_ORDERS, "bookingId"),
    byField(c.OUTSIDE_ORDERS, "costTarget.bookingId"),
  ]);
  const moves = equipmentMoves.docs.map((d) => d.data() as Doc);
  const eqIds = [...new Set(moves.map((m) => asStr(m.equipmentId)).filter(Boolean))];
  const eqSnaps = eqIds.length ? await db.getAll(...eqIds.map((id) => db.collection(c.EQUIPMENT).doc(id))) : [];
  const equipment = Object.fromEntries(eqSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Doc]));
  return bookingCost({
    bookingId,
    invoices: invoices.docs.map((d) => d.data() as Doc),
    purchases: merge(p1, p2),
    expenses: merge(e1, e2),
    attendance: attendance.docs.map((d) => d.data() as Doc),
    vehicleTrips: vehicleTrips.docs.map((d) => d.data() as Doc),
    equipmentMoves: moves,
    outsideOrders: merge(o1, o2),
    equipment,
    cancellationCharge,
  });
}

export async function recomputeBookingCost(bookingId: string): Promise<void> {
  const ref = getFirestore().collection(FirestoreCollections.BOOKINGS).doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const b = snap.data() as Doc;
  if (b.closed) return; // R7-9: a closed event keeps its profit snapshot
  // Round 9: a cancelled order keeps its tagged costs as a loss ("రద్దైన event ఖర్చు"), less the charge kept.
  const cancelled = asStr(b.status) === "Cancelled";
  const charge = cancelled ? nonNeg(asObj(b.cancel).charge) : 0;
  const r = await loadBookingCost(bookingId, charge);
  const k = r.costActual;
  const costs = round2(k.food + k.labour + k.transport + k.rentals + k.other);
  await ref.update({
    costActual: r.costActual,
    profitActual: r.profitActual,
    cancelLoss: cancelled ? round2(Math.max(0, costs - charge)) : FieldValue.delete(),
    costUpdatedAt: FieldValue.serverTimestamp(),
    updatedBy: "system",
  });
}
