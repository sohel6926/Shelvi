import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, reqDay, reqId, reqMonth, reqNum, reqOneOf } from "../shared/validate";
import { asBool, asNum, asStr, Doc } from "../shared/coerce";
import { addDays, daysInMonth, todayIST } from "../shared/istDate";
import { loadSettings, MonthlyPayRules } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { dayPay } from "../calc/wages";
import { round2 } from "../calc/util";
import { AttendanceStatus, dailyStaffPay, monthlyStaffPay, PayrollRow } from "../calc/ops";
import { auditOverride, autoFields, manualFields, readManual } from "../shared/override";
import { canOverride } from "../shared/overridePolicy";
import { advanceRecovery, AdvanceTake } from "../calc/round10";
import { readAdvance } from "./advanceRules";
import { movePayOutAll, readPay, readPayMany } from "./pay";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "half", "absent", "leave"];

/** Hours that count for pay: absent / leave = 0. */
export function paidHours(status: AttendanceStatus, hours: number): number {
  return status === "absent" || status === "leave" ? 0 : hours;
}

export function payTypeOf(staff: Doc): "daily" | "monthly" {
  return asStr(staff.payType) === "monthly" ? "monthly" : "daily";
}

export const markAttendance = callable("markAttendance", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const staffId = reqId(data, "staffId");
  const date = reqDay(data, "date");
  const hours = reqNum(data, "hours", { min: 0, max: 24 });
  const status = reqOneOf(data, "status", ATTENDANCE_STATUSES);
  const bookingId = optId(data, "bookingId");
  const shiftId = optId(data, "shiftId"); // R10-2: attendance links to the shift it was for
  if (date > addDays(todayIST(), 1)) fail("invalid-argument", "భవిష్యత్తు తేదీకి attendance వేయలేము.", "Attendance date cannot be in the future.");

  const staffSnap = await db.collection(FirestoreCollections.STAFF).doc(staffId).get();
  if (!staffSnap.exists) fail("not-found", "Staff దొరకలేదు.", "Staff member not found.");
  const staff = staffSnap.data() as Doc;
  if (caller.role === "staff") {
    if (caller.staffId !== staffId && asStr(staff.linkedUserId) !== caller.uid) {
      fail("permission-denied", "మీ attendance మాత్రమే వేయగలరు.", "Staff can only mark their own attendance.");
    }
  } else {
    assertAdminOrOwnBranch(caller, asStr(staff.branchId));
  }
  const payType = payTypeOf(staff);
  const autoPay = payType === "daily" ? dayPay((await readPay(db, staffId, staff)).dailyWage, paidHours(status, hours)) : 0;
  const settings = await loadSettings();
  const mayOverride = canOverride(caller.role, settings.managerCanOverride);
  // Staff can never override (readManual rejects a manual value from them); without one the automatic pay is saved.
  const manual = readManual(data.manual, ["pay"], caller, settings, "attendancePay");

  const ref = db.collection(FirestoreCollections.ATTENDANCE).doc(`${staffId}_${date}`);
  const existing = await ref.get();
  const prev = existing.data() as Doc | undefined;
  // A person who may not override never erases an existing manual pay.
  const keepManual = !manual && !mayOverride && prev?.calcMode === "manual";
  const pay = manual ? manual.values.pay : keepManual ? asNum(prev?.pay) : autoPay;
  const modeFields = manual ? manualFields(caller, autoPay, manual.reason) : keepManual ? { autoValue: autoPay } : autoFields(autoPay);
  await ref.set(
    {
      staffId,
      staffName: asStr(staff.name),
      date,
      hours,
      status,
      bookingId: bookingId ?? "",
      ...(shiftId ? { shiftId } : {}),
      payType,
      pay,
      ...modeFields,
      recordedBy: caller.uid,
      updatedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { branchId: asStr(staff.branchId) || caller.branchId, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  if (manual) await auditOverride(caller, "markAttendance:manualPay", FirestoreCollections.ATTENDANCE, ref.id, autoPay, pay, manual.reason);
  return { pay, calcMode: manual || keepManual ? "manual" : "auto", autoValue: autoPay };
});

/** settings/business.monthlyPayRules (calc MonthlyPayRules shape), owner default when missing. */
export async function loadMonthlyPayRules(): Promise<MonthlyPayRules> {
  return (await loadSettings()).monthlyPayRules;
}

export type PayrollRowOut = PayrollRow & {
  staffId: string;
  name: string;
  payType: "daily" | "monthly";
  /** R10-1: advances recovered from this pay ("అడ్వాన్స్ కోత"), per advance; what is left carries to next month */
  advanceTakes: AdvanceTake[];
  advanceCarry: number;
};

/**
 * Automatic payroll rows for a month (§7 / §7b); manual attendance pay days count as typed. R10-1: open advances due
 * this month are deducted, capped at the pay (§20); the rest carries to next month.
 */
export async function computePayrollRows(month: string): Promise<PayrollRowOut[]> {
  const db = getFirestore();
  const c = FirestoreCollections;
  const first = `${month}-01`;
  const next = addDays(`${month}-${String(daysInMonth(month)).padStart(2, "0")}`, 1);
  const [staffSnap, attSnap, legacySnap, openSnap, doneSnap, rules] = await Promise.all([
    db.collection(c.STAFF).get(),
    db.collection(c.ATTENDANCE).where("date", ">=", first).where("date", "<", next).get(),
    db.collection(c.STAFF_ADVANCES).where("date", ">=", first).where("date", "<", next).get(),
    db.collection(c.STAFF_ADVANCES).where("status", "==", "Open").get(),
    db.collection(c.STAFF_ADVANCES).where("recoveryMonths", "array-contains", month).get(),
    loadMonthlyPayRules(),
  ]);
  const att = new Map<string, Doc[]>();
  attSnap.docs.forEach((d) => {
    const a = d.data() as Doc;
    const k = asStr(a.staffId);
    att.set(k, [...(att.get(k) ?? []), a]);
  });
  const adv = new Map<string, ReturnType<typeof readAdvance>[]>();
  const seen = new Set<string>();
  for (const d of [...legacySnap.docs, ...openSnap.docs, ...doneSnap.docs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const a = d.data() as Doc;
    const k = asStr(a.staffId);
    adv.set(k, [...(adv.get(k) ?? []), readAdvance(d.id, a)]);
  }
  // Module 4d: pay figures are in staff/{id}/private/pay; documents that still carry them are moved now (old data)
  const staffList = staffSnap.docs.map((s) => ({ id: s.id, data: s.data() as Doc }));
  const pay = await readPayMany(db, staffList);
  await movePayOutAll(db, staffList);
  const rows: PayrollRowOut[] = [];
  for (const s of staffSnap.docs) {
    const staff = s.data() as Doc;
    const days = att.get(s.id) ?? [];
    const advList = adv.get(s.id) ?? [];
    if (!asBool(staff.active, true) && !days.length && !advList.length) continue;
    const payType = payTypeOf(staff);
    const recs = days.map((a) => {
      const st = (ATTENDANCE_STATUSES as string[]).includes(asStr(a.status)) ? (asStr(a.status) as AttendanceStatus) : "present";
      return { status: st, hours: paidHours(st, Math.min(24, Math.max(0, asNum(a.hours)))), manualPay: a.calcMode === "manual" ? Math.max(0, asNum(a.pay)) : null };
    });
    const before = payType === "monthly" ? monthlyStaffPay(pay.get(s.id)?.monthlySalary ?? 0, daysInMonth(month), recs, 0, rules) : dailyStaffPay(pay.get(s.id)?.dailyWage ?? 0, recs, 0);
    const r = advanceRecovery(before.net, advList, month);
    rows.push({ staffId: s.id, name: asStr(staff.name), payType, ...before, advances: r.cut, net: round2(before.net - r.cut), advanceTakes: r.takes, advanceCarry: r.carry });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function payrollDocId(month: string, staffId: string): string {
  return `${month}_${staffId}`;
}

/** Rows with any manual net (payroll/{month}_{staffId}) applied; every row says calcMode / autoValue. */
/** Module 4e: what the stored payslip says about being finalized and paid. */
function slipInfo(o: Doc | undefined): { finalized: boolean; finalNet: number; paid: number } {
  return { finalized: o?.finalized === true, finalNet: o?.finalized === true ? asNum(o.net) : 0, paid: Math.max(0, asNum(o?.paidTotal)) };
}

export const monthPayroll = callable("monthPayroll", ADMIN, async (data) => {
  const db = getFirestore();
  const month = reqMonth(data, "month");
  const rows = await computePayrollRows(month);
  const overrides = rows.length ? await db.getAll(...rows.map((r) => db.collection(FirestoreCollections.PAYROLL).doc(payrollDocId(month, r.staffId)))) : [];
  return {
    rows: rows.map((r, i) => {
      const o = overrides[i]?.data() as Doc | undefined;
      if (o?.calcMode === "manual") {
        return { ...r, ...slipInfo(o), net: asNum(o.net), calcMode: "manual", autoValue: r.net, overriddenBy: o.overriddenBy ?? null, overrideReason: asStr(o.overrideReason) };
      }
      return { ...r, ...slipInfo(o), calcMode: "auto", autoValue: r.net, overriddenBy: null, overrideReason: "" };
    }),
  };
});

/** overridePayrollRow { month, staffId, net, reason } (admin); { month, staffId, auto: true } switches back. */
export const overridePayrollRow = callable("overridePayrollRow", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const month = reqMonth(data, "month");
  const staffId = reqId(data, "staffId");
  const backToAuto = data.auto === true;
  const settings = await loadSettings();
  const manual = backToAuto ? null : readManual({ net: data.net, reason: data.reason }, ["net"], caller, settings, "payroll");
  if (!backToAuto && !manual) fail("invalid-argument", "నికర జీతం, కారణం ఇవ్వండి.", "net and reason are required.");
  const row = (await computePayrollRows(month)).find((r) => r.staffId === staffId);
  if (!row) fail("not-found", "ఈ నెల payroll లో ఈ staff లేరు.", "This staff member has no payroll row for the month.");
  const ref = db.collection(FirestoreCollections.PAYROLL).doc(payrollDocId(month, staffId));
  const net = manual ? manual.values.net : row.net;
  await ref.set({ month, staffId, staffName: row.name, net, ...(manual ? manualFields(caller, row.net, manual.reason) : autoFields(row.net)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auditOverride(caller, backToAuto ? "overridePayrollRow:auto" : "overridePayrollRow", FirestoreCollections.PAYROLL, ref.id, row.net, net, manual?.reason ?? "switch to automatic");
  return { net, calcMode: manual ? "manual" : "auto", autoValue: row.net };
});
