import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { collection, doc, getDoc, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { advanceDispatch, cancelDispatch, errorText, eventPlan, saveDispatch, type PlanPart } from "../../data/functions";
import { PageHeader } from "../../components/DataTable";
import { formatDay } from "../../util/dates";
import { subscribeVehicles, type Vehicle } from "../../data/assetsRepository";

type Line = { line: number; kind: string; name: string; qty: number; unit: string; container: string; seal: string; loadedQty: number | null; deliveredQty: number | null; returnedQty: number | null; shortReason: string };
type Dispatch = DocumentData & { id: string };
const str = (v: unknown) => (typeof v === "string" ? v : "");
const KINDS = [
  { code: "food", te: "ఆహారం", en: "Food" },
  { code: "container", te: "పాత్రలు / డబ్బాలు", en: "Containers" },
  { code: "equipment", te: "సామాను", en: "Equipment" },
];
const STATUS: Record<string, { te: string; en: string; color: "default" | "info" | "warning" | "success" | "error" }> = {
  packing: { te: "ప్యాక్ చేస్తున్నారు", en: "Packing", color: "default" },
  packed: { te: "ప్యాక్ అయింది", en: "Packed", color: "info" },
  loaded: { te: "లోడ్ అయింది", en: "Loaded", color: "info" },
  dispatched: { te: "బయలుదేరింది", en: "Dispatched", color: "warning" },
  delivered: { te: "వేదికకు అందింది", en: "Delivered", color: "success" },
  returned: { te: "తిరిగి వచ్చింది", en: "Returned", color: "warning" },
  reconciled: { te: "లెక్క సరిపోయింది", en: "Reconciled", color: "success" },
  cancelled: { te: "రద్దయింది", en: "Cancelled", color: "error" },
};
const NEXT: Record<string, { step: "packed" | "loaded" | "dispatched" | "delivered" | "returned" | "reconciled"; te: string; en: string }> = {
  packing: { step: "packed", te: "ప్యాకింగ్ పూర్తయింది", en: "Packing is done" },
  packed: { step: "loaded", te: "లోడ్ తనిఖీ", en: "Load check" },
  loaded: { step: "dispatched", te: "వాహనం బయలుదేరింది", en: "Vehicle has left" },
  dispatched: { step: "delivered", te: "వేదికకు అందింది", en: "Arrived at the venue" },
  delivered: { step: "returned", te: "తిరిగి వచ్చినవి లెక్కించు", en: "Count what came back" },
  returned: { step: "reconciled", te: "లెక్క ముగించు", en: "Close the count" },
};
const returnable = (k: string) => k === "container" || k === "equipment";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

/** A paper load sheet for the vehicle: what is on it, with blank columns to tick at loading, at the venue and on return. */
function printSheet(d: Dispatch, L: (te: string, en: string) => string, day: string) {
  const lines = (Array.isArray(d.lines) ? d.lines : []) as Line[];
  const kind = (k: string) => {
    const hit = KINDS.find((x) => x.code === k);
    return hit ? L(hit.te, hit.en) : k;
  };
  const rows = lines.map((l) => `<tr><td>${l.line}</td><td>${esc(kind(l.kind))}</td><td>${esc(l.name)}</td><td class="n">${esc(l.qty)} ${esc(l.unit)}</td><td>${esc(l.container)}</td><td>${esc(l.seal)}</td><td class="n">${l.loadedQty ?? ""}</td><td class="n">${l.deliveredQty ?? ""}</td><td class="n">${l.returnedQty ?? ""}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.number)}</title><style>body{font-family:"Noto Sans Telugu","Noto Sans Devanagari",system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:2px 0;font-size:13px}table{border-collapse:collapse;width:100%;margin-top:14px;font-size:13px}th,td{border:1px solid #555;padding:6px 8px;text-align:left}td.n{text-align:right;min-width:56px}.sign{display:flex;gap:32px;margin-top:48px;font-size:13px}.sign div{flex:1;border-top:1px solid #555;padding-top:6px}</style></head><body>
<h1>${esc(L("లోడ్ జాబితా", "Load sheet"))} — ${esc(d.number)}</h1>
<p>${esc(L("కస్టమర్", "Customer"))}: ${esc(d.customerName)} · ${esc(L("తేదీ", "Date"))}: ${esc(day)}</p>
<p>${esc(L("వేదిక", "Venue"))}: ${esc(d.venue)}</p>
<p>${esc(L("వాహనం", "Vehicle"))}: ${esc(d.vehicleName) || "__________"} · ${esc(L("డ్రైవర్", "Driver"))}: ${esc(d.driverName) || "__________"}</p>
<table><thead><tr><th>#</th><th>${esc(L("రకం", "Type"))}</th><th>${esc(L("పేరు", "Name"))}</th><th>${esc(L("పరిమాణం", "Quantity"))}</th><th>${esc(L("పాత్ర", "Container"))}</th><th>${esc(L("సీల్ నంబర్", "Seal no."))}</th><th>${esc(L("లోడ్ చేసింది", "Loaded"))}</th><th>${esc(L("అందింది", "Arrived"))}</th><th>${esc(L("తిరిగి వచ్చింది", "Came back"))}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sign"><div>${esc(L("లోడ్ చేసినవారు", "Loaded by"))}</div><div>${esc(L("డ్రైవర్", "Driver"))}</div><div>${esc(L("వేదిక వద్ద తీసుకున్నవారు", "Received at the venue"))}</div></div>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

function NewDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { L, lang } = useLang();
  const [title, setTitle] = useState("");
  const [menu, setMenu] = useState<string[]>([]);
  const [rows, setRows] = useState([{ kind: "food", name: "", qty: "", unit: "kg", container: "", seal: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** X39: quantities from the cooking plan (eventPlan). `parts` = the event's sessions; `sessionId` = the one this load is for. */
  const [parts, setParts] = useState<PlanPart[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const fillFromPlan = (part: PlanPart) => {
    const name = (d: { nameTe: string; nameEn: string }) => ((lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe) || "").trim();
    const dishes = part.dishes.filter((d) => name(d));
    setSessionId(part.sessionId);
    setRows((cur) => {
      const next = cur.filter((r) => r.name.trim() || r.qty);
      for (const d of dishes) {
        const n = name(d);
        const qty = d.qty !== null && d.qty > 0 ? String(d.qty) : "";
        const at = next.findIndex((r) => r.kind === "food" && r.name.trim().toLowerCase() === n.toLowerCase());
        if (at >= 0) next[at] = { ...next[at], qty: qty || next[at].qty, unit: qty ? d.unit || next[at].unit : next[at].unit };
        else next.push({ kind: "food", name: n, qty, unit: d.unit || "kg", container: "", seal: "" });
      }
      return next.length ? next : cur;
    });
    const missing = dishes.filter((d) => d.qty === null || d.qty <= 0).length;
    setPlanNote(dishes.length === 0 ? L("ఈ ప్లాన్‌లో వంటకాలు లేవు.", "This plan has no dishes.") : missing ? L(`${missing} వంటకాలకు ప్లాన్‌లో పరిమాణం ఇంకా లేదు (నేర్చుకోలేదు) — అవి మీరే రాయండి.`, `${missing} dishes have no quantity in the plan yet (not learned) — enter those yourself.`) : L("అన్ని వంటకాల పరిమాణాలు వంట ప్లాన్ నుంచి వచ్చాయి — సరిచూసి సేవ్ చేయండి.", "All quantities came from the cooking plan — check them, then save."));
  };
  const loadPlan = async () => {
    setPlanBusy(true);
    setError(null);
    setPlanNote(null);
    try {
      const r = await eventPlan({ bookingId });
      setParts(r.parts);
      if (r.parts.length === 1) fillFromPlan(r.parts[0]);
      else if (r.parts.length === 0) setPlanNote(L("ఈ బుకింగ్‌కు వంట ప్లాన్ లేదు.", "This booking has no cooking plan."));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setPlanBusy(false);
    }
  };
  useEffect(() => {
    void getDoc(doc(db, "bookings", bookingId))
      .then((s) => {
        const b = s.data() ?? {};
        setTitle(str(b.customerNameSnapshot));
        const own = Array.isArray(b.menuSnapshot) ? b.menuSnapshot : [];
        const inSessions = Array.isArray(b.sessions) ? b.sessions.flatMap((x: DocumentData) => (Array.isArray(x?.menuSnapshot) ? x.menuSnapshot : [])) : [];
        setMenu([...new Set([...own, ...inSessions].map((m: DocumentData) => str(m?.name).trim()).filter(Boolean))].slice(0, 150));
      })
      .catch(() => undefined);
  }, [bookingId]);
  const set = (i: number, p: Partial<(typeof rows)[number]>) => setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const valid = rows.length > 0 && rows.every((r) => r.name.trim() && Number(r.qty) > 0);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveDispatch({ bookingId, ...(sessionId ? { sessionId } : {}), lines: rows.map((r) => ({ kind: r.kind, name: r.name.trim(), qty: Number(r.qty), unit: r.unit.trim(), container: r.container.trim(), seal: r.seal.trim() })) });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="md">
      <DialogTitle>
        {L("కొత్త పంపిణీ జాబితా", "New dispatch list")}
        {title ? ` — ${title}` : ""}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
        {rows.map((r, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" label={L("రకం", "Type")} value={r.kind} onChange={(e) => set(i, { kind: e.target.value, unit: e.target.value === "food" ? r.unit : "pcs" })} sx={{ minWidth: 150 }}>
              {KINDS.map((k) => (
                <MenuItem key={k.code} value={k.code}>
                  {L(k.te, k.en)}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label={L("పేరు", "Name")} value={r.name} onChange={(e) => set(i, { name: e.target.value })} sx={{ flex: "2 1 180px" }} />
            <TextField size="small" label={L("పరిమాణం", "Quantity")} value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} sx={{ width: 100 }} />
            <TextField size="small" label={L("కొలత", "Unit")} value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} sx={{ width: 80 }} />
            {r.kind === "food" && (
              <>
                <TextField size="small" label={L("పాత్ర", "Container")} value={r.container} onChange={(e) => set(i, { container: e.target.value })} sx={{ width: 120 }} />
                <TextField size="small" label={L("సీల్ నంబర్", "Seal no.")} value={r.seal} onChange={(e) => set(i, { seal: e.target.value })} sx={{ width: 110 }} />
              </>
            )}
            <IconButton aria-label={L("వరుస తీసేయి", "Remove line")} onClick={() => setRows((cur) => cur.filter((_, k) => k !== i))} disabled={rows.length === 1}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Box>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setRows((cur) => [...cur, { kind: cur[cur.length - 1]?.kind ?? "food", name: "", qty: "", unit: cur[cur.length - 1]?.kind === "food" ? "kg" : "pcs", container: "", seal: "" }])}>
            {L("వరుస చేర్చు", "Add a line")}
          </Button>
          {menu.length > 0 && (
            <Button
              size="small"
              onClick={() =>
                setRows((cur) => {
                  const have = new Set(cur.map((r) => r.name.trim()));
                  const add = menu.filter((n) => !have.has(n)).map((n) => ({ kind: "food", name: n, qty: "", unit: "kg", container: "", seal: "" }));
                  return [...cur.filter((r) => r.name.trim() || r.qty), ...add];
                })
              }
            >
              {L(`బుకింగ్ మెనూ నుంచి నింపు (${menu.length})`, `Fill from the booking menu (${menu.length})`)}
            </Button>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button size="small" variant="outlined" onClick={() => void loadPlan()} disabled={planBusy}>
            {L("వంట ప్లాన్ నుంచి పరిమాణాలు", "Quantities from the cooking plan")}
          </Button>
          {parts && parts.length > 1 && (
            <TextField select size="small" label={L("ఏ సెషన్ లోడ్", "Which session")} value={parts.some((p) => p.sessionId === sessionId) ? sessionId : ""} onChange={(e) => { const p = parts.find((x) => x.sessionId === e.target.value); if (p) fillFromPlan(p); }} sx={{ minWidth: 220 }}>
              {parts.map((p) => (
                <MenuItem key={p.sessionId || "-"} value={p.sessionId}>
                  {L(p.labelTe || p.labelEn, p.labelEn || p.labelTe)}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
        {planNote && <Alert severity="info">{planNote}</Alert>}
        {menu.length > 0 && <Typography variant="caption" color="text.secondary">{L("మెనూ బటన్ నుంచి పేర్లు మాత్రమే వస్తాయి; పరిమాణాలు కావాలంటే \"వంట ప్లాన్\" బటన్ నొక్కండి.", "The menu button fills names only; for quantities press the \"cooking plan\" button.")}</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Cancel")}
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={!valid || busy}>
          {L("జాబితా సేవ్", "Save the list")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** One step of a dispatch: asks only for what that step needs, then calls advanceDispatch. */
function StepDialog({ d, onClose }: { d: Dispatch; onClose: () => void }) {
  const { L, lang } = useLang();
  const next = NEXT[str(d.status)];
  const lines = (Array.isArray(d.lines) ? d.lines : []) as Line[];
  const sent = (l: Line) => l.deliveredQty ?? l.loadedQty ?? l.qty;
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [String(l.line), String(next.step === "loaded" ? l.qty : next.step === "delivered" ? (l.loadedQty ?? l.qty) : next.step === "returned" ? sent(l) : "")])));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [vehicleName, setVehicleName] = useState(str(d.vehicleName));
  const [driverName, setDriverName] = useState(str(d.driverName));
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => {
    if (next.step !== "loaded") return;
    return subscribeVehicles(str(d.branchId) || null, (v) => setVehicles(v.filter((x) => !x.cancelled)), () => setVehicles([]));
  }, [next.step, d.branchId]);
  const shown = next.step === "returned" || next.step === "reconciled" ? lines.filter((l) => returnable(l.kind)) : lines;
  const missing = (l: Line) => Math.round((sent(l) - (l.returnedQty ?? 0)) * 1000) / 1000;
  const numbers = () => Object.fromEntries(Object.entries(qtys).filter(([, v]) => v !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await advanceDispatch({
        id: d.id,
        step: next.step,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(next.step === "loaded" ? { loaded: numbers(), vehicleName: vehicleName.trim(), driverName: driverName.trim() } : {}),
        ...(next.step === "delivered" ? { delivered: numbers(), receiverName: receiverName.trim(), receiverPhone: receiverPhone.trim() } : {}),
        ...(next.step === "returned" ? { returned: numbers() } : {}),
        ...(next.step === "reconciled" ? { reasons } : {}),
      });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const needsQty = next.step === "loaded" || next.step === "delivered" || next.step === "returned";
  const ready = (next.step !== "loaded" || vehicleName.trim() !== "") && (next.step !== "delivered" || receiverName.trim() !== "");

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        {str(d.number)} — {L(next.te, next.en)}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
        {next.step === "loaded" && (
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <Autocomplete
              freeSolo
              size="small"
              options={vehicles.map((v) => v.number)}
              inputValue={vehicleName}
              onInputChange={(_, v) => {
                setVehicleName(v);
                const hit = vehicles.find((x) => x.number === v);
                if (hit?.driver && !driverName.trim()) setDriverName(hit.driver);
              }}
              renderInput={(p) => <TextField {...p} label={L("వాహనం (నంబర్ / పేరు)", "Vehicle (number / name)")} />}
            />
            <TextField size="small" label={L("డ్రైవర్", "Driver")} value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </Box>
        )}
        {next.step === "delivered" && (
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField size="small" label={L("వేదిక వద్ద తీసుకున్నవారి పేరు", "Received at the venue by")} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
            <TextField size="small" label={L("వారి ఫోన్ (ఐచ్ఛికం)", "Their phone (optional)")} value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} />
          </Box>
        )}
        {(needsQty || next.step === "reconciled") &&
          shown.map((l) => (
            <Box key={l.line} sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", borderBottom: 1, borderColor: "divider", pb: 0.75 }}>
              <Typography variant="body2" sx={{ flex: "1 1 200px" }}>
                {l.name} · {next.step === "reconciled" ? L(`పంపింది ${sent(l)}, వచ్చింది ${l.returnedQty ?? 0}`, `sent ${sent(l)}, back ${l.returnedQty ?? 0}`) : `${next.step === "loaded" ? l.qty : next.step === "delivered" ? (l.loadedQty ?? l.qty) : sent(l)} ${l.unit}`}
                {l.container ? ` · ${l.container}` : ""}
              </Typography>
              {needsQty && <TextField size="small" label={next.step === "loaded" ? L("లోడ్ చేసింది", "Loaded") : next.step === "delivered" ? L("అందింది", "Arrived") : L("తిరిగి వచ్చింది", "Came back")} value={qtys[String(l.line)] ?? ""} onChange={(e) => setQtys((q) => ({ ...q, [String(l.line)]: e.target.value }))} slotProps={{ htmlInput: { inputMode: "decimal" } }} sx={{ width: 130 }} />}
              {next.step === "reconciled" && missing(l) > 0 && <TextField size="small" label={L(`${missing(l)} రాలేదు — కారణం`, `${missing(l)} missing — reason`)} value={reasons[String(l.line)] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [String(l.line)]: e.target.value }))} sx={{ flex: "1 1 220px" }} />}
            </Box>
          ))}
        {next.step === "reconciled" && shown.every((l) => missing(l) <= 0) && <Alert severity="success">{L("పంపినవన్నీ తిరిగి వచ్చాయి.", "Everything that was sent came back.")}</Alert>}
        <TextField size="small" label={next.step === "loaded" ? L("గమనిక (పూర్తిగా లోడ్ కాకపోతే కారణం తప్పనిసరి)", "Note (the reason is required if something was not fully loaded)") : L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Cancel")}
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy || !ready}>
          {L(next.te, next.en)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Module 5f — packing and dispatch (spec §32, §33). A dispatch list is started from a booking ("పంపిణీ" on the
 * booking page → /dispatch?bookingId=…). Then one button at a time: packed → load check → left → arrived →
 * count what came back → close the count. Staff assigned to the event can do the steps; closing the count and
 * cancelling are for the owner / manager.
 */
export function DispatchPage() {
  const { L, lang } = useLang();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const level = profile?.role ?? "staff";
  const [rows, setRows] = useState<Dispatch[]>([]);
  const [stepping, setStepping] = useState<Dispatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const newFor = params.get("bookingId") ?? "";

  useEffect(() => {
    if (!profile) return;
    const base = collection(db, "dispatches");
    const q = level === "admin" ? (currentBranchId ? query(base, where("branchId", "==", currentBranchId)) : query(base)) : level === "manager" && profile.branchId ? query(base, where("branchId", "==", profile.branchId)) : profile.staffId ? query(base, where("assignedStaffIds", "array-contains", profile.staffId)) : null;
    if (!q) return;
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d): Dispatch => ({ ...d.data(), id: d.id })).sort((a, b) => str(b.number).localeCompare(str(a.number))).slice(0, 100)),
      () => setRows([]),
    );
  }, [profile, level, currentBranchId]);

  const open = useMemo(() => rows.filter((r) => !["reconciled", "cancelled"].includes(str(r.status))), [rows]);
  const done = useMemo(() => rows.filter((r) => ["reconciled", "cancelled"].includes(str(r.status))).slice(0, 20), [rows]);

  const card = (d: Dispatch) => {
    const st = STATUS[str(d.status)] ?? STATUS.packing;
    const lines = (Array.isArray(d.lines) ? d.lines : []) as Line[];
    const next = NEXT[str(d.status)];
    const mayStep = next && (level !== "staff" || next.step !== "reconciled");
    return (
      <Paper key={d.id} variant="outlined" sx={{ p: 1.5 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 700 }}>{str(d.number)}</Typography>
          <Chip size="small" color={st.color} label={L(st.te, st.en)} />
          <Typography variant="body2">
            {str(d.customerName)}
            {str(d.eventDay) ? ` · ${formatDay(str(d.eventDay), lang)}` : ""}
          </Typography>
          {str(d.vehicleName) && <Chip size="small" variant="outlined" label={`${str(d.vehicleName)}${str(d.driverName) ? ` · ${str(d.driverName)}` : ""}`} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {lines.map((l) => `${l.name} ${l.qty} ${l.unit}`).join(" · ")}
        </Typography>
        {Array.isArray(d.shortages) && d.shortages.length > 0 && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
            {L("తిరిగి రానివి", "Did not come back")}: {(d.shortages as { name: string; missing: number; reason: string }[]).map((s) => `${s.name} ${s.missing} (${s.reason})`).join(" · ")}
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
          {mayStep && (
            <Button size="small" variant="contained" onClick={() => setStepping(d)}>
              {L(next.te, next.en)}
            </Button>
          )}
          {str(d.status) !== "cancelled" && (
            <Button
              size="small"
              onClick={() => {
                if (!printSheet(d, L, str(d.eventDay) ? formatDay(str(d.eventDay), lang) : "")) setError(L("ప్రింట్ విండో తెరుచుకోలేదు — బ్రౌజర్‌లో pop-up అనుమతించండి.", "The print window did not open — allow pop-ups in the browser."));
              }}
            >
              {L("లోడ్ జాబితా ప్రింట్", "Print the load sheet")}
            </Button>
          )}
          {level !== "staff" && ["packing", "packed", "loaded"].includes(str(d.status)) && (
            <Button
              size="small"
              color="error"
              onClick={() => {
                const reason = (window.prompt(L("ఈ పంపిణీ రద్దు చేయడానికి కారణం రాయండి", "Why are you cancelling this dispatch?")) ?? "").trim();
                if (reason) cancelDispatch({ id: d.id, reason }).catch((e) => setError(errorText(e, lang)));
              }}
            >
              {L("రద్దు", "Cancel")}
            </Button>
          )}
        </Box>
      </Paper>
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader title={L("ప్యాకింగ్ & పంపిణీ", "Packing & dispatch")} />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2 }}>
        {L("కొత్త పంపిణీ జాబితా మొదలుపెట్టడానికి బుకింగ్ తెరలో \"పంపిణీ\" బటన్ నొక్కండి.", "To start a new dispatch list, press \"Dispatch\" on the booking page.")}
      </Alert>
      <Box sx={{ display: "grid", gap: 1 }}>
        {open.length === 0 && <Typography color="text.secondary">{L("ఇప్పుడు నడుస్తున్న పంపిణీలు లేవు.", "No dispatch is in progress.")}</Typography>}
        {open.map(card)}
      </Box>
      {done.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
            {L("ముగిసినవి", "Finished")}
          </Typography>
          <Box sx={{ display: "grid", gap: 1 }}>{done.map(card)}</Box>
        </>
      )}
      {newFor && level !== "staff" && <NewDialog bookingId={newFor} onClose={() => setParams({}, { replace: true })} />}
      {stepping && <StepDialog d={stepping} onClose={() => setStepping(null)} />}
    </Box>
  );
}
