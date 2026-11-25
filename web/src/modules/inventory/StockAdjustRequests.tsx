import { useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { decideStockAdjust, errorText } from "../../data/functions";

interface AdjustRequest {
  id: string;
  itemName: string;
  unit: string;
  type: "IN" | "OUT";
  quantity: number;
  qtyAtRequest: number;
  reason: string;
  note: string;
  requestedBy: string;
  requestedByName: string;
}

const REASON: Record<string, { te: string; en: string }> = {
  count: { te: "లెక్కింపు", en: "Count" },
  damage: { te: "పాడైంది", en: "Damage" },
  correction: { te: "సరిదిద్దడం", en: "Correction" },
  return: { te: "తిరిగి వచ్చింది", en: "Return" },
};

/**
 * Module 4d (B5) — stock adjustments waiting for a supervisor. A big hand change by store / staff does not move
 * the stock; it is listed here until the owner or an approving manager approves or rejects it (decideStockAdjust).
 * The person who asked sees their own waiting requests, without the buttons. Shows nothing when the list is empty.
 */
export function StockAdjustRequests({ branchId }: { branchId: string | null }) {
  const { L, lang } = useLang();
  const session = useSession();
  const [rows, setRows] = useState<AdjustRequest[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState("");
  const [note, setNote] = useState("");

  const profile = session.status === "loggedIn" ? session.profile : null;
  const uid = profile?.uid ?? "";
  const level = profile?.role ?? "staff";
  const ownBranch = profile?.branchId ?? "";
  // the server decides for real (canApproveAdjust); this only hides buttons that would be refused
  const mayApprove = level === "admin" || (level === "manager" && (!profile?.jobRole || profile.jobRole === "coo"));

  useEffect(() => {
    if (!uid) return;
    const base = collection(db, "stockAdjustRequests");
    const q =
      level === "admin"
        ? branchId
          ? query(base, where("branchId", "==", branchId))
          : query(base, where("status", "==", "pending"))
        : level === "manager" && ownBranch
          ? query(base, where("branchId", "==", ownBranch))
          : query(base, where("requestedBy", "==", uid));
    return onSnapshot(
      q,
      (snap) =>
        setRows(
          snap.docs
            .filter((d) => d.data().status === "pending")
            .map((d) => {
              const x = d.data();
              const str = (v: unknown) => (typeof v === "string" ? v : "");
              const num = (v: unknown) => (typeof v === "number" ? v : 0);
              return { id: d.id, itemName: str(x.itemName), unit: str(x.unit), type: x.type === "IN" ? ("IN" as const) : ("OUT" as const), quantity: num(x.quantity), qtyAtRequest: num(x.qtyAtRequest), reason: str(x.reason), note: str(x.note), requestedBy: str(x.requestedBy), requestedByName: str(x.requestedByName) };
            }),
        ),
      () => setRows([]),
    );
  }, [uid, level, ownBranch, branchId]);

  if (!rows.length) return null;

  const decide = async (id: string, approve: boolean, why = "") => {
    setBusy(id);
    setError(null);
    try {
      await decideStockAdjust({ id, approve, ...(why ? { note: why } : {}) });
      setRejecting("");
      setNote("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy("");
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {L("ఆమోదం కోసం ఆగిన స్టాక్ సవరణలు", "Stock adjustments waiting for approval")} ({rows.length})
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={1}>
        {rows.map((r) => {
          const mine = r.requestedBy === uid;
          const canDecide = mayApprove && (!mine || level === "admin");
          return (
            <Box key={r.id} sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", borderTop: 1, borderColor: "divider", pt: 1 }}>
              <Box sx={{ flex: "1 1 260px" }}>
                <Typography variant="body2">
                  <b>{r.itemName}</b> {r.type === "IN" ? "+" : "−"}
                  {r.quantity} {r.unit} · {L(REASON[r.reason]?.te ?? r.reason, REASON[r.reason]?.en ?? r.reason)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {L(`అడిగినప్పుడు నిల్వ ${r.qtyAtRequest} ${r.unit}`, `Stock when asked: ${r.qtyAtRequest} ${r.unit}`)} · {r.requestedByName}
                  {r.note ? ` · ${r.note}` : ""}
                </Typography>
              </Box>
              {canDecide ? (
                rejecting === r.id ? (
                  <>
                    <TextField size="small" label={L("తిరస్కరణ కారణం", "Reason to reject")} value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button size="small" color="error" variant="contained" disabled={!note.trim() || busy === r.id} onClick={() => void decide(r.id, false, note.trim())}>
                      {L("తిరస్కరించు", "Reject")}
                    </Button>
                    <Button size="small" onClick={() => setRejecting("")}>
                      {L("వద్దు", "Cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="small" variant="contained" color="success" disabled={busy === r.id} onClick={() => void decide(r.id, true)}>
                      {L("ఆమోదించు", "Approve")}
                    </Button>
                    <Button size="small" color="error" disabled={busy === r.id} onClick={() => { setRejecting(r.id); setNote(""); }}>
                      {L("తిరస్కరించు", "Reject")}
                    </Button>
                  </>
                )
              ) : (
                <Typography variant="caption" color="text.secondary">
                  {mine ? L("మీ అభ్యర్థన — ఆమోదం కోసం ఆగింది", "Your request — waiting for approval") : L("ఆమోదం కోసం ఆగింది", "Waiting for approval")}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
