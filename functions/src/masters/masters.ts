/**
 * Module 5a — callables for the five masters (owner only). Rules: masterRules.ts.
 *  - saveMaster { kind, id?, data }: create or change a company / brand / branch / kitchen / store.
 *  - setMasterStatus { kind, id, status, reason }: draft / active / inactive / archived. Nothing is deleted.
 *  - setupMasters {}: the first set-up from what the CRM already knows; safe to run again.
 * Every change is written to the audit log with the old and new values (§21).
 */
import { getFirestore, FieldValue, Firestore, Transaction } from "firebase-admin/firestore";
import { callable, ADMIN } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqOneOf, reqString } from "../shared/validate";
import { asObj, asStr, Doc } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { writeAuditEntry } from "../shared/auditLog";
import { MASTER_COLLECTION, MASTER_KINDS, MASTER_STATUSES, MasterKind, MasterStatus, MasterWorld, PARSERS, duplicateOf, firstSetupPlan, masterCode, parentProblem, statusChangeProblem, statusOf } from "./masterRules";

async function loadWorld(db: Firestore): Promise<MasterWorld> {
  const rows = async (name: string) => (await db.collection(name).get()).docs.map((d) => ({ id: d.id, data: d.data() as Doc }));
  const [companies, brands, branches, kitchens, stores] = await Promise.all(MASTER_KINDS.map((k) => rows(MASTER_COLLECTION[k])));
  return { companies, brands, branches, kitchens, stores };
}
const listOf = (w: MasterWorld, kind: MasterKind) => ({ company: w.companies, brand: w.brands, branch: w.branches, kitchen: w.kitchens, store: w.stores })[kind];

/** Next display code of a kind, inside the caller's transaction (counters/master-<kind>). */
async function nextCode(db: Firestore, tx: Transaction, kind: MasterKind, atLeast: number): Promise<string> {
  const ref = db.collection(FirestoreCollections.COUNTERS).doc(`master-${kind}`);
  const n = Math.max(Number(((await tx.get(ref)).data() ?? {}).n) || 0, atLeast) + 1;
  tx.set(ref, { n, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return masterCode(kind, n);
}

const DUP_TEXT: Record<string, { te: string; en: string }> = {
  name: { te: "ఇదే పేరుతో ఇప్పటికే ఒకటి ఉంది.", en: "One with the same name already exists." },
  gstin: { te: "ఈ GSTIN తో ఇప్పటికే ఒక కంపెనీ ఉంది.", en: "A company with this GSTIN already exists." },
  pan: { te: "ఈ PAN తో ఇప్పటికే ఒక కంపెనీ ఉంది.", en: "A company with this PAN already exists." },
  registration: { te: "ఈ రిజిస్ట్రేషన్ నంబర్‌తో ఇప్పటికే ఒక కంపెనీ ఉంది.", en: "A company with this registration number already exists." },
};

export const saveMaster = callable("saveMaster", ADMIN, async (data, caller) => {
  const kind = reqOneOf(data, "kind", MASTER_KINDS) as MasterKind;
  const id = asStr(data.id).trim();
  if (id.includes("/")) fail("invalid-argument", "id సరిగా లేదు.", "The id is not valid.");
  const parsed = PARSERS[kind](asObj(data.data));
  if (!parsed.ok) fail("invalid-argument", parsed.te, parsed.en);
  const v = parsed.value;
  const db = getFirestore();
  const world = await loadWorld(db);
  const existing = id ? listOf(world, kind).find((r) => r.id === id) : undefined;
  if (id && !existing) fail("not-found", "ఆ రికార్డ్ దొరకలేదు.", "That record was not found.");
  if (existing && statusOf(existing.data) === "archived") fail("failed-precondition", "ఆర్కైవ్ చేసిన రికార్డ్‌ను మార్చలేరు.", "An archived record cannot be changed.");
  const parent = parentProblem(kind, v, world);
  if (!parent.ok) fail("failed-precondition", parent.te, parent.en);
  const dup = duplicateOf(kind, id, v, listOf(world, kind));
  if (dup) fail("already-exists", DUP_TEXT[dup].te, DUP_TEXT[dup].en);
  // a kitchen or store does not move to another branch by an edit (§7 rule 6: a transfer is its own, approved action)
  if (existing && (kind === "kitchen" || kind === "store") && asStr(existing.data.branchId) && existing.data.branchId !== v.branchId) fail("failed-precondition", "దీన్ని వేరే శాఖకు ఇక్కడ మార్చలేరు.", "It cannot be moved to another branch here.");
  if (existing && (kind === "brand" || kind === "branch") && asStr(existing.data.companyId) && existing.data.companyId !== v.companyId) fail("failed-precondition", "దీన్ని వేరే కంపెనీకి ఇక్కడ మార్చలేరు.", "It cannot be moved to another company here.");

  const col = db.collection(MASTER_COLLECTION[kind]);
  const ref = id ? col.doc(id) : col.doc();
  const code = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() as Doc | undefined;
    const have = asStr(cur?.code);
    const c = have || (await nextCode(db, tx, kind, listOf(world, kind).filter((r) => asStr(r.data.code)).length));
    const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid };
    if (cur) tx.set(ref, { ...v, code: c, ...stamp }, { merge: true });
    else tx.set(ref, { ...v, code: c, status: "active", ...(kind === "branch" ? { active: true } : {}), createdAt: FieldValue.serverTimestamp(), createdBy: caller.uid, ...stamp });
    return c;
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: existing ? "updateMaster" : "createMaster", collection: MASTER_COLLECTION[kind], docId: ref.id, before: existing ? Object.fromEntries(Object.keys(v).map((k) => [k, existing.data[k] ?? null])) : {}, after: v });
  return { ok: true, id: ref.id, code };
});

