/**
 * R10-2 shifts, tasks, ratings:
 *   saveShift { id?, bookingId, sessionId?, staffId, role, date, startTime, endTime, note? } (A/M own branch)
 *   completeTask { taskId, done?, note? } (staff: own tasks; A/M own branch)
 *   rateStaff { staffId, bookingId, stars 1–5, note? } (A/M own branch) → staff/{id}.ratings[YYYY-MM] { avg, count }
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, Timestamp, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { callable, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optId, optString, reqDay, reqId, reqNum, reqOneOf, reqString } from "../shared/validate";
import { asNum, asStr, Doc } from "../shared/coerce";
import { dayOfValue, istAt, monthOf, todayIST, toDateValue } from "../shared/istDate";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { isLiveRecord } from "../shared/costTarget";
import { overlaps, ratingAverage, shiftHours, SHIFT_ROLES } from "../calc/round10";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const SHIFT_ROLE_TE: Record<string, string> = { cook: "వంట మనిషి", helper: "హెల్పర్", server: "సర్వర్", driver: "డ్రైవర్", supervisor: "సూపర్‌వైజర్" };

export const saveShift = callable("saveShift", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const id = optId(data, "id");
  const bookingId = reqId(data, "bookingId");
  const sessionId = (optString(data, "sessionId", 100) ?? "").trim();
  const staffId = reqId(data, "staffId");
  const role = reqOneOf(data, "role", SHIFT_ROLES);
  const date = reqDay(data, "date");
  const startTime = reqString(data, "startTime", 5);
  const endTime = reqString(data, "endTime", 5);
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) fail("invalid-argument", "సమయం HH:mm రూపంలో ఉండాలి.", "Times must be HH:mm.");
  const start = istAt(date, startTime);
  const end = istAt(date, endTime);
  let hours: number;
  try {
    hours = shiftHours(start.getTime(), end.getTime());
  } catch {
    fail("invalid-argument", "ముగింపు సమయం మొదలు తర్వాత ఉండాలి (16 గంటల లోపు).", "End must be after start (at most 16 hours).");
  }
  const [bSnap, sSnap, others] = await Promise.all([
    db.collection(c.BOOKINGS).doc(bookingId).get(),
    db.collection(c.STAFF).doc(staffId).get(),
    db.collection(c.SHIFTS).where("staffId", "==", staffId).where("date", "==", date).get(),
  ]);
  if (!bSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  if (!sSnap.exists) fail("not-found", "Staff దొరకలేదు.", "Staff member not found.");
  const b = bSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(b.branchId));
  if (b.closed || ["Cancelled", "Closed"].includes(asStr(b.status))) fail("failed-precondition", "రద్దైన / close అయిన event కి shift వేయలేము.", "Cannot add a shift to a cancelled or closed event.");
  const clash = overlaps(
    { start: start.getTime(), end: end.getTime() },
    others.docs.filter((d) => d.id !== id && isLiveRecord(d.data() as Doc)).map((d) => ({ id: d.id, start: toDateValue(d.data().start)?.getTime() ?? 0, end: toDateValue(d.data().end)?.getTime() ?? 0 })),
  );
  if (clash.length) {
    throw new HttpsError("failed-precondition", "This staff member already has a shift at that time.", { te: `${asStr((sSnap.data() as Doc).name)} కి ఆ సమయంలో ఇప్పటికే shift ఉంది.`, en: "This staff member already has a shift at that time.", clashWith: clash });
  }
  const ref = id ? db.collection(c.SHIFTS).doc(id) : db.collection(c.SHIFTS).doc();
  if (id) {
    const ex = await ref.get();
    if (!ex.exists) fail("not-found", "ఆ shift దొరకలేదు.", "Shift not found.");
  }
  const fields = {
    bookingId,
    sessionId,
    staffId,
    staffName: asStr((sSnap.data() as Doc).name),
    role,
    roleTe: SHIFT_ROLE_TE[role],
    date,
    startTime,
    endTime,
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
    hours: hours!,
    note: (optString(data, "note", 500) ?? "").trim(),
    branchId: asStr(b.branchId),
    customerNameSnapshot: asStr(b.customerNameSnapshot),
    status: "Planned",
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (id) await ref.update(fields);
  else await ref.set({ ...fields, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() });
  // the person on a shift is assigned to the booking (staff read access, reminders)
  await bSnap.ref.update({ assignedStaffIds: FieldValue.arrayUnion(staffId), updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() });
  return { id: ref.id, hours: hours! };
});

export const completeTask = callable("completeTask", ALL_ROLES, async (data, caller) => {
  const db = getFirestore();
  const taskId = reqId(data, "taskId");
  const done = data.done !== false;
  const note = optString(data, "note", 1000);
  const ref = db.collection(FirestoreCollections.TASKS).doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "ఆ పని దొరకలేదు.", "Task not found.");
  const t = snap.data() as Doc;
  if (!isLiveRecord(t)) fail("failed-precondition", "ఈ పని రద్దు అయింది.", "This task is cancelled.");
  if (caller.role === "staff") {
    const mine = (caller.staffId && asStr(t.assigneeStaffId) === caller.staffId) || asStr(t.assigneeUid) === caller.uid;
    if (!mine) fail("permission-denied", "మీకు ఇచ్చిన పనులు మాత్రమే పూర్తి చేయగలరు.", "Staff can only complete their own tasks.");
  } else assertAdminOrOwnBranch(caller, asStr(t.branchId));
  await ref.update({
    status: done ? "Done" : "Open",
    doneAt: done ? FieldValue.serverTimestamp() : null,
    doneBy: done ? { uid: caller.uid, name: caller.name } : null,
    ...(note !== undefined ? { staffNote: note } : {}),
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, status: done ? "Done" : "Open" };
});

export const rateStaff = callable("rateStaff", ADMIN_MANAGER, async (data, caller) => {
  const db = getFirestore();
  const c = FirestoreCollections;
  const staffId = reqId(data, "staffId");
  const bookingId = reqId(data, "bookingId");
  const stars = reqNum(data, "stars", { min: 1, max: 5 });
  if (!Number.isInteger(stars)) fail("invalid-argument", "నక్షత్రాలు 1 నుండి 5 వరకు పూర్ణ సంఖ్య.", "stars must be a whole number 1–5.");
  const note = (optString(data, "note", 1000) ?? "").trim();
  const [sSnap, bSnap] = await Promise.all([db.collection(c.STAFF).doc(staffId).get(), db.collection(c.BOOKINGS).doc(bookingId).get()]);
  if (!sSnap.exists) fail("not-found", "Staff దొరకలేదు.", "Staff member not found.");
  if (!bSnap.exists) fail("not-found", "Booking దొరకలేదు.", "Booking not found.");
  const b = bSnap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr((sSnap.data() as Doc).branchId) || asStr(b.branchId));
  const day = dayOfValue(b.eventDate) ?? todayIST();
  const ref = db.collection(c.STAFF_RATINGS).doc(`${bookingId}_${staffId}`);
  const existed = (await ref.get()).exists;
  await ref.set(
    {
      staffId,
      staffName: asStr((sSnap.data() as Doc).name),
      bookingId,
      customerNameSnapshot: asStr(b.customerNameSnapshot),
      day,
      month: monthOf(day),
      stars,
      note,
      by: { uid: caller.uid, name: caller.name, role: caller.role },
      branchId: asStr((sSnap.data() as Doc).branchId) || asStr(b.branchId),
      status: "Active",
      updatedBy: caller.uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existed ? {} : { createdBy: caller.uid, createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  return { id: ref.id, stars };
});

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** staff/{id}.ratings[YYYY-MM] = { avg, count } and ratingLatest — recomputed (not incremented). */
export const ratingOnWrite = onDocumentWritten({ document: "staffRatings/{ratingId}", region: REGION }, async (event: WriteEvent) => {
  const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  const keys = new Set<string>();
  for (const d of [before, after]) if (d && asStr(d.staffId) && asStr(d.month)) keys.add(`${asStr(d.staffId)}|${asStr(d.month)}`);
  const db = getFirestore();
  for (const k of keys) {
    const [staffId, month] = k.split("|");
    const snap = await db.collection(FirestoreCollections.STAFF_RATINGS).where("staffId", "==", staffId).where("month", "==", month).get();
    const stars = snap.docs.map((d) => d.data() as Doc).filter(isLiveRecord).map((d) => asNum(d.stars)).filter((s) => Number.isInteger(s) && s >= 1 && s <= 5);
    const r = ratingAverage(stars);
    const staffRef = db.collection(FirestoreCollections.STAFF).doc(staffId);
    if (!(await staffRef.get()).exists) continue;
    await staffRef.update({ [`ratings.${month}`]: r, updatedBy: "system" });
  }
});
