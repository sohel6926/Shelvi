import { getFirestore } from "firebase-admin/firestore";
import { BUSINESS_SETTINGS_DOC, FirestoreCollections } from "./firestorePaths";
import { BusinessSettings, normalizeSettings } from "./settingsModel";

export * from "./settingsModel";

export function settingsRef() {
  return getFirestore().collection(FirestoreCollections.SETTINGS).doc(BUSINESS_SETTINGS_DOC);
}

export async function loadSettings(): Promise<BusinessSettings> {
  const snap = await settingsRef().get();
  return normalizeSettings(snap.data());
}
