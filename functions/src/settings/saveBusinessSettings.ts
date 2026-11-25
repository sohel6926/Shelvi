import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { callable, ADMIN } from "../shared/callable";
import { fail } from "../shared/errors";
import { Doc } from "../shared/coerce";
import { settingsRef } from "../shared/settings";
import { writeAuditEntry } from "../shared/auditLog";
import { FirestoreCollections, BUSINESS_SETTINGS_DOC } from "../shared/firestorePaths";
import { applySettingsPatch, progressAfter } from "./settingsPatch";

export const saveBusinessSettings = callable("saveBusinessSettings", ADMIN, async (data, caller) => {
  const ref = settingsRef();
  const current = (await ref.get()).data() as Doc | undefined;
  const { update, errors } = applySettingsPatch(current, data);
  if (errors.length) fail("invalid-argument", errors.map((e) => e.te).join(" "), errors.map((e) => e.en).join(" "));
  const staff = await getFirestore().collection(FirestoreCollections.STAFF).limit(1).get();
  const setupProgress = progressAfter(current, update, !staff.empty);
  await ref.set({ ...update, setupProgress, updatedBy: caller.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const gstKeys = ["gstin", "gstRegistered", "defaultGstRate", "upiId", "bank"].filter((k) => k in update);
  if (gstKeys.length) {
    await writeAuditEntry({
      uid: caller.uid,
      role: caller.role,
      action: "saveBusinessSettings",
      collection: FirestoreCollections.SETTINGS,
      docId: BUSINESS_SETTINGS_DOC,
      before: Object.fromEntries(gstKeys.map((k) => [k, current?.[k] ?? null])),
      after: Object.fromEntries(gstKeys.map((k) => [k, update[k]])),
    });
  }
  return { ok: true, setupProgress };
});
