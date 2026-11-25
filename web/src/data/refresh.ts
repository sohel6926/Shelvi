import {
  collection,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * "Refresh" (docs/api-contract.md → Refresh): re-read from the server, not the offline cache.
 * Reading a query/doc from the server also updates the local cache, so the screen's live
 * listeners (onSnapshot) receive the fresh data straight away.
 */
export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

export type RefreshTarget = Query | DocumentReference;

export async function refreshFromServer(...targets: RefreshTarget[]): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new OfflineError();
  try {
    await Promise.all(
      targets.map((t) => (t.type === "document" ? getDocFromServer(t as DocumentReference) : getDocsFromServer(t as Query))),
    );
  } catch (e) {
    const code = (e as { code?: string } | null)?.code ?? "";
    if (code === "unavailable" || code === "firestore/unavailable") throw new OfflineError();
    throw e;
  }
}

/** Same query the repositories use: one collection, optionally filtered to a branch. */
export function branchQuery(name: string, branchId: string | null): Query {
  const col = collection(db, name);
  return branchId ? query(col, where("branchId", "==", branchId)) : query(col);
}

export function allOf(name: string): Query {
  return query(collection(db, name));
}
