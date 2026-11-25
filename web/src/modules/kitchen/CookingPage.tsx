import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBusinessSettings } from "../../data/settingsRepository";
import { canOverride, MIN_REASON } from "../../data/calcMode";
import { cookingPlan, errorText, saveCookingPlan, type CookingLine } from "../../data/functions";
import { subscribeSavedCookingPlan, type SavedCookingLine } from "../../data/bookingRepository";
import { EVENT_TYPE_LABEL } from "../../i18n/eventLabels";
import { DataTable } from "../../components/DataTable";
import { CalcModeChip } from "../../components/CalcModeChip";
import { ScreenTitle } from "../../components/ui";
import { tokens } from "../../theme/tokens";
import { EMPTY_EVENT_INPUT, EventInputs, eventRef, packageOf, type EventInputValue } from "./EventInputs";

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** "వంట లెక్క": how much of each dish to cook (calc §5, learned from past leftovers). */
export function CookingPage() {
  const { L, T, lang } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { settings } = useBusinessSettings();
  const [params] = useSearchParams();
  const [input, setInput] = useState<EventInputValue>(EMPTY_EVENT_INPUT);
  const [lines, setLines] = useState<CookingLine[] | null>(null);
  const [saved, setSaved] = useState<Record<string, SavedCookingLine>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const guests = parseInt(input.guests, 10);
  const valid = Number.isInteger(guests) && guests >= 1;
  const booking = input.booking;
  const mayEdit = !!booking && canOverride(role, settings.managerCanOverride);
  const mayAutoSave = !!booking && (role === "admin" || role === "manager");

  async function load() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const pkg = packageOf(input);
      const res = await cookingPlan({
        guests,
        eventTypeCode: input.eventTypeCode,
        ...eventRef(input),
        ...(pkg ? { menuPackageId: pkg } : {}),
      });
      setLines(res.items);
    } catch (e) {
      setError(errorText(e, lang));
      setLines(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!valid) return;
    const t = window.setTimeout(() => void load(), 350);
    return () => window.clearTimeout(t);
  }, [input.guests, input.eventTypeCode, booking?.id, input.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saved plan of the selected booking (manual quantities + chips).
  useEffect(() => {
    setSaved({});
    setTyped({});
    if (!booking) return;
    return subscribeSavedCookingPlan(booking.id, setSaved, () => setSaved({}));
  }, [booking?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill the editable column: saved manual quantities, else the suggestion.
  useEffect(() => {
    if (!lines) return;
    setTyped(
      Object.fromEntries(
        lines.map((l) => {
          const s = saved[l.dishId];
          return [l.dishId, qty(s && s.calc.calcMode === "manual" ? s.quantity : l.quantity)];
        }),
      ),
    );
  }, [lines, saved]);

  async function savePlan() {
    if (!booking || !lines) return;
    setError(null);
    setNotice(null);
    const items: { dishId: string; quantity?: number; manual: boolean }[] = [];
    for (const l of lines) {
      const t = (typed[l.dishId] ?? "").trim();
      const n = Number(t);
      if (!t || !Number.isFinite(n) || n < 0) {
        setError(L(`${l.nameTe || l.nameEn}: సరైన పరిమాణం ఇవ్వండి.`, `${l.nameEn || l.nameTe}: enter a valid quantity.`));
        return;
      }
      const manual = mayEdit && qty(n) !== qty(l.quantity);
      items.push(manual ? { dishId: l.dishId, quantity: n, manual: true } : { dishId: l.dishId, manual: false });
    }
    const anyManual = items.some((i) => i.manual);
    if (anyManual && reason.trim().length < MIN_REASON) {
      setError(L("చేతితో మార్చిన పరిమాణాలకి కారణం రాయండి (కనీసం 3 అక్షరాలు).", "Write a reason for the changed quantities (at least 3 characters)."));
      return;
    }
    setSaving(true);
    try {
      await saveCookingPlan({ bookingId: booking.id, items, ...(anyManual ? { reason: reason.trim() } : {}) });
      setNotice(L("ఈ event కి వంట లెక్క save అయింది.", "Cooking plan saved for this event."));
      setReason("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  function adviceChip(l: CookingLine) {
    if (l.advice === "cut")
      return <Chip size="small" color="warning" label={L(`${Math.abs(l.changePct)}% తగ్గించండి`, `cut ${Math.abs(l.changePct)}%`)} />;
    if (l.advice === "add") return <Chip size="small" color="info" label={L(`${Math.abs(l.changePct)}% పెంచండి`, `add ${Math.abs(l.changePct)}%`)} />;
    return <Chip size="small" color="success" label={L("సరిపోతుంది", "OK")} />;
  }

  const heading = [
    booking?.customerNameSnapshot,
    booking?.eventDate?.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" }),
    valid ? L(`${guests} మంది`, `${guests} guests`) : "",
    T(EVENT_TYPE_LABEL[input.eventTypeCode]),
  ]
    .filter(Boolean)
    .join(" · ");
  const savedCount = Object.keys(saved).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, "@media print": { p: 0, maxWidth: "none" } }}>
      <Box sx={{ displayPrint: "none" }}>
        <ScreenTitle
          title={L("వంట లెక్క", "Cooking plan")}
          subtitle={L(
            "ప్రతి వంటకం ఎంత వండాలి — గత events లో మిగిలిన దాని నుండి నేర్చుకున్న లెక్క",
            "How much of each dish to cook — learned from leftovers at past events",
          )}
          onRefresh={load}
          action={
            <Button variant="outlined" startIcon={<PrintIcon />} disabled={!lines?.length} onClick={() => window.print()}>
              {L("ప్రింట్", "Print")}
            </Button>
          }
        />
        <EventInputs value={input} onChange={setInput} initialBookingId={params.get("booking")} initialSessionId={params.get("session")} />
        {!valid && <Alert severity="info">{L("అతిథుల సంఖ్య ఇవ్వండి (1 లేదా ఎక్కువ).", "Enter the number of guests (1 or more).")}</Alert>}
        {booking && !booking.packageId && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {L("ఈ బుకింగ్‌కి మెనూ ప్యాకేజీ లేదు — అన్ని వంటకాలు చూపిస్తున్నాం.", "This booking has no menu package — showing all dishes.")}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}
      </Box>

      <Box sx={{ display: "none", displayPrint: "block", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {L("వంట లెక్క", "Cooking plan")}
        </Typography>
        <Typography>{heading}</Typography>
      </Box>

      {busy && !lines && <CircularProgress />}
      {lines && (
        <>
          {booking && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, displayPrint: "none" }}>
              {savedCount
                ? L(`ఈ event కి save చేసిన లెక్క ఉంది (${savedCount} వంటకాలు).`, `A plan is saved for this event (${savedCount} dishes).`)
                : L("ఈ event కి ఇంకా లెక్క save చేయలేదు.", "No plan saved for this event yet.")}
            </Typography>
          )}
          <DataTable
            rows={lines}
            rowKey={(l) => l.dishId}
            emptyText={L("వంటకాల జాబితా ఖాళీగా ఉంది.", "No dishes found.")}
            columns={[
              { label: L("వంటకం", "Dish"), render: (l) => (lang === "te" ? l.nameTe || l.nameEn : l.nameEn || l.nameTe) },
              {
                label: L("వండాల్సింది", "To cook"),
                align: "right",
                render: (l) =>
                  mayEdit ? (
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                      <TextField
                        size="small"
                        value={typed[l.dishId] ?? ""}
                        onChange={(e) => setTyped((t) => ({ ...t, [l.dishId]: e.target.value }))}
                        inputMode="decimal"
                        sx={{ width: 96, displayPrint: "none" }}
                        helperText={(typed[l.dishId] ?? "") !== qty(l.quantity) ? L(`సూచన ${qty(l.quantity)}`, `suggested ${qty(l.quantity)}`) : undefined}
                      />
                      <Box component="span" sx={{ displayPrint: "none" }}>{l.unit}</Box>
                      <Box component="span" sx={{ display: "none", displayPrint: "inline" }}>
                        {typed[l.dishId]} {l.unit}
                      </Box>
                    </Box>
                  ) : (
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {qty(saved[l.dishId]?.calc.calcMode === "manual" ? saved[l.dishId].quantity : l.quantity)} {l.unit}
                    </Box>
                  ),
              },
              {
                label: L("100 మందికి (నేర్చుకున్నది)", "Per 100 (learned)"),
                align: "right",
                hideOnMobile: true,
                render: (l) => `${qty(Math.round(l.learnedPer100 * 100) / 100)} ${l.unit}`,
              },
              { label: L("సలహా", "Advice"), render: (l) => adviceChip(l) },
              {
                label: L("events", "Events"),
                align: "right",
                hideOnMobile: true,
                render: (l) => (l.eventsUsed ? l.eventsUsed : <Box component="span" sx={{ color: tokens.color.textSecondary }}>{L("ఇంకా లేదు", "none yet")}</Box>),
              },
              ...(booking
                ? [
                    {
                      label: L("లెక్క", "Mode"),
                      render: (l: CookingLine) =>
                        saved[l.dishId] ? (
                          <CalcModeChip meta={saved[l.dishId].calc} value={saved[l.dishId].quantity} format={(n) => `${qty(n)} ${l.unit}`} />
                        ) : (
                          "—"
                        ),
                    },
                  ]
                : []),
            ]}
          />
          {booking && mayAutoSave && (
            <Paper sx={{ p: 2, mt: 2, display: "grid", gap: 1.5, displayPrint: "none" }}>
              {mayEdit && (
                <TextField
                  label={L("కారణం (పరిమాణాలు మార్చితే తప్పనిసరి)", "Reason (required if you changed quantities)")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  multiline
                />
              )}
              <Box>
                <Button variant="contained" onClick={savePlan} disabled={saving}>
                  {saving ? L("Save అవుతోంది…", "Saving…") : L("ఈ event కి వంట లెక్క save చేయి", "Save the cooking plan for this event")}
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {L(
                  "మార్చని వంటకాలు ఆటోమేటిక్ (server లెక్క); మార్చినవి 'మాన్యువల్' గా, మీ పేరు, కారణంతో save అవుతాయి.",
                  "Unchanged dishes are saved as automatic; changed ones as manual with your name and reason.",
                )}
              </Typography>
            </Paper>
          )}
          {!booking && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, displayPrint: "none" }}>
              {L("ఒక బుకింగ్ ఎంచుకుంటే ఆ event కి లెక్క save చేయవచ్చు.", "Pick a booking to save the plan for that event.")}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
