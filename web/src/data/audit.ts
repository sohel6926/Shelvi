import { serverTimestamp } from "firebase/firestore";
import { auth } from "../firebase";

/**
 * Change history (docs/api-contract.md → Round 6 B): server triggers record who changed what, using
 * the document's `updatedBy` (update / delete) or `createdBy` (create). Every direct Firestore write
 * from the web therefore carries these stamps.
 */
export function currentUid(): string {
  return auth.currentUser?.uid ?? "";
}

/** Spread into every direct update. */
export function updateStamp() {
  return { updatedBy: currentUid(), updatedAt: serverTimestamp() };
}

/** Spread into every direct create. */
export function createStamp() {
  const uid = currentUid();
  return { createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}
