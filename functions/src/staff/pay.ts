/**
 * Module 4d step 5 — reading and moving pay figures (see payRules.ts for the why).
 *  - readPay / readPayMany: what payroll, attendance and the statistics use.
 *  - movePayOut + the staffPayMover trigger: any pay figure written on staff/{id} is moved to
 *    staff/{id}/private/pay and removed from the staff document, within moments of the write.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, Firestore, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { Doc } from "../shared/coerce";
import { PAY_FIELDS, StaffPay, hasPayFields, payOf, payToMove } from "./payRules";

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

export const payRef = (db: Firestore, staffId: string) => db.collection(FirestoreCollections.STAFF).doc(staffId).collection("private").doc("pay");

export async function readPay(db: Firestore, staffId: string, staff: Doc): Promise<StaffPay> {
  const snap = await payRef(db, staffId).get();
  return payOf(staff, snap.exists ? (snap.data() as Doc) : undefined);
}

/** Pay of many people in one round trip. */
export async function readPayMany(db: Firestore, staff: { id: string; data: Doc }[]): Promise<Map<string, StaffPay>> {
  const out = new Map<string, StaffPay>();
  if (!staff.length) return out;
  const snaps = await db.getAll(...staff.map((s) => payRef(db, s.id)));
  staff.forEach((s, i) => out.set(s.id, payOf(s.data, snaps[i].exists ? (snaps[i].data() as Doc) : undefined)));
  return out;
}

/** Moves the figures off one staff document. Safe to run twice. */
export async function movePayOut(db: Firestore, staffId: string, staff: Doc): Promise<boolean> {
  if (!hasPayFields(staff)) return false;
  const batch = db.batch();
  batch.set(payRef(db, staffId), { ...payToMove(staff), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const strip: Record<string, unknown> = {};
  for (const f of PAY_FIELDS) if (f in staff) strip[f] = FieldValue.delete();
  batch.update(db.collection(FirestoreCollections.STAFF).doc(staffId), strip);
  await batch.commit();
  return true;
}

/** Moves the figures of every staff document that still carries them (old data). Best effort. */
export async function movePayOutAll(db: Firestore, staff: { id: string; data: Doc }[]): Promise<number> {
  let moved = 0;
  for (const s of staff) if (await movePayOut(db, s.id, s.data).catch(() => false)) moved++;
  return moved;
}

export const staffPayMover = onDocumentWritten({ document: "staff/{staffId}", region: REGION }, async (event: WriteEvent) => {
  const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  if (!after || !hasPayFields(after)) return;
  await movePayOut(getFirestore(), event.params.staffId, after);
});
