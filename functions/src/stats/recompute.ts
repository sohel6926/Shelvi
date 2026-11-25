import { getFirestore, FieldValue, Timestamp, Query } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { FirestoreCollections } from "../shared/firestorePaths";
import { Doc, asNum, asBool } from "../shared/coerce";
import { dayRange, daysInMonth, monthOf, monthRange, addDays } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { round2 } from "../calc/util";
import { readPayMany } from "../staff/pay";
import { aggregateStats, PeriodStats } from "./aggregate";

async function docs(q: Query): Promise<Doc[]> {
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as Doc);
}

function tsRange(q: Query, field: string, start: Date, end: Date): Query {
  return q.where(field, ">=", Timestamp.fromDate(start)).where(field, "<", Timestamp.fromDate(end));
}

/** Monthly-salary staff cost for a whole month (active staff with payType "monthly"). */
async function monthlySalaryTotal(): Promise<number> {
  const db = getFirestore();
  const snap = await db.collection(FirestoreCollections.STAFF).where("payType", "==", "monthly").get();
  const staff = snap.docs.map((d) => ({ id: d.id, data: d.data() as Doc })).filter((s) => asBool(s.data.active, true));
  const pay = await readPayMany(db, staff); // Module 4d: salaries are in staff/{id}/private/pay
  return round2(staff.reduce((a, s) => a + (pay.get(s.id)?.monthlySalary ?? 0), 0));
}

async function loadPeriod(start: Date, end: Date, startDay: string, endDayExcl: string, monthlySalaries: number, fixedCosts: number | null): Promise<PeriodStats> {
  const db = getFirestore();
  const c = FirestoreCollections;
  let payments: Doc[] = [];
  try {
    // Needs a collection-group index on payments.date (see docs/backend-notes.md).
    payments = await docs(tsRange(db.collectionGroup(c.PAYMENTS), "date", start, end));
  } catch (e) {
    logger.warn("payments collection-group query failed (index missing?) — collected left at 0", e);
  }
  const [invoices, purchases, expenses, adSpend, attendance, eventBookings, newBookings, outsideOrders, cancelledBookings] = await Promise.all([
    docs(tsRange(db.collection(c.INVOICES), "issueDate", start, end)),
    docs(tsRange(db.collection(c.PURCHASES), "purchaseDate", start, end)),
    docs(tsRange(db.collection(c.EXPENSES), "serviceDate", start, end)),
    docs(db.collection(c.AD_SPEND).where("date", ">=", startDay).where("date", "<", endDayExcl)),
    docs(db.collection(c.ATTENDANCE).where("date", ">=", startDay).where("date", "<", endDayExcl)),
    docs(tsRange(db.collection(c.BOOKINGS), "eventDate", start, end)),
    docs(tsRange(db.collection(c.BOOKINGS), "createdAt", start, end)),
    docs(db.collection(c.OUTSIDE_ORDERS).where("date", ">=", startDay).where("date", "<", endDayExcl)),
    docs(tsRange(db.collection(c.BOOKINGS), "cancelledAt", start, end)),
  ]);
  return aggregateStats({ invoices, payments, purchases, expenses, adSpend, attendance, eventBookings, newBookings, monthlySalaries, fixedCosts, outsideOrders, cancelledBookings });
}

export async function recomputeDay(day: string): Promise<PeriodStats> {
  const { start, end } = dayRange(day);
  const month = monthOf(day);
  const salaries = round2((await monthlySalaryTotal()) / daysInMonth(month));
  const stats = await loadPeriod(start, end, day, addDays(day, 1), salaries, null);
  await getFirestore()
    .collection(FirestoreCollections.DAILY_STATS)
    .doc(day)
    .set({ ...stats, date: day, month, updatedAt: FieldValue.serverTimestamp() });
  return stats;
}

export async function recomputeMonth(month: string): Promise<PeriodStats> {
  const { start, end } = monthRange(month);
  const settings = await loadSettings();
  const salaries = await monthlySalaryTotal();
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const stats = await loadPeriod(start, end, `${month}-01`, addDays(lastDay, 1), salaries, settings.fixedMonthlyCosts);
  await getFirestore()
    .collection(FirestoreCollections.MONTHLY_STATS)
    .doc(month)
    .set({ ...stats, month, updatedAt: FieldValue.serverTimestamp() });
  return stats;
}

/** Recomputes each affected day and each affected month once. */
export async function recomputeDays(days: Iterable<string>): Promise<void> {
  const uniqueDays = [...new Set(days)];
  const months = [...new Set(uniqueDays.map(monthOf))];
  for (const d of uniqueDays) await recomputeDay(d);
  for (const m of months) await recomputeMonth(m);
}
