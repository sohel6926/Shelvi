/**
 * bookings/{id}.costActual / profitActual (🔒 server-owned): direct costs of the event.
 * A cost belongs to the booking when its costTarget is { type: "booking", bookingId } (legacy: bookingId field).
 *   food      = purchases + accepted outside orders (acceptedQty × rate) + "Outside Purchase" / "Live Counter" expenses
 *   labour    = attendance.pay with bookingId + "Temporary Staff" expenses
 *   transport = "Transport" expenses + vehicle trips (fuel + ratePerKm × km)
 *   rentals   = rented equipment issued to the event (qty × rate × days) + legacy rentalCost / damageCost
 *   other     = remaining expenses ("Staff Advance" excluded)
 *   profit    = Σ invoice income (+ cancellation charge kept, Round 9) − all of the above (contribution; overhead is not allocated)
 * Cancelled / archived / deleted records are ignored (R7-3).
 */
import { asNum, asObj, asStr, Doc, nonNeg } from "../shared/coerce";
import { costTargetOf, isLiveRecord } from "../shared/costTarget";
import { round2 } from "../calc/util";
import { rentalCost, tripCost } from "../calc/round7";
import { EXPENSE_SECTION_STAFF_ADVANCE, EXPENSE_SECTION_TEMP_STAFF, invoiceIncome } from "./aggregate";

export interface BookingCostSources {
  invoices: Doc[];
  purchases: Doc[];
  expenses: Doc[];
  attendance: Doc[];
  vehicleTrips: Doc[];
  equipmentMoves: Doc[];
  outsideOrders?: Doc[];
  /** equipmentId → equipment doc (kind own | rented, rentalRate per day) */
  equipment?: Record<string, Doc>;
  /** when given, purchases / expenses / outside orders must be tagged to this booking */
  bookingId?: string;
  /** Round 9: cancellation charge kept on a cancelled order (its invoice is Cancelled, so it counts here instead) */
  cancellationCharge?: number;
}

export interface BookingCostResult {
  costActual: { food: number; labour: number; transport: number; rentals: number; other: number };
  profitActual: number;
  incomeActual: number;
}

export function bookingCost(s: BookingCostSources): BookingCostResult {
  const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
  const mine = (d: Doc) => {
    if (!isLiveRecord(d)) return false;
    if (!s.bookingId) return true;
    const t = costTargetOf(d);
    return t.type === "booking" && t.bookingId === s.bookingId;
  };
  const exp = s.expenses.filter(mine).filter((e) => asStr(e.section) !== EXPENSE_SECTION_STAFF_ADVANCE);
  const bySection = (names: string[]) => exp.filter((e) => names.includes(asStr(e.section)));
  const foodSections = ["Outside Purchase", "Live Counter"];
  const transportSections = ["Transport"];
  const outside = (s.outsideOrders ?? []).filter(mine).map((o) => round2(nonNeg(o.acceptedQty) * nonNeg(o.rate)));
  const food = sum([...s.purchases.filter(mine).map((p) => nonNeg(p.totalAmount)), ...outside, ...bySection(foodSections).map((e) => nonNeg(e.totalAmount))]);
  const labour = sum([...s.attendance.filter(isLiveRecord).map((a) => nonNeg(a.pay)), ...bySection([EXPENSE_SECTION_TEMP_STAFF]).map((e) => nonNeg(e.totalAmount))]);
  const trips = s.vehicleTrips.filter(isLiveRecord).map((t) => {
    const kmStart = nonNeg(t.kmStart);
    const kmEnd = Math.max(kmStart, nonNeg(t.kmEnd));
    return tripCost({ fuelCost: nonNeg(t.fuelCost), ratePerKm: nonNeg(t.ratePerKm), kmStart, kmEnd });
  });
  const transport = sum([...bySection(transportSections).map((e) => nonNeg(e.totalAmount)), ...trips]);
  const equipment = s.equipment ?? {};
  const rentals = sum(
    s.equipmentMoves.filter(isLiveRecord).map((m) => {
      const legacy = nonNeg(m.rentalCost) + nonNeg(m.damageCost);
      const eq = asObj(equipment[asStr(m.equipmentId)]);
      if (asStr(m.type) !== "issue" || asStr(eq.kind) !== "rented") return legacy;
      const days = Math.max(1, Math.floor(asNum(m.days, 1)));
      return legacy + rentalCost(nonNeg(m.qty), nonNeg(eq.rentalRate), days);
    }),
  );
  const known = new Set([...foodSections, ...transportSections, EXPENSE_SECTION_TEMP_STAFF]);
  const other = sum(exp.filter((e) => !known.has(asStr(e.section))).map((e) => nonNeg(e.totalAmount)));
  const incomeActual = sum([...s.invoices.map(invoiceIncome), nonNeg(s.cancellationCharge)]);
  return { costActual: { food, labour, transport, rentals, other }, incomeActual, profitActual: round2(incomeActual - food - labour - transport - rentals - other) };
}
