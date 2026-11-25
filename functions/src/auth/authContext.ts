import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreCollections } from "../shared/firestorePaths";

/**
 * TypeScript mirror of the isSignedIn() / isAdmin() / isActiveUser() / isOwnBranch()
 * helpers in firestore.rules — keep both in sync when either changes.
 */
export type Role = "admin" | "manager" | "staff";

export interface CallerContext {
  uid: string;
  role: Role;
  active: boolean;
  branchId: string;
  name: string;
  phone: string;
  /** users/{uid}.staffId — the staff doc linked to this login ("" if none). Kept by syncStaffLink. */
  staffId: string;
  /** Module 4d: users/{uid}.jobRole — one of the 17 business roles ("" = not given; the old level applies). */
  jobRole: string;
}

/** Unknown / missing roles are treated as the least-privileged role (staff). */
export function parseRole(value: unknown): Role {
  return value === "admin" ? "admin" : value === "manager" ? "manager" : "staff";
}

/** Verifies the caller is signed in and active, and loads their role/branchId. Throws HttpsError otherwise. */
export async function requireActiveUser(request: CallableRequest): Promise<CallerContext> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.", { te: "ముందు sign in చేయండి.", en: "Sign in required." });
  }
  const uid = request.auth.uid;
  const snapshot = await getFirestore().collection(FirestoreCollections.USERS).doc(uid).get();
  if (!snapshot.exists) {
    throw new HttpsError("permission-denied", "No user profile found.", { te: "మీ user వివరాలు దొరకలేదు.", en: "No user profile found." });
  }
  const data = snapshot.data() ?? {};
  const active = data.active === true;
  // The owner (admin) is never locked out by the active flag — same as firestore.rules isAdmin().
  if (!active && data.role !== "admin") {
    throw new HttpsError("permission-denied", "This account is not active.", {
      te: "మీ account ఇంకా approve కాలేదు. Admin ని అడగండి.",
      en: "This account is not active.",
    });
  }
  const role = parseRole(data.role);
  const branchId: string = typeof data.branchId === "string" ? data.branchId : "";
  const name: string = typeof data.name === "string" ? data.name : "";
  const phone: string = typeof data.phone === "string" ? data.phone : "";
  const staffId: string = typeof data.staffId === "string" ? data.staffId : "";
  const jobRole: string = typeof data.jobRole === "string" ? data.jobRole : "";
  return { uid, role, active, branchId, name, phone, staffId, jobRole };
}

/** Mirrors isAdmin() || isOwnBranch(branchId) from firestore.rules. */
export function assertAdminOrOwnBranch(caller: CallerContext, targetBranchId: string): void {
  if (caller.role === "admin") return;
  if (caller.branchId && caller.branchId === targetBranchId) return;
  throw new HttpsError("permission-denied", "You do not have access to this branch.", {
    te: "ఈ branch వివరాలు చూడటానికి మీకు అనుమతి లేదు.",
    en: "You do not have access to this branch.",
  });
}

/** Role guard: throws permission-denied unless the caller has one of the given roles. */
export function assertRole(caller: CallerContext, roles: readonly Role[]): void {
  if (roles.includes(caller.role)) return;
  throw new HttpsError("permission-denied", `Role ${caller.role} cannot do this.`, {
    te: "ఈ పని చేయడానికి మీకు అనుమతి లేదు.",
    en: `Your role (${caller.role}) cannot do this.`,
  });
}
