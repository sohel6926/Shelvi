import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "../auth/AuthProvider";

/**
 * Mirrors session/BranchManager.kt: null = "All Branches" (admin combined view).
 * Staff and managers are always forced to their own profile.branchId, never switchable
 * (only the admin has the "All Branches" view).
 * Uses localStorage instead of SharedPreferences for the admin's last selection.
 */
const STORAGE_KEY = "selected_branch_id";

interface BranchContextValue {
  currentBranchId: string | null;
  selectBranch: (branchId: string | null) => void;
}

const BranchContext = createContext<BranchContextValue>({
  currentBranchId: null,
  selectBranch: () => {},
});

export function useBranch(): BranchContextValue {
  return useContext(BranchContext);
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    if (session.status !== "loggedIn") return;
    if (session.profile.role !== "admin") {
      setSelected(session.profile.branchId || null);
    }
  }, [session]);

  const currentBranchId =
    session.status === "loggedIn" && session.profile.role !== "admin"
      ? session.profile.branchId || null
      : selected;

  function selectBranch(branchId: string | null) {
    if (session.status === "loggedIn" && session.profile.role !== "admin") return; // no-op for staff / manager
    if (branchId) localStorage.setItem(STORAGE_KEY, branchId);
    else localStorage.removeItem(STORAGE_KEY);
    setSelected(branchId);
  }

  return (
    <BranchContext.Provider value={{ currentBranchId, selectBranch }}>{children}</BranchContext.Provider>
  );
}