export const setMasterStatus = callable("setMasterStatus", ADMIN, async (data, caller) => {
  const kind = reqOneOf(data, "kind", MASTER_KINDS) as MasterKind;
  const id = reqString(data, "id", 200);
  const status = reqOneOf(data, "status", MASTER_STATUSES) as MasterStatus;
  const reason = reqString(data, "reason", 300);
  const db = getFirestore();
  const world = await loadWorld(db);
  const row = listOf(world, kind).find((r) => r.id === id);
  if (!row) fail("not-found", "ఆ రికార్డ్ దొరకలేదు.", "That record was not found.");
  const from = statusOf(row!.data);
  const problem = statusChangeProblem(kind, id, from, status, world);
  if (problem === "same") fail("failed-precondition", "ఇప్పటికే అదే స్థితిలో ఉంది.", "It is already in that status.");
  if (problem === "archived") fail("failed-precondition", "ఆర్కైవ్ చేసిన రికార్డ్‌ను తిరిగి తెరవలేరు.", "An archived record cannot be reopened.");
  if (problem === "children") fail("failed-precondition", "దీని కింద ఇంకా వాడుకలో ఉన్నవి ఉన్నాయి. ముందు వాటిని ఆర్కైవ్ చేయండి.", "Records under it are still in use. Archive those first.");
  await db.collection(MASTER_COLLECTION[kind]).doc(id).set({ status, ...(kind === "branch" ? { active: status === "active" } : {}), statusReason: reason, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid }, { merge: true });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "setMasterStatus", collection: MASTER_COLLECTION[kind], docId: id, before: { status: from }, after: { status, reason } });
  return { ok: true, status };
});

export const setupMasters = callable("setupMasters", ADMIN, async (_data, caller) => {
  const db = getFirestore();
  const [world, settings] = await Promise.all([loadWorld(db), loadSettings()]);
  const plan = firstSetupPlan({ legalName: settings.legalName, brandName: settings.brandName || settings.name, gstin: settings.gstin, address: settings.address, phone: settings.phone }, world.branches, world);
  const made = { company: 0, brand: 0, branches: 0, kitchens: 0, stores: 0 };
  const stamp = () => ({ status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: caller.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });
  const create = async (kind: MasterKind, value: Doc, atLeast: number): Promise<string> => {
    const ref = db.collection(MASTER_COLLECTION[kind]).doc();
    await db.runTransaction(async (tx) => tx.set(ref, { ...value, code: await nextCode(db, tx, kind, atLeast), ...stamp() }));
    return ref.id;
  };
  let companyId = world.companies.find((c) => statusOf(c.data) !== "archived")?.id ?? "";
  if (plan.company) {
    const p = PARSERS.company(plan.company);
    if (!p.ok) fail("failed-precondition", p.te, p.en);
    companyId = await create("company", (p as { ok: true; value: Doc }).value, 0);
    made.company = 1;
  }
  let brandId = world.brands.find((b) => statusOf(b.data) !== "archived" && b.data.companyId === companyId)?.id ?? "";
  if (plan.brand && companyId) {
    const p = PARSERS.brand({ ...plan.brand, companyId });
    if (!p.ok) fail("failed-precondition", p.te, p.en);
    brandId = await create("brand", (p as { ok: true; value: Doc }).value, 0);
    made.brand = 1;
  }
  let branchCodes = world.branches.filter((b) => asStr(b.data.code)).length;
  for (const b of world.branches) {
    if (asStr(b.data.companyId) || statusOf(b.data) === "archived" || !companyId) continue;
    const ref = db.collection(FirestoreCollections.BRANCHES).doc(b.id);
    const at = branchCodes++;
    await db.runTransaction(async (tx) => tx.set(ref, { companyId, brandIds: brandId ? [brandId] : [], branchType: "fullOperations", status: statusOf(b.data), ...(asStr(b.data.code) ? {} : { code: await nextCode(db, tx, "branch", at) }), updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid }, { merge: true }));
    made.branches++;
  }
  for (const [i, branchId] of plan.kitchensFor.entries()) {
    await create("kitchen", { name: "Main Kitchen", branchId, kitchenType: "central", sections: [], vegOnly: false, nonVegAllowed: true, maxPlatesPerShift: 0, qualityApprovalRequired: false, temperatureLogRequired: false, batchTrackingRequired: false }, world.kitchens.length + i);
    made.kitchens++;
  }
  for (const [i, branchId] of plan.storesFor.entries()) {
    await create("store", { name: "Main Store", branchId, kitchenId: "", storeType: "main", temperatureControlled: false, restrictedAccess: false, negativeStockAllowed: false, issueBlocked: false, expiryTracking: false, adjustmentApprovalRequired: true }, world.stores.length + i);
    made.stores++;
  }
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "setupMasters", collection: "companies", docId: companyId || "-", before: {}, after: made });
  return { ok: true, made, companyId, brandId };
});
