import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { optId, reqArray, reqOneOf } from "../shared/validate";
import { asStr, Doc } from "../shared/coerce";
import { Bilingual, fail } from "../shared/errors";
import { importNeedsBranch, NO_BRANCH_ERROR, resolveBranchId } from "../shared/branch";
import { normalizeIndianPhone } from "../shared/messagePolicy";
import { IMPORT_KINDS, ImportKind, normalizeImportRow } from "./normalizeRow";

export { normalizeImportRow, IMPORT_KINDS };

const COLLECTION: Record<ImportKind, string> = {
  customers: FirestoreCollections.CUSTOMERS,
  staff: FirestoreCollections.STAFF,
  menuItems: FirestoreCollections.MENU_ITEMS,
  vendors: FirestoreCollections.VENDORS,
  leads: FirestoreCollections.LEADS,
};

/** rows are parsed from Excel on the client; `row` in skipped is the 1-based position in `rows`. */
export const importRows = callable("importRows", ADMIN, async (data, caller) => {
  const db = getFirestore();
  const kind = reqOneOf(data, "kind", IMPORT_KINDS);
  const rows = reqArray(data, "rows", 500);
  // Client sends the selected branch, else the caller's; only staff must not get an empty branchId (fix 9).
  const branchId = resolveBranchId(optId(data, "branchId"), caller.branchId) ?? "";
  if (importNeedsBranch(kind) && !branchId) fail("invalid-argument", NO_BRANCH_ERROR.te, NO_BRANCH_ERROR.en);
  const col = db.collection(COLLECTION[kind]);
  const existing = await col.get();
  const seen = new Set(
    existing.docs.map((d) => {
      const x = d.data() as Doc;
      return kind === "menuItems" ? asStr(x.name).trim().toLowerCase() : normalizeIndianPhone(asStr(x.phone))?.slice(2) ?? "";
    }),
  );
  const skipped: { row: number; reason: Bilingual }[] = [];
  const batch = db.batch();
  let created = 0;
  rows.forEach((r, i) => {
    const n = normalizeImportRow(kind, r);
    if (!n.ok) return skipped.push({ row: i + 1, reason: n.reason });
    if (seen.has(n.key)) return skipped.push({ row: i + 1, reason: { te: kind === "menuItems" ? "ఈ పేరుతో ఇప్పటికే ఉంది." : "ఈ ఫోన్ నంబర్ తో ఇప్పటికే ఉంది.", en: kind === "menuItems" ? "Duplicate name." : "Duplicate phone number." } });
    seen.add(n.key);
    const extra: Doc = { createdBy: caller.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    if (kind !== "menuItems") extra.branchId = branchId;
    if ((kind === "customers" || kind === "leads") && n.doc.whatsappOptIn === true) extra.optInAt = FieldValue.serverTimestamp();
    if (kind === "leads") extra.updatedBy = caller.uid;
    batch.set(col.doc(), { ...n.doc, ...extra });
    created++;
  });
  if (created) await batch.commit();
  return { created, skipped };
});
