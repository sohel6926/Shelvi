import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useLang, monthName } from "../../i18n/LanguageContext";
import { errorText, setYearTarget, type MonthPlan } from "../../data/functions";
import { subscribeYearTarget, type YearTargetDoc } from "../../data/targetsRepository";
import { useBusinessSettings } from "../../data/settingsRepository";
import { DataTable } from "../../components/DataTable";
import { CalcModeChip, ManualValueDialog } from "../../components/CalcModeChip";
import { AUTO_META } from "../../data/calcMode";
import { refreshFromServer } from "../../data/refresh";
import { doc } from "firebase/firestore";
import { db } from "../../firebase";
import { ErrorBox, parseWhole, rupees, ScreenTitle } from "../../components/ui";
import { istYear } from "../../util/dates";
import { tabularNums, tokens } from "../../theme/tokens";

/**
 * Year target (admin). The admin types the year target and margin; the setYearTarget callable
 * splits it over the months (season weights from settings) and re-plans after finished months
 * (calc-spec §4). This screen only shows what the server stored in targets/{year}.
 */
export function TargetsPage() {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const { settings } = useBusinessSettings();
  // Targets area in manual mode → show the "enter by hand" button on each month directly (fix 2 / h).
  const manualMode = settings.calcModes.targets === "manual";
  const [year, setYear] = useState(String(istYear()));
  const [target, setTarget] = useState<YearTargetDoc | null>(null);
  const [months, setMonths] = useState<MonthPlan[]>([]);
  const [aheadOrBehind, setAheadOrBehind] = useState<number | null>(null);
  const [amount, setAmount] = useState("15000000");
  const [margin, setMargin] = useState("25");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editMonth, setEditMonth] = useState<number | null>(null);

  const yearNum = parseWhole(year);

  useEffect(() => {
    if (!yearNum || yearNum < 2000 || yearNum > 2100) return;
    return subscribeYearTarget(
      yearNum,
      (t) => {
        setTarget(t);
        if (t) {
          setMonths(t.months);
          setAheadOrBehind(t.aheadOrBehind);
          if (t.yearTarget) setAmount(String(t.yearTarget));
          setMargin(String(t.profitMarginPct));
        } else {
          setMonths([]);
          setAheadOrBehind(null);
        }
      },
      (e) => setError(e.message),
    );
  }, [yearNum]);

  async function save() {
    setSaved(false);
    const y = parseWhole(year);
    const yt = parseWhole(amount.replace(/,/g, ""));
    const mp = Number(margin);
    if (!y || Number.isNaN(y) || !yt || Number.isNaN(yt) || yt <= 0) {
      setError(L("సంవత్సరం, లక్ష్యం (పూర్ణ రూపాయల్లో) సరిగా ఇవ్వండి.", "Enter a valid year and a whole-rupee target."));
      return;
    }
    if (!Number.isFinite(mp) || mp < 0 || mp > 100) {
      setError(L("లాభం % 0 నుండి 100 మధ్య ఉండాలి.", "Profit % must be between 0 and 100."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // No weights / manualMonths: the server keeps the year's stored values (contract audit fix 4).
      const res = await setYearTarget({ year: y, yearTarget: yt, profitMarginPct: mp });
      setMonths(res.months);
      if (typeof res.aheadOrBehind === "number") setAheadOrBehind(res.aheadOrBehind);
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  const rows = months.map((m, i) => ({ ...m, index: i }));

  /** Re-send the target with one month typed by hand (value) or back to automatic (null). */
  async function setMonthManual(index: number, value: number | null, reason?: string) {
    if (!target || !yearNum) return;
    const manualMonths = target.manualMonths.map((v, i) => (i === index ? value : v));
    const anyManual = manualMonths.some((v) => v !== null);
    // Only the typed months change; margin and weights are kept by the server (fix 4).
    // All nulls = the year is fully automatic again.
    const res = await setYearTarget({
      year: yearNum,
      yearTarget: target.yearTarget,
      manualMonths,
      ...(anyManual ? { manual: { reason: reason ?? target.calc.overrideReason ?? "" } } : {}),
    });
    setMonths(res.months);
  }
  const ytNum = Number(amount.replace(/,/g, "")) || 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <ScreenTitle
        title={L("సంవత్సర లక్ష్యం", "Year target")}
        subtitle={L(
          "లక్ష్యం పెట్టండి — నెలవారీ పంపకం, తిరిగి ప్లాన్ server చేస్తుంది.",
          "Set the target — the server splits it by month and re-plans as months finish.",
        )}
        onRefresh={() => (yearNum ? refreshFromServer(doc(db, "targets", String(yearNum)), doc(db, "settings", "business")) : Promise.resolve())}
        action={
          <Button variant="outlined" onClick={() => navigate("/targets/board")}>
            {L("లక్ష్య బోర్డు చూడండి", "Open target board")}
          </Button>
        }
      />
      <ErrorBox message={error} />
      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {L("లక్ష్యం save అయింది. నెలవారీ ప్లాన్ కింద ఉంది.", "Target saved. The monthly plan is below.")}
        </Alert>
      )}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "140px 1fr 160px" } }}>
          <TextField label={L("సంవత్సరం", "Year")} value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
          <TextField
            label={L("సంవత్సర ఆదాయ లక్ష్యం (₹)", "Year income target (₹)")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            helperText={ytNum > 0 ? rupees(ytNum) : " "}
          />
          <TextField
            label={L("లాభం %", "Profit %")}
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            inputMode="decimal"
            helperText={L("సాధారణంగా 25%", "Usually 25%")}
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {L(
            "నెలల బరువులు (season weights) వ్యాపార వివరాల పేజీలో మార్చవచ్చు.",
            "Season weights per month are set on the Business settings page.",
          )}
        </Typography>
        <Button variant="contained" sx={{ mt: 2 }} onClick={save} disabled={saving}>
          {saving ? L("Save అవుతోంది…", "Saving…") : L("లక్ష్యం save చేయి", "Save target")}
        </Button>
      </Paper>

      {target === null && months.length === 0 ? (
        <Typography color="text.secondary">{L(`${year} కి ఇంకా లక్ష్యం పెట్టలేదు.`, `No target set for ${year} yet.`)}</Typography>
      ) : (
        <>
          {aheadOrBehind !== null && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography sx={{ ...tabularNums, fontWeight: 600, color: aheadOrBehind >= 0 ? tokens.color.good : tokens.color.bad }}>
                {aheadOrBehind >= 0
                  ? L(`ప్లాన్ కంటే ${rupees(aheadOrBehind)} ముందు ఉన్నాం`, `${rupees(aheadOrBehind)} ahead of plan`)
                  : L(`ప్లాన్ కంటే ${rupees(-aheadOrBehind)} వెనకబడ్డాం`, `${rupees(-aheadOrBehind)} behind plan`)}
              </Typography>
            </Paper>
          )}
          <DataTable
            rows={rows}
            rowKey={(r) => String(r.index)}
            emptyText={L("నెలవారీ ప్లాన్ ఇంకా రాలేదు.", "No monthly plan yet.")}
            columns={[
              { label: L("నెల", "Month"), render: (r) => monthName(r.index, lang) },
              { label: L("మొదటి ప్లాన్", "Original"), align: "right", render: (r) => rupees(r.original) },
              {
                label: L("మార్చిన ప్లాన్", "Re-planned"),
                align: "right",
                render: (r) => (
                  <Box component="span" sx={{ fontWeight: r.revised !== r.original ? 600 : 400 }}>
                    {rupees(r.revised)}
                  </Box>
                ),
              },
              {
                label: L("తేడా", "Change"),
                align: "right",
                hideOnMobile: true,
                render: (r) => {
                  const d = r.revised - r.original;
                  if (d === 0) return "—";
                  return (
                    <Box component="span" sx={{ color: d > 0 ? tokens.color.warning : tokens.color.good }}>
                      {d > 0 ? "+" : "−"}
                      {rupees(Math.abs(d))}
                    </Box>
                  );
                },
              },
              {
                label: L("స్థితి", "Status"),
                render: (r) =>
                  r.isActual ? (
                    <Chip size="small" color="success" label={L("నిజమైన ఆదాయం", "Actual")} />
                  ) : (
                    <Chip size="small" color="info" label={L("ప్లాన్", "Plan")} />
                  ),
              },
              {
                label: L("లెక్క", "Mode"),
                render: (r) => {
                  const manualValue = target?.manualMonths[r.index] ?? null;
                  return (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <CalcModeChip
                      meta={
                        manualValue !== null && target
                          ? { ...target.calc, calcMode: "manual", autoValue: target.autoMonths[r.index] }
                          : AUTO_META
                      }
                      value={r.revised}
                      canChange={!!target && !r.isActual}
                      onEnterManual={() => setEditMonth(r.index)}
                      onSwitchToAuto={() => setMonthManual(r.index, null)}
                    />
                    {manualMode && manualValue === null && !!target && !r.isActual && (
                      <Button size="small" variant="outlined" onClick={() => setEditMonth(r.index)}>
                        {L("చేతితో", "By hand")}
                      </Button>
                    )}
                    </Box>
                  );
                },
              },
            ]}
            footer={
              rows.length > 0
                ? [
                    L("మొత్తం", "Total"),
                    rupees(rows.reduce((a, r) => a + r.original, 0)),
                    rupees(rows.reduce((a, r) => a + r.revised, 0)),
                    "",
                    "",
                    "",
                  ]
                : undefined
            }
          />
          <ManualValueDialog
            open={editMonth !== null}
            title={L(
              `${editMonth !== null ? monthName(editMonth, lang) : ""} లక్ష్యం చేతితో`,
              `${editMonth !== null ? monthName(editMonth, lang) : ""} target by hand`,
            )}
            label={L("ఈ నెల లక్ష్యం (₹)", "Target for this month (₹)")}
            initial={editMonth !== null ? (months[editMonth]?.revised ?? null) : null}
            onClose={() => setEditMonth(null)}
            onSubmit={(value, reason) => (editMonth !== null ? setMonthManual(editMonth, Math.round(value), reason) : Promise.resolve())}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {L(
              "చేతితో పెట్టిన నెలలను target planner మళ్ళీ మార్చదు. ",
              "Months entered by hand are not re-planned by the target planner. ",
            )}
            {L(
              "పూర్తయిన నెలల్లో నిజమైన ఆదాయం, మిగతా నెలల్లో మిగిలిన లక్ష్యం పంచబడుతుంది. పెరిగిన నెలలు కాషాయ రంగులో.",
              "Finished months show actual income; the rest of the target is spread over the coming months. Increases are shown in amber.",
            )}
          </Typography>
        </>
      )}
    </Box>
  );
}
