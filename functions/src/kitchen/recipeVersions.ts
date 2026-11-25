/**
 * Module 2b (18 Nov 2026) — recordRecipeVersion: every real change to a dish's typed recipe is kept as
 * dishes/{id}/recipeVersions/{n} (who, when, the full recipe). The dish carries 🔒 recipeVersion and
 * 🔒 recipeVersionKey (the fingerprint of the recorded recipe). Old versions are never changed or deleted.
 */
import { REGION } from "../setup";
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asNum, asStr, Doc } from "../shared/coerce";
import { needsNewVersion, recipeFingerprint, recipeSnapshot } from "./recipeVersionRules";

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

export const recordRecipeVersion = onDocumentWritten({ document: "dishes/{dishId}", region: REGION }, async (event: WriteEvent) => {
  const seen = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
  if (!needsNewVersion(seen, asStr(seen?.recipeVersionKey), asNum(seen?.recipeVersion, 0))) return;
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.DISHES).doc(event.params.dishId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const dish = snap.exists ? (snap.data() as Doc) : undefined;
    const version = asNum(dish?.recipeVersion, 0);
    if (!needsNewVersion(dish, asStr(dish?.recipeVersionKey), version)) return;
    const recipe = recipeSnapshot(dish);
    const next = version + 1;
    tx.set(ref.collection("recipeVersions").doc(String(next).padStart(4, "0")), {
      version: next,
      ...recipe,
      changedBy: asStr(dish?.updatedBy),
      changedAt: FieldValue.serverTimestamp(),
    });
    tx.update(ref, { recipeVersion: next, recipeVersionKey: recipeFingerprint(recipe) });
  });
});
