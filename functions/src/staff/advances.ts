/**
 * R10-1 staff advances: addStaffAdvance (A/M own branch), listStaffAdvances (A/M; staff their own),
 * finalizePayroll { month } (A) — books the month's advance recoveries on the payslips (payroll/{month}_{staffId}).
 * Cancel: cancelRecord { collection: "staffAdvances" } (refused once anything was recovered).
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertOpenDay } from "../ledger/lockGuard";
import { callable, ADMIN, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqId, reqMonth, reqNum } from "../shared/validate";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { addDays, isValidDay, isValidMonth, monthOf, todayIST } from "../shared/istDate";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { formatRupees } from "../shared/templates";
import { advanceBalances, nextMonth } from "../calc/round10";
import { round2 } from "../calc/util";
import { readAdvance } from "./advanceRules";
import { callerSees } from "../roles/callablePerms";
import { computePayrollRows, payrollDocId } from "./attendance";

export const addStaffAdvance = callable("addStaffAdvance", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const staffId = reqId(data, "staffId");
  const amount = round2(reqNum(data, "amount", { min: 0.01, max: 10_000_000 }));
  const today = todayIST();
  const date = data.date === undefined || data.date === null || data.date === "" ? today : String(data.date);
  if (!isValidDay(date)) fail("invalid-argument", "తేదీ YYYY-MM-DD రూపంలో ఉండాలి.", "date must be YYYY-MM-DD.");
  await assertOpenDay(date); // Module 4c: period lock
  if (date > addDays(today, 1)) fail("invalid-argument", "భవిష్యత్తు తేదీతో అడ్వాన్స్ నమోదు చేయలేము.", "An advance cannot be dated in the future.");
  const recoverMonth = data.recoverMonth === undefined || data.recoverMonth === null || data.recoverMonth === "" ? nextMonth(monthOf(date)) : String(data.recoverMonth);
  if (!isValidMonth(recoverMonth) || recoverMonth < monthOf(date)) fail("invalid-argument", "కోత నెల అడ్వాన్స్ నెల లేదా తర్వాత ఉండాలి.", "recoverMonth must be the advance month or later.");
  const note = (optString(data, "note", 500) ?? "").trim();
  const staffSnap = await db.collection(c.STAFF).doc(staffId).get();
  if (!staffSnap.exists) fail("not-found", "Staff దొరకలేదు.", "Staff member not found.");
  const staff = staffSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(staff.branchId));
  const ref = db.collection(c.STAFF_ADVANCES).doc();
  await ref.set({
    staffId,
    staffName: asStr(staff.name),
    amount,
    date,
    note,
    recoverMonth,
    status: "Open",
    recovered: 0,
    recoveries: [],
    recoveryMonths: [],
    branchId: asStr(staff.branchId) || caller.branchId,
    createdBy: caller.uid,
    createdByName: caller.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "addStaffAdvance", collection: c.STAFF_ADVANCES, docId: ref.id, after: { staffId, amount, date, recoverMonth } });
  return { id: ref.id, status: "Open", recoverMonth, text: { te: `${asStr(staff.name)} కి ${formatRupees(amount)} అడ్వాన్స్ — ${recoverMonth} జీతంలో కోత`, en: `${formatRupees(amount)} advance to ${asStr(staff.name)} — recovered from ${recoverMonth} pay` } };
});

/** listStaffAdvances { staffId } → advances with recovered / balance, and the total balance. */
export const listStaffAdvances = callable("listStaffAdvances", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const staffId = reqId(data, "staffId");
  const staffSnap = await db.collection(FirestoreCollections.STAFF).doc(staffId).get();
  if (!staffSnap.exists) fail("not-found", "Staff దొరకలేదు.", "Staff member not found.");
  const staff = staffSnap.data() as Doc;
  if (caller.role === "staff") {
    if (caller.staffId !== staffId) fail("permission-denied", "మీ అడ్వాన్స్‌లు మాత్రమే చూడగలరు.", "Staff can only see their own advances.");
  } else {
    assertAdminOrOwnBranch(caller, asStr(staff.branchId));
    // Module 4d (B4): pay figures are for the owner, the Finance Head and the HR Manager
    if (!callerSees(caller.role, caller.jobRole, "salary")) fail("permission-denied", "మీ పని పాత్రకు జీతం / అడ్వాన్స్ వివరాలు చూసే అనుమతి లేదు.", "Your job role cannot see pay and advance details.");
  }
  const snap = await db.collection(FirestoreCollections.STAFF_ADVANCES).where("staffId", "==", staffId).get();
  const docs = snap.docs.map((d) => ({ id: d.id, d: d.data() as Doc }));
  const parsed = docs.map((x) => readAdvance(x.id, x.d));
  const bal = advanceBalances(parsed);
  const rows = docs
    .map((x, i) => ({ id: x.id, amount: parsed[i].amount, date: parsed[i].date, note: asStr(x.d.note), recoverMonth: parsed[i].recoverMonth, status: parsed[i].status === "legacy" ? "Old" : parsed[i].status, recovered: bal[i].recovered, balance: bal[i].balance, recoveries: asArr(x.d.recoveries) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { advances: rows, balance: round2(bal.reduce((a, b) => a + b.balance, 0)) };
});

/**
 * finalizePayroll { month } (A): writes each payslip (payroll/{month}_{staffId}: gross, cut, ot, advances, net,
 * advanceTakes) and books the recoveries on the advances (recoveries[month] replaced → safe to run again);
 * fully recovered advances become Recovered with the payslip id. A typed (manual) net on the payslip is kept.
 */
export const finalizePayroll = callable("finalizePayroll", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const month = reqMonth(data, "month");
  await assertOpenDay(`${month}-01`); // Module 4c: a locked month's payroll cannot be run again
  const rows = await computePayrollRows(month);
  let advancesTouched = 0;
  for (const r of rows) {
    const payRef = db.collection(c.PAYROLL).doc(payrollDocId(month, r.staffId));
    const takes = r.advanceTakes;
    await db.runTransaction(async (tx) => {
      const pay = await tx.get(payRef);
      const advSnaps = takes.length ? await tx.getAll(...takes.map((t) => db.collection(c.STAFF_ADVANCES).doc(t.id))) : [];
      const manual = (pay.data() as Doc | undefined)?.calcMode === "manual";
      tx.set(
        payRef,
        {
          month,
          staffId: r.staffId,
          staffName: r.name,
          gross: r.gross,
          cut: r.cut,
          ot: r.ot,
          advances: r.advances,
          advanceTakes: takes,
          advanceCarry: r.advanceCarry,
          ...(manual ? { autoValue: r.net } : { net: r.net, calcMode: "auto", autoValue: r.net }),
          finalized: true,
          finalizedAt: FieldValue.serverTimestamp(),
          finalizedBy: { uid: caller.uid, name: caller.name },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      for (const s of advSnaps) {
        if (!s.exists) continue;
        const a = s.data() as Doc;
        const t = takes.find((x) => x.id === s.id)!;
        if (asStr(a.status) !== "Open" && asStr(a.status) !== "Recovered") continue; // legacy / cancelled: nothing booked
        const others = asArr(a.recoveries).map(asObj).filter((x) => asStr(x.month) !== month);
        const recoveries = t.take > 0 ? [...others, { month, amount: t.take, payslipId: payRef.id }] : others;
        const recovered = round2(recoveries.reduce((s2, x) => s2 + Math.max(0, Number(x.amount) || 0), 0));
        const done = recovered >= round2(Number(a.amount) || 0) - 0.005;
        tx.update(s.ref, {
          recoveries,
          recovered,
          recoveryMonths: [...new Set(recoveries.map((x) => asStr(x.month)))],
          status: done ? "Recovered" : "Open",
          ...(done ? { recoveredPayslipId: payRef.id, recoveredMonth: month } : {}),
          updatedBy: caller.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        advancesTouched++;
      }
    });
  }
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "finalizePayroll", collection: c.PAYROLL, docId: month, after: { rows: rows.length, advancesTouched } });
  return { month, payslips: rows.length, advancesTouched };
});
