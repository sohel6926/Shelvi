import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { parseRole, type Role } from "./roles";
import { setBookingStaffScope } from "../data/bookingRepository";

/** Mirrors data/model/UserProfile.kt */
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  active: boolean;
  branchId: string;
  /** Staff login: the linked staff/{id} (own tasks, shifts, advances). "" for others. */
  staffId: string;
  /** Module 4d: one of the 17 business roles ("" = none given). Set by the owner on the Users page. */
  jobRole: string;
}

/** Mirrors session/SessionManager.kt's SessionState sealed class. */
export type SessionState =
  | { status: "loading" }
  | { status: "loggedOut" }
  | { status: "loggedIn"; profile: UserProfile };

const AuthContext = createContext<SessionState>({ status: "loading" });

export function useSession(): SessionState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => onAuthStateChanged(auth, (user) => setFirebaseUser(user)), []);

  useEffect(() => {
    if (firebaseUser === undefined) {
      setSession({ status: "loading" });
      return;
    }
    if (firebaseUser === null) {
      setBookingStaffScope(null);
      setSession({ status: "loggedOut" });
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "users", firebaseUser.uid), (snapshot) => {
      if (!snapshot.exists()) {
        setSession({ status: "loading" });
        return;
      }
      const data = snapshot.data();
      // Staff read only the bookings assigned to them (firestore.rules canReadBooking).
      setBookingStaffScope(parseRole(data.role) === "staff" ? (typeof data.staffId === "string" ? data.staffId : "") : null);
      setSession({
        status: "loggedIn",
        profile: {
          uid: firebaseUser.uid,
          name: data.name ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
          role: parseRole(data.role),
          active: data.active === true,
          branchId: data.branchId ?? "",
          staffId: typeof data.staffId === "string" ? data.staffId : "",
          jobRole: typeof data.jobRole === "string" ? data.jobRole : "",
        },
      });
    });
    return unsubscribe;
  }, [firebaseUser]);

  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}
