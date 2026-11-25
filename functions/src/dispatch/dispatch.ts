/**
 * Module 5f — packing and dispatch callables. Rules: dispatchRules.ts. Collection: dispatches (server-written).
 *  - saveDispatch { id?, bookingId, sessionId?, lines[], note? }: owner / manager — the load list; lines can be
 *    changed only while it is still being packed.
 *  - advanceDispatch { id, step, … }: the next step. Owner, the branch's managers, and staff assigned to the event
 *    (reconciling is for the owner / manager). Every step stores who did it and when.
 *  - cancelDispatch { id, reason }: owner / manager, before it has left.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqId, reqOneOf, reqString } from "../shared/validate";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { todayIST, dayOfValue } from "../shared/istDate";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { DISPATCH_STEPS, DispatchLine, DispatchStep, applyDelivery, applyLoadCheck, applyReconcile, applyReturn, canCancelDispatch, canEditLines, dispatchNumber, parseDispatchLines, stepProblem } from "./dispatchRules";

const who = (c: { uid: string; name: string }) => ({ uid: c.uid, name: c.name, at: new Date().toISOString() });

export const saveDispatch = callable("saveDispatch", ADMIN_MANAGER, async (data, caller) => {
  const id = asStr(data.id).trim();
  if (id.includes("/")) fail("invalid-argument", "id సరిగా లేదు.", "The id is not valid.");
  const bookingId = reqId(data, "bookingId");
  const sessionId = asStr(data.sessionId).includes("/") ? "" : asStr(data.sessionId).slice(0, 200);
  const parsed = parseDispatchLines(data.lines);
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const lines = (parsed as { ok: true; value: DispatchLine[] }).value;
  const note = optString(data, "note", 500) ?? "";
  const db = getFirestore();
  const c = FirestoreCollections;
  const bookingSnap = await db.collection(c.BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) fail("not-found", "ఆ బుకింగ్ దొరకలేదు.", "That booking was not found.");
  const booking = bookingSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  if (["Cancelled", "cancelled", "Closed"].includes(asStr(booking.status))) fail("failed-precondition", "రద్దయిన / ముగిసిన బుకింగ్‌కు పంపిణీ చేయలేరు.", "A cancelled or closed booking cannot have a dispatch.");
  const today = todayIST();
  const ref = id ? db.collection(c.DISPATCHES).doc(id) : db.collection(c.DISPATCHES).doc();
  const number = await db.runTransaction(async (tx) => {
    const cur = id ? ((await tx.get(ref)).data() as Doc | undefined) : undefined;
    if (id && !cur) fail("not-found", "ఆ పంపిణీ దొరకలేదు.", "That dispatch was not found.");
    if (cur && !canEditLines(asStr(cur.status))) fail("failed-precondition", "ప్యాక్ అయిన తర్వాత జాబితా మార్చలేరు.", "The list cannot be changed once it is packed.");
    if (cur) {
      tx.update(ref, { lines, note, sessionId, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });
      return asStr(cur.number);
    }
    const counter = db.collection(c.COUNTERS).doc(`dispatch-${today}`);
    const n = (Number(((await tx.get(counter)).data() ?? {}).n) || 0) + 1;
    tx.set(counter, { n, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const num = dispatchNumber(today, n);
    tx.set(ref, {
      number: num, status: "packing", bookingId, sessionId, branchId: asStr(booking.branchId), brandId: asStr(booking.brandId), customerName: asStr(booking.customerNameSnapshot), eventDay: dayOfValue(booking.eventDate) ?? "", venue: asStr(booking.venue) || asStr(booking.venueName),
      assignedStaffIds: asArr(booking.assignedStaffIds).map(String).slice(0, 100), lines, note, loadNote: "", vehicleName: "", driverName: "", receiverName: "", receiverPhone: "", shortages: [], steps: {},
      createdBy: caller.uid, createdByName: caller.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid,
    });
    return num;
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: id ? "updateDispatch" : "createDispatch", collection: c.DISPATCHES, docId: ref.id, before: {}, after: { bookingId, lines: lines.length } });
  return { ok: true, id: ref.id, number };
});

export const advanceDispatch = callable("advanceDispatch", ALL_ROLES, async (data, caller) => {
  const id = reqId(data, "id");
  const step = reqOneOf(data, "step", DISPATCH_STEPS) as DispatchStep;
  const note = optString(data, "note", 500) ?? "";
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.DISPATCHES).doc(id);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "ఆ పంపిణీ దొరకలేదు.", "That dispatch was not found.");
    const d = snap.data() as Doc;
    if (caller.role === "staff") {
      if (!caller.staffId || !asArr(d.assignedStaffIds).map(String).includes(caller.staffId)) fail("permission-denied", "ఈ కార్యక్రమానికి మిమ్మల్ని కేటాయించలేదు.", "You are not assigned to this event.");
      if (step === "reconciled") fail("permission-denied", "లెక్క సరిపోల్చడం మేనేజర్ / యజమాని చేయాలి.", "Reconciling is done by a manager or the owner.");
    } else assertAdminOrOwnBranch(caller, asStr(d.branchId));
    const problem = stepProblem(asStr(d.status), step);
    if (problem === "closed") fail("failed-precondition", "ఈ పంపిణీ ముగిసింది / రద్దయింది.", "This dispatch is finished or cancelled.");
    if (problem === "wrong-order") fail("failed-precondition", "ముందు దశ పూర్తి కాలేదు.", "The step before this one is not done yet.");
    let lines = asArr(d.lines) as unknown as DispatchLine[];
    const update: Doc = { status: step, [`steps.${step}`]: { ...who(caller), note }, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid };
    if (step === "loaded") {
      const r = applyLoadCheck(lines, asObj(data.loaded), note);
      if (!r.ok) fail("invalid-argument", r.te, r.en);
      lines = (r as { ok: true; value: { lines: DispatchLine[] } }).value.lines;
      const vehicleName = reqString(data, "vehicleName", 80);
      update.vehicleName = vehicleName;
      update.driverName = optString(data, "driverName", 80) ?? "";
      update.loadNote = note;
    } else if (step === "delivered") {
      const r = applyDelivery(lines, asObj(data.delivered));
      if (!r.ok) fail("invalid-argument", r.te, r.en);
      lines = (r as { ok: true; value: DispatchLine[] }).value;
      update.receiverName = reqString(data, "receiverName", 80);
      update.receiverPhone = optString(data, "receiverPhone", 15) ?? "";
    } else if (step === "returned") {
      const r = applyReturn(lines, asObj(data.returned));
      if (!r.ok) fail("invalid-argument", r.te, r.en);
      lines = (r as { ok: true; value: DispatchLine[] }).value;
    } else if (step === "reconciled") {
      const r = applyReconcile(lines, asObj(data.reasons));
      if (!r.ok) fail("invalid-argument", r.te, r.en);
      const v = (r as { ok: true; value: { lines: DispatchLine[]; shortages: unknown[] } }).value;
      lines = v.lines;
      update.shortages = v.shortages;
      if (v.shortages.length) {
        tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`dispatchShort_${id}`), {
          kind: "dispatchShortage", audienceRoles: ["admin", "manager"], recipientUids: [], branchId: asStr(d.branchId),
          title: { te: `${asStr(d.number)}: ${v.shortages.length} వస్తువులు తిరిగి రాలేదు — ${asStr(d.customerName)}`, en: `${asStr(d.number)}: ${v.shortages.length} lines did not come back — ${asStr(d.customerName)}` },
          link: "/dispatch", readBy: [], createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    update.lines = lines;
    tx.update(ref, update);
    return { number: asStr(d.number), shortages: Array.isArray(update.shortages) ? (update.shortages as unknown[]).length : 0 };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "advanceDispatch", collection: FirestoreCollections.DISPATCHES, docId: id, before: {}, after: { step, note } });
  return { ok: true, status: step, ...out };
});

export const cancelDispatch = callable("cancelDispatch", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.DISPATCHES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "ఆ పంపిణీ దొరకలేదు.", "That dispatch was not found.");
  const d = snap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(d.branchId));
  if (!canCancelDispatch(asStr(d.status))) fail("failed-precondition", "వాహనం బయలుదేరిన తర్వాత రద్దు చేయలేరు.", "It cannot be cancelled after the vehicle has left.");
  await ref.update({ status: "cancelled", cancelReason: reason, cancelledBy: { uid: caller.uid, name: caller.name }, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "cancelDispatch", collection: FirestoreCollections.DISPATCHES, docId: id, before: { status: asStr(d.status) }, after: { status: "cancelled", reason } });
  return { ok: true };
});
