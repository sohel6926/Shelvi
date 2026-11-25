/**
 * Module 5e — food-safety checks and incidents. Rules: safetyRules.ts. Checklists live in settings.foodSafety
 * (owner, through saveBusinessSettings).
 *  - saveSafetyCheck { checklistId, answers, note?, bookingId?, branchId? }: anyone who works. A failed check tells
 *    the owner and managers.
 *  - listSafetyChecklists {}: anyone who works — the ACTIVE checklists, so staff (who cannot read settings) can do a check.
 *  - saveSafetyIncident { what, severity, day?, bookingId?, itemId?, batchId?, action? }: anyone who works.
 *  - resolveSafetyIncident { id, resolution }: owner / manager — not the person who reported it, except the owner.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER, ALL_ROLES } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optString, reqId, reqString } from "../shared/validate";
import { asObj, asStr, Doc } from "../shared/coerce";
import { todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { evaluateCheck, parseIncident } from "./safetyRules";

const branchOf = (caller: { role: string; branchId: string }, data: Doc): string => (caller.role === "admin" ? asStr(data.branchId) || caller.branchId : caller.branchId);

export const listSafetyChecklists = callable("listSafetyChecklists", ALL_ROLES, async () => {
  const settings = await loadSettings();
  return { checklists: settings.foodSafety.checklists.filter((c) => c.active) };
});

export const saveSafetyCheck = callable("saveSafetyCheck", ALL_ROLES, async (data, caller) => {
  const checklistId = reqId(data, "checklistId");
  const note = optString(data, "note", 500) ?? "";
  const bookingId = asStr(data.bookingId).includes("/") ? "" : asStr(data.bookingId).slice(0, 200);
  const settings = await loadSettings();
  const list = settings.foodSafety.checklists.find((c) => c.id === checklistId && c.active);
  if (!list) fail("not-found", "ఆ చెక్‌లిస్ట్ దొరకలేదు (లేదా ఆపి ఉంది).", "That checklist was not found (or is switched off).");
  const r = evaluateCheck(list!, asObj(data.answers));
  if (!r.ok) fail("invalid-argument", r.te, r.en);
  const { answers, result, failed } = (r as { ok: true; value: { answers: unknown[]; result: string; failed: number } }).value;
  const db = getFirestore();
  const branchId = branchOf(caller, data);
  const ref = db.collection(FirestoreCollections.SAFETY_CHECKS).doc();
  const batch = db.batch();
  batch.set(ref, { checklistId, kind: list!.kind, name: { te: list!.te, en: list!.en }, branchId, bookingId, day: todayIST(), answers, result, failed, note, by: { uid: caller.uid, name: caller.name }, byUid: caller.uid, createdAt: FieldValue.serverTimestamp() });
  if (result === "fail") {
    batch.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`safetyCheck_${ref.id}`), {
      kind: "safetyCheckFailed", audienceRoles: ["admin", "manager"], recipientUids: [], branchId,
      title: { te: `ఫుడ్ సేఫ్టీ తనిఖీ ఫెయిల్: ${list!.te} — ${failed} అంశాలు — ${caller.name}`, en: `Food-safety check failed: ${list!.en} — ${failed} lines — ${caller.name}` },
      link: "/food-safety", readBy: [], createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { ok: true, id: ref.id, result, failed };
});

export const saveSafetyIncident = callable("saveSafetyIncident", ALL_ROLES, async (data, caller) => {
  const p = parseIncident(data, todayIST());
  if (!p.ok) fail("invalid-argument", p.te, p.en);
  const v = (p as { ok: true; value: Doc }).value;
  const db = getFirestore();
  const branchId = branchOf(caller, data);
  const ref = db.collection(FirestoreCollections.SAFETY_INCIDENTS).doc();
  const batch = db.batch();
  batch.set(ref, { ...v, branchId, status: "open", resolution: "", by: { uid: caller.uid, name: caller.name }, byUid: caller.uid, createdAt: FieldValue.serverTimestamp() });
  batch.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`safetyIncident_${ref.id}`), {
    kind: "safetyIncident", audienceRoles: ["admin", "manager"], recipientUids: [], branchId,
    title: { te: `ఆహార సంఘటన నమోదైంది: ${asStr(v.what).slice(0, 80)} — ${caller.name}`, en: `Food incident reported: ${asStr(v.what).slice(0, 80)} — ${caller.name}` },
    link: "/food-safety", readBy: [], createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "saveSafetyIncident", collection: FirestoreCollections.SAFETY_INCIDENTS, docId: ref.id, before: {}, after: { severity: v.severity, day: v.day } });
  return { ok: true, id: ref.id };
});

export const resolveSafetyIncident = callable("resolveSafetyIncident", ADMIN_MANAGER, async (data, caller) => {
  const id = reqId(data, "id");
  const resolution = reqString(data, "resolution", 1000);
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.SAFETY_INCIDENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "ఆ సంఘటన దొరకలేదు.", "That incident was not found.");
  const x = snap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(x.branchId));
  if (asStr(x.status) !== "open") fail("failed-precondition", "ఈ సంఘటన ఇప్పటికే ముగిసింది.", "This incident is already resolved.");
  if (asStr(x.byUid) === caller.uid && caller.role !== "admin") fail("permission-denied", "మీరు నమోదు చేసిన సంఘటనను మీరే ముగించలేరు. వేరొకరు (లేదా యజమాని) చేయాలి.", "You can't resolve an incident you reported. Someone else (or the owner) must.");
  await ref.update({ status: "resolved", resolution, resolvedBy: { uid: caller.uid, name: caller.name }, resolvedAt: FieldValue.serverTimestamp() });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "resolveSafetyIncident", collection: FirestoreCollections.SAFETY_INCIDENTS, docId: id, before: { status: "open" }, after: { status: "resolved", resolution } });
  return { ok: true };
});
