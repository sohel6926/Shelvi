import { useEffect, useState } from "react";
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
  TextField,
  Typography,
} from "@mui/material";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBusinessSettings } from "../../data/settingsRepository";
import { canOverride, MIN_REASON } from "../../data/calcMode";
import {
  applyEventStock,
  errorText,
  getServiceTimeline,
  groceryList,
  reverseEventStock,
  type GroceryLine,
  type ServiceTimeline,
  type ServiceTimelineRequest,
} from "../../data/functions";
import type { Booking } from "../../data/bookingRepository";
import type { TimelineRole, TimelineStep } from "../../util/timeline";
import { formatDay } from "../../util/dates";
import { tokens } from "../../theme/tokens";

function guestsOf(b: Booking): number {
  return b.guestCountActual || b.guestCountConfirmed || b.guestCount;
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// ---------------------------------------------------------------------------------------------
// Stock card (contract Round 6 A)
// ---------------------------------------------------------------------------------------------

export function EventStockCard({ booking }: { booking: Booking }) {
  const { L, T, lang } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { settings } = useBusinessSettings();
  const sd = booking.stockDeduction;
  const active = !!sd && !sd.reversed;
  // Closed / cancelled events are locked (R7-9 / R7-3): no stock actions from the screen.
  const lockedEvent = booking.cancelled || booking.status === "Closed" || booking.closed !== null;
  const mayApply = (role === "admin" || role === "manager") && !active && !lockedEvent;
  const mayReverse = role === "admin" && active && !lockedEvent;
  const mayManual = canOverride(role, settings.managerCanOverride);

  const [applyOpen, setApplyOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [lines, setLines] = useState<(GroceryLine & { typed: string })[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function openApply() {
    setApplyOpen(true);
    setError(null);
    setReason("");
    setLines(null);
    try {
      const res = await groceryList({ guests: guestsOf(booking), eventTypeCode: booking.eventTypeCode });
      setLines(res.items.map((i) => ({ ...i, typed: fmtQty(i.quantity) })));
    } catch (e) {
      setLines([]);
      setError(errorText(e, lang));
    }
  }

  async function doApply() {
    setError(null);
    const changed = (lines ?? []).some((l) => l.typed.trim() !== fmtQty(l.quantity));
    let items: { groceryItemId: string; quantity: number }[] | undefined;
    if (changed) {
      if (!mayManual) {
        setError(L("చేతితో మార్చడానికి మీకు అనుమతి లేదు.", "You are not allowed to change quantities by hand."));
        return;
      }
      items = [];
      for (const l of lines ?? []) {
        const q = Number(l.typed.trim());
        if (!l.typed.trim() || !Number.isFinite(q) || q < 0) {
          setError(L(`${l.nameTe}: సరైన పరిమాణం ఇవ్వండి.`, `${l.nameEn}: enter a valid quantity.`));
          return;
        }
        items.push({ groceryItemId: l.groceryItemId, quantity: q });
      }
      if (reason.trim().length < MIN_REASON) {
        setError(L("చేతితో మార్చినందుకు కారణం రాయండి (కనీసం 3 అక్షరాలు).", "Write a reason for the changed quantities (at least 3 characters)."));
        return;
      }
    }
    setBusy(true);
    try {
      await applyEventStock({ bookingId: booking.id, ...(items ? { items, reason: reason.trim() } : {}) });
      setApplyOpen(false);
      setNotice(L("Stock నుండి తీసేశాం.", "Stock taken out."));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function doReverse() {
    setError(null);
    if (reason.trim().length < MIN_REASON) {
      setError(L("కారణం రాయండి (కనీసం 3 అక్షరాలు).", "Write a reason (at least 3 characters)."));
      return;
    }
    setBusy(true);
    try {
      await reverseEventStock({ bookingId: booking.id, reason: reason.trim() });
      setReverseOpen(false);
      setNotice(L("Stock తిరిగి చేర్చాం.", "Stock put back."));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const byName = sd && sd.by !== "auto" ? sd.by.name : "";

  return (
    <Paper sx={{ p: 2.5, mt: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography variant="h6" component="h2">
          {L("సరుకుల Stock", "Stock")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {sd && (
            <Chip
              size="small"
              label={sd.calcMode === "manual" ? `${L("మాన్యువల్", "Manual")}${byName ? ` · ${byName}` : ""}` : L("ఆటోమేటిక్", "Automatic")}
              variant={sd.calcMode === "manual" ? "outlined" : "filled"}
              color={sd.calcMode === "manual" ? "default" : "success"}
              sx={sd.calcMode === "manual" ? { borderColor: tokens.color.gold, borderWidth: 2, color: tokens.color.goldDeep } : undefined}
            />
          )}
          {sd?.reversed && <Chip size="small" color="warning" label={L("తిరిగి చేర్చారు", "Reversed")} />}
        </Box>
      </Box>

      {!sd ? (
        <Typography color="text.secondary">
          {settings.autoStockDeduct
            ? L("Event 'పూర్తి' అయినప్పుడు సరుకులు stock నుండి దానంతట అదే తగ్గుతాయి.", "Groceries come out of stock automatically when the event is marked Completed.")
            : L("ఆటోమేటిక్ stock తగ్గింపు ఆఫ్‌లో ఉంది — కింద బటన్‌తో చేయండి.", "Automatic stock deduction is off — use the button below.")}
        </Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {sd.at?.toLocaleString(dateLocale(lang), { dateStyle: "medium", timeStyle: "short" })}
            {sd.by === "auto" ? ` · ${L("దానంతట అదే", "automatic")}` : byName ? ` · ${byName}` : ""}
          </Typography>
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
            <tbody>
              {sd.items.map((i) => (
                <Box component="tr" key={i.groceryItemId} sx={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                  <Box component="td" sx={{ py: 0.75, pr: 1 }}>
                    {T({ te: i.nameTe, en: i.nameEn })}
                  </Box>
                  <Box component="td" sx={{ py: 0.75, textAlign: "right", whiteSpace: "nowrap" }}>
                    {fmtQty(i.quantity)} {i.unit}
                    {i.autoValue !== null && i.autoValue !== i.quantity && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {L("ఆటోమేటిక్", "auto")}: {fmtQty(i.autoValue)} {i.unit}
                      </Typography>
                    )}
                  </Box>
                  <Box component="td" sx={{ py: 0.75, pl: 1, textAlign: "right" }}>
                    {i.shortBy > 0 && (
                      <Chip
                        size="small"
                        color="error"
                        label={L(`${fmtQty(i.shortBy)} ${i.unit} తక్కువ ఉంది`, `short by ${fmtQty(i.shortBy)} ${i.unit}`)}
                      />
                    )}
                  </Box>
                </Box>
              ))}
            </tbody>
          </Box>
          {sd.items.some((i) => i.shortBy > 0) && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {L("కొన్ని సరుకులు stock లో సరిపోలేదు — stock 0 దగ్గర ఆగింది. కొనుగోళ్లు నమోదు చేయండి.", "Some items were short — stock stopped at 0. Record the purchases.")}
            </Alert>
          )}
          {sd.skipped.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {L("Stock తో జత చేయని సరుకులు (వదిలేశాం)", "Not linked to stock (skipped)")}:{" "}
              {sd.skipped.map((s) => T({ te: s.nameTe, en: s.nameEn }) || s.groceryItemId).join(", ")}
            </Typography>
          )}
        </>
      )}

      {notice && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {notice}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
        {mayApply && (
          <Button variant="contained" onClick={openApply}>
            {sd?.reversed ? L("మళ్ళీ stock నుండి తీసేయి", "Take out of stock again") : L("ఇప్పుడే stock నుండి తీసేయి", "Take out of stock now")}
          </Button>
        )}
        {mayReverse && (
          <Button
            color="warning"
            variant="outlined"
            onClick={() => {
              setReason("");
              setError(null);
              setReverseOpen(true);
            }}
          >
            {L("Stock తిరిగి చేర్చు", "Put stock back")}
          </Button>
        )}
      </Box>

      <Dialog open={applyOpen} onClose={() => !busy && setApplyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{L("ఈ event కి stock నుండి తీసేయడం", "Take this event's groceries out of stock")}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
          <Typography variant="body2" color="text.secondary">
            {L(
              `${guestsOf(booking)} మంది అతిథులకి ఆటోమేటిక్ పరిమాణాలు. మార్చితే కారణం తప్పనిసరి.`,
              `Automatic quantities for ${guestsOf(booking)} guests. A reason is required if you change them.`,
            )}
          </Typography>
          {lines === null ? (
            <CircularProgress size={22} />
          ) : (
            lines.map((l, idx) => (
              <Box key={l.groceryItemId} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography sx={{ flex: 1 }}>{T({ te: l.nameTe, en: l.nameEn })}</Typography>
                <TextField
                  size="small"
                  value={l.typed}
                  disabled={!mayManual}
                  inputMode="decimal"
                  onChange={(e) => setLines((prev) => (prev ?? []).map((x, j) => (j === idx ? { ...x, typed: e.target.value } : x)))}
                  sx={{ width: 110 }}
                />
                <Typography sx={{ width: 36 }}>{l.unit}</Typography>
              </Box>
            ))
          )}
          {mayManual && (
            <TextField
              label={L("కారణం (పరిమాణాలు మార్చితే)", "Reason (if you changed quantities)")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              multiline
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyOpen(false)} disabled={busy}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={doApply} disabled={busy || lines === null}>
            {busy ? L("చేస్తున్నాం…", "Working…") : L("Stock నుండి తీసేయి", "Take out of stock")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reverseOpen} onClose={() => !busy && setReverseOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{L("Stock తిరిగి చేర్చాలా?", "Put the stock back?")}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, pt: "8px !important" }}>
          <Typography variant="body2">
            {L("ఈ event కి తీసేసిన సరుకులన్నీ stock లోకి తిరిగి వస్తాయి.", "Everything taken out for this event goes back into stock.")}
          </Typography>
          <TextField label={L("కారణం (తప్పనిసరి)", "Reason (required)")} value={reason} onChange={(e) => setReason(e.target.value)} multiline />
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReverseOpen(false)} disabled={busy}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button color="warning" variant="contained" onClick={doReverse} disabled={busy}>
            {L("తిరిగి చేర్చు", "Put back")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

// ---------------------------------------------------------------------------------------------
// Service timeline card (calc §12 — computed by the server's getServiceTimeline)
// ---------------------------------------------------------------------------------------------

const ROLE_LABEL: Record<TimelineRole, { te: string; en: string }> = {
  manager: { te: "మేనేజర్", en: "Manager" },
  cook: { te: "వంటవారు", en: "Cook" },
  helper: { te: "సహాయకులు", en: "Helper" },
  driver: { te: "డ్రైవర్", en: "Driver" },
  all: { te: "అందరూ", en: "Everyone" },
};

function time12(hhmm: string, lang: "te" | "en"): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString(dateLocale(lang), { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/**
 * Event-day timeline. `request` = `{ bookingId }` on the booking detail, or the form's values for a
 * preview. `reloadKey` changes → ask the server again (e.g. after the booking was saved).
 */
export function ServiceTimelineCard({
  request,
  reloadKey,
  title,
}: {
  request: ServiceTimelineRequest;
  reloadKey?: string;
  title?: string;
}) {
  const { L, T, lang } = useLang();
  const [data, setData] = useState<ServiceTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(request) + (reloadKey ?? "");

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    getServiceTimeline(request)
      .then((d) => alive && setData(d))
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setError(errorText(e, lang));
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [key, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventDay = data?.steps.find((s) => s.key === "serveStart")?.day;
  const usedDefaults = Array.isArray(data?.defaultsUsed) ? data.defaultsUsed.length > 0 : data?.defaultsUsed === true;

  return (
    <Paper sx={{ p: 2.5, mt: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Typography variant="h6" component="h2">
          {title ?? L("Event రోజు timeline", "Event-day timeline")}
        </Typography>
        {busy && <CircularProgress size={18} />}
      </Box>
      {data && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {L(
            `వడ్డన ${time12(data.serveTime, lang)} · ప్రయాణం ${data.travelMinutes} ని.`,
            `Serving ${time12(data.serveTime, lang)} · travel ${data.travelMinutes} min`,
          )}
          {usedDefaults && L(" (కొన్ని విలువలు సాధారణ సమయాలతో)", " (some values are defaults)")}
        </Typography>
      )}
      {error && <Alert severity="warning">{error}</Alert>}
      {data && (
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 0.75 }}>
          {data.steps.map((s: TimelineStep) => (
            <Box
              component="li"
              key={s.key}
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "92px 1fr", sm: "130px 1fr auto" },
                gap: 1,
                alignItems: "center",
                py: 0.5,
                borderBottom: `1px solid ${tokens.color.border}`,
              }}
            >
              <Box sx={{ fontVariantNumeric: "tabular-nums" }}>
                <Typography sx={{ fontWeight: 600 }}>{time12(s.time, lang)}</Typography>
                {eventDay && s.day !== eventDay && (
                  <Typography variant="caption" color="text.secondary">
                    {s.day < eventDay ? L("ముందు రోజు", "day before") : L("తర్వాతి రోజు", "next day")} · {formatDay(s.day, lang)}
                  </Typography>
                )}
              </Box>
              <Typography>{lang === "te" ? s.te : s.en || s.te}</Typography>
              <Chip
                size="small"
                label={ROLE_LABEL[s.role] ? T(ROLE_LABEL[s.role]) : s.role}
                sx={{ justifySelf: { xs: "start", sm: "end" }, gridColumn: { xs: "2", sm: "auto" } }}
              />
            </Box>
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {L("ముందు రోజు staff కి ఈ timeline agent పంపుతుంది.", "The readiness agent sends this timeline to assigned staff the day before.")}
      </Typography>
    </Paper>
  );
}
