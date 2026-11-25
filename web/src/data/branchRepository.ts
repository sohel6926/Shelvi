import { collection, type DocumentData, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

/** Mirrors data/model/Branch.kt */
export interface Branch {
  id: string;
  name: string;
  active: boolean;
}

const branchesCol = collection(db, "branches");

function toBranch(id: string, data: DocumentData): Branch {
  return { id, name: data.name ?? "", active: data.active === true };
}

export function subscribeActiveBranches(onData: (branches: Branch[]) => void): () => void {
  const q = query(branchesCol, where("active", "==", true));
  return onSnapshot(q, (snap) =>
    onData(snap.docs.map((d) => toBranch(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)))
  );
}
