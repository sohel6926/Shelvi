import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Rating,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import type { Staff } from "../../data/records";
import { addStaffAdvance, errorText, listStaffAdvances, type StaffAdvanceRow } from "../../data/functions";
import { subscribeStaffRatings, subscribeStaffShifts, type Shift, type StaffRating, type Who } from "../../data/staffWorkRepository";
import { CancelButton } from "../../components/CancelControls";
import { formatMoney } from "../../util/format";
import { formatDay, istDay, istMonth } from "../../util/dates";
import { parseMoney } from "../../components/ui";
import { tabularNums, tokens } from "../../theme/tokens";

const ADV_STATUS: Record<string, { te: string; en: string; color: "default" | "warning" | "success" }> = {
  Open: { te: "కోత మిగిలింది", en: "Open", color: "warning" },
  Recovered: { te: "తీరింది", en: "Recovered", color: "success" },
  Cancelled: { te: "రద్దు", en: "Cancelled", color: "default" },
  Old: { te: "పాతది", en: "Old", color: "default" },
};

/** "2026-12" → next month helper for the default recover month (display default; the server defaults the same). */
function nextMonthOf(day: string): string {
  const [y, m] = day.slice(0, 7).split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** R10-1 advances (entry + list with balance) and R10-2 shifts / ratings for one staff member. */
export function StaffDetailDialog({ staff, who, onClose }: { staff: Staff | null; who: Who; onClose: () => void }) {
  const { L, T, lang } = useLang();
  const canMoneyRole = who.role === "admin" || who.role === "manager";
  const [tab, setTab] = useState(canMoneyRole ? 0 : 1);
  const [adv, setAdv] = useState<{ advances: StaffAdvanceRow[]; balance: number } | null>(null);
  const [advError, setAdvError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(istDay());
  const [recoverMonth, setRecoverMonth] = useState(nextMonthOf(istDay()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [ratings, setRatings] = useState<StaffRating[]>([]);
  const canMoney = who.role === "admin" || who.role === "manager";
  const staffId = staff?.id ?? "";

  const loadAdv = useCallback(async () => {
    if (!staffId || !canMoney) return;
    setAdvError(null);
    try {
      setAdv(await listStaffAdvances({ staffId }));
    } catch (e) {
      setAdvError(errorText(e, lang));
    }
  }, [staffId, canMoney, lang]);

  useEffect(() => {
    setAdv(null);
    setMsg(null);
    setTab(canMoneyRole ? 0 : 1);
    void loadAdv();
  }, [loadAdv, canMoneyRole]);

  useEffect(() => (staffId ? subscribeStaffShifts(staffId, who, setShifts, () => setShifts([])) : undefined), [staffId, who]);
  useEffect(() => (staffId ? subscribeStaffRatings(staffId, who, setRatings, () => setRatings([])) : undefined), [staffId, who]);

  const amt = parseMoney(amount);
  const amtOk = typeof amt === "number" && Number.isFinite(amt) && amt >= 0.01;
  const monthOk = /^\d{4}-\d{2}$/.test(recoverMonth) && recoverMonth >= date.slice(0, 7);

  async function add() {
    if (!staff || !amtOk || !monthOk) return;
    setBusy(true);
    setAdvError(null);
    setMsg(null);
    try {
      const r = await addStaffAdvance({ staffId: staff.id, amount: amt as number, date, recoverMonth, ...(note.trim() ? { note: note.trim() } : {}) });
      setMsg(T(r.text));
      setAmount("");
      setNote("");
      await loadAdv();
    } catch (e) {
      setAdvError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const thisMonth = staff?.ratings[istMonth()];
  const months = Object.entries(staff?.ratings ?? {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  return (
    <Dialog open={!!staff} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {staff?.name}
        {staff?.jobRole ? ` · ${staff.jobRole}` : ""}
      </DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
          {canMoney && <Tab value={0} label={L("అడ్వాన్స్‌లు", "Advances")} />}
          <Tab value={1} label={L("Shifts", "Shifts")} />
          <Tab value={2} label={L("రేటింగ్", "Ratings")} />
        </Tabs>

        {tab === 0 && canMoney && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 1.5 }}>
              <Typography sx={{ fontWeight: 600 }}>{L("కొత్త అడ్వాన్స్", "New advance")}</Typography>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" } }}>
                <TextField
                  label={L("మొత్తం ₹", "Amount ₹")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  error={!!amount && !amtOk}
                  slotProps={{ htmlInput: { inputMode: "decimal" } }}
                />
                <TextField type="date" label={L("ఇచ్చిన తేదీ", "Given on")} value={date} onChange={(e) => { setDate(e.target.value); setRecoverMonth(nextMonthOf(e.target.value || istDay())); }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: istDay() } }} />
                <TextField
                  type="month"
                  label={L("ఏ నెల జీతంలో కోత", "Recover from pay of")}
                  value={recoverMonth}
                  onChange={(e) => setRecoverMonth(e.target.value)}
                  error={!monthOk}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
              <TextField label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
              <Typography variant="body2" color="text.secondary">
                {L(
                  "ఆ నెల జీతం కంటే ఎక్కువ అయితే మిగతాది వచ్చే నెలకి వెళ్తుంది. కోత లెక్క server చేస్తుంది.",
                  "If it is more than that month's pay, the rest moves to the next month. The server works out the cut.",
                )}
              </Typography>
              <Box>
                <Button variant="contained" onClick={add} disabled={busy || !amtOk || !monthOk}>
                  {busy ? <CircularProgress size={20} color="inherit" /> : L("అడ్వాన్స్ నమోదు", "Record advance")}
                </Button>
              </Box>
              {msg && <Alert severity="success">{msg}</Alert>}
              {advError && <Alert severity="error">{advError}</Alert>}
            </Paper>

            {!adv ? (
              !advError && <CircularProgress size={22} />
            ) : (
              <>
                <Typography sx={{ ...tabularNums, fontWeight: 600 }}>
                  {L("ఇంకా కోయాల్సింది", "Balance to recover")}: {formatMoney(adv.balance)}
                </Typography>
                {adv.advances.length === 0 ? (
                  <Typography color="text.secondary">{L("అడ్వాన్స్‌లు లేవు.", "No advances.")}</Typography>
                ) : (
                  <Box sx={{ display: "grid", gap: 1 }}>
                    {adv.advances.map((a) => {
                      const st = ADV_STATUS[a.status] ?? ADV_STATUS.Open;
                      return (
                        <Paper key={a.id} variant="outlined" sx={{ p: 1.5, display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                          <Box>
                            <Typography sx={{ ...tabularNums, fontWeight: 600 }}>
                              {formatMoney(a.amount)} · {formatDay(a.date, lang)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {L("కోత నెల", "Recover in")} {a.recoverMonth} · {L("కోసింది", "recovered")} {formatMoney(a.recovered)} · {L("మిగిలింది", "left")} {formatMoney(a.balance)}
                              {a.note ? ` · ${a.note}` : ""}
                            </Typography>
                          </Box>
                          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                            <Chip size="small" color={st.color} label={T(st)} />
                            {a.status === "Open" && a.recovered === 0 && <CancelButton collection="staffAdvances" id={a.id} what={formatMoney(a.amount)} onDone={loadAdv} />}
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ display: "grid", gap: 1 }}>
            {shifts.filter((s) => !s.cancelled).length === 0 ? (
              <Typography color="text.secondary">{L("Shifts లేవు. Booking పేజీలో shift వేయండి.", "No shifts. Add them on a booking.")}</Typography>
            ) : (
              shifts
                .filter((s) => !s.cancelled)
                .slice(0, 40)
                .map((s) => (
                  <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {formatDay(s.date, lang)} · {s.startTime}–{s.endTime} ({s.hours} {L("గం", "h")})
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {L(s.roleTe || s.role, s.role)} · {s.customer}
                    </Typography>
                  </Paper>
                ))
            )}
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 600 }}>{L("ఈ నెల సగటు", "This month's average")}:</Typography>
              {thisMonth && thisMonth.avg !== null ? (
                <>
                  <Rating value={thisMonth.avg} precision={0.1} readOnly size="small" />
                  <Typography sx={tabularNums}>
                    {thisMonth.avg} ({thisMonth.count})
                  </Typography>
                </>
              ) : (
                <Typography color="text.secondary">—</Typography>
              )}
            </Box>
            {months.length > 0 && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {months.map(([m, r]) => (
                  <Chip key={m} size="small" variant="outlined" label={`${m}: ★ ${r.avg ?? "—"} (${r.count})`} />
                ))}
              </Box>
            )}
            {ratings.filter((r) => !r.cancelled).map((r) => (
              <Paper key={r.id} variant="outlined" sx={{ p: 1.5, borderLeft: `4px solid ${r.stars >= 4 ? tokens.color.good : r.stars >= 3 ? tokens.color.warning : tokens.color.bad}` }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Rating value={r.stars} readOnly size="small" />
                  <Typography variant="body2">
                    {formatDay(r.day, lang)} · {r.customer} · {r.byName}
                  </Typography>
                </Box>
                {r.note && <Typography variant="body2">{r.note}</Typography>}
              </Paper>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("మూసివేయి", "Close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
