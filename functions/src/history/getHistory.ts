import { getFirestore, Timestamp, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { optNum, optString } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { addDays, dayRange, isValidDay, toDateValue } from "../shared/istDate";
import { entryBy, HistoryFilter, matchesHistory, pageHistory, RawEntry, sortHistory } from "./historyQuery";

const SCAN_BATCH = 500;
const SCAN_MAX = 5000;

function toRaw(d: QueryDocumentSnapshot<DocumentData>): RawEntry {
  const data = d.data() as Doc;
  return { id: d.id, atMs: toDateValue(data.at ?? data.timestamp)?.getTime() ?? 0, data };
}

/**
 * getHistory { collection?, docId?, by?, fromDay?, toDay?, limit ≤ 200, startAfter? } (admin) → { entries, nextCursor }.
 * With docId: all entries of that document (equality only — no composite index). Otherwise newest-first scan by `at`
 * (single-field index), filtered in memory, at most 5,000 entries per call.
 */
export const getHistory = callable("getHistory", ADMIN, async (data) => {
  const db = getFirestore();
  const collection = optString(data, "collection", 100) || undefined;
  const docId = optString(data, "docId", 200) || undefined;
  const by = optString(data, "by", 200) || undefined;
  const fromDay = optString(data, "fromDay", 10) || undefined;
  const toDay = optString(data, "toDay", 10) || undefined;
  const limit = optNum(data, "limit", { int: true, min: 1, max: 200 }) ?? 50;
  const startAfter = optString(data, "startAfter", 200) || undefined;
  for (const [k, v] of [["fromDay", fromDay], ["toDay", toDay]] as const) {
    if (v && !isValidDay(v)) fail("invalid-argument", `"${k}" తేదీ YYYY-MM-DD రూపంలో ఉండాలి.`, `${k} must be YYYY-MM-DD.`);
  }
  const filter: HistoryFilter = {
    collection,
    docId,
    by,
    fromMs: fromDay ? dayRange(fromDay).start.getTime() : undefined,
    toMsExcl: toDay ? dayRange(addDays(toDay, 0)).end.getTime() : undefined,
  };
  const log = db.collection(FirestoreCollections.AUDIT_LOG);
  let sorted: RawEntry[];
  if (docId) {
    sorted = sortHistory((await log.where("docId", "==", docId).limit(SCAN_MAX).get()).docs.map(toRaw).filter((e) => matchesHistory(e, filter)));
  } else {
    // Newest first by `at`; page through until enough matches (+1 to know whether more remain) or the scan cap.
    const found: RawEntry[] = [];
    let scanned = 0;
    let last: QueryDocumentSnapshot<DocumentData> | undefined;
    let passedCursor = !startAfter;
    let q = log.orderBy("at", "desc");
    if (filter.toMsExcl !== undefined) q = q.where("at", "<", Timestamp.fromMillis(filter.toMsExcl));
    if (filter.fromMs !== undefined) q = q.where("at", ">=", Timestamp.fromMillis(filter.fromMs));
    while (scanned < SCAN_MAX) {
      const snap = await (last ? q.startAfter(last) : q).limit(SCAN_BATCH).get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        const e = toRaw(d);
        if (!passedCursor) {
          passedCursor = d.id === startAfter;
          continue;
        }
        if (matchesHistory(e, filter)) found.push(e);
      }
      scanned += snap.size;
      last = snap.docs[snap.docs.length - 1];
      if (found.length > limit || snap.size < SCAN_BATCH) break;
    }
    sorted = found;
  }
  const { page, nextCursor } = docId ? pageHistory(sorted, limit, startAfter) : { page: sorted.slice(0, limit), nextCursor: sorted.length > limit ? sorted[limit - 1].id : null };

  const uids = [...new Set(page.map((e) => entryBy(e.data)).filter((u) => u !== "system"))];
  const users = uids.length ? await db.getAll(...uids.map((u) => db.collection(FirestoreCollections.USERS).doc(u))) : [];
  const names = new Map(users.filter((u) => u.exists).map((u) => [u.id, asStr((u.data() as Doc).name)]));
  const entries = page.map((e) => {
    const who = entryBy(e.data);
    return {
      id: e.id,
      kind: asStr(e.data.kind, "action"),
      collection: asStr(e.data.collection),
      docId: asStr(e.data.docId),
      path: asStr(e.data.path),
      action: asStr(e.data.action),
      changed: Array.isArray(e.data.changed) ? e.data.changed : [],
      diff: e.data.diff ?? null,
      before: e.data.before ?? null,
      after: e.data.after ?? null,
      summary: e.data.summary ?? null,
      by: who,
      byName: who === "system" ? "System" : names.get(who) ?? "",
      at: e.atMs ? new Date(e.atMs).toISOString() : null,
      branchId: asStr(e.data.branchId),
    };
  });
  return { entries, nextCursor };
});
