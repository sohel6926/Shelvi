import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from "@mui/material";
import { useSession } from "../../auth/AuthProvider";
import { SalaryPayPanel } from "./SalaryPayPanel";
import { useLang, monthName } from "../../i18n/LanguageContext";
import { errorText, finalizePayroll, monthPayroll, overridePayrollRow, type PayrollRow } from "../../data/functions";
import { CalcModeChip, ManualValueDialog } from "../../components/CalcModeChip";
import { toCalcMeta } from "../../data/calcMode";
import { useBusinessSettings } from "../../data/settingsRepository";
import { DataTable } from "../../components/DataTable";
import { ErrorBox, rupees2, ScreenTitle } from "../../components/ui";
import { istMonth } from "../../util/dates";
import { tokens } from "../../theme/tokens";
import { getPayrollFinalizedAt } from "../../data/records";
import { formatDate } from "../../util/format";

/** Month payroll (admin only). Every number comes from the monthPayroll callable (calc §7 / §7b). */
export function PayrollPage() {
  const { L, lang } = useLang();
  const session = useSession();
  // Module 4d: the Finance Head and HR Manager see the month; finalizing and typed changes stay with the owner.
  const isOwner = session.status === "loggedIn" && session.profile.role === "admin";
  const [month, setMonth] = useState(istMonth());
  const [rows, setRows] = useState<PayrollRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownMonth, setShownMonth] = useState(month);
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  /** R10-1: "జీతాలు ఖరారు చేయి" → finalizePayroll (payslips + advance recoveries; safe to run again). */
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalMsg, setFinalMsg] = useState<string | null>(null);
  /** QA fix 9: the month's payslips are already finalized (date) → say so and disable the button. */
  const [finalizedAt, setFinalizedAt] = useState<Date | null>(null);

  async function finalize() {
    setFinalizing(true);
    setError(null);
    setFinalMsg(null);
    try {
      const r = await finalizePayroll({ month: shownMonth });
      setConfirmFinal(false);
      setFinalMsg(
        L(
          `${r.month} జీతాలు ఖరారు అయ్యాయి: ${r.payslips} payslips, ${r.advancesTouched} అడ్వాన్స్‌లలో కోత నమోదు.`,
          `${r.month} payroll finalized: ${r.payslips} payslips, ${r.advancesTouched} advance recoveries booked.`,
        ),
      );
      await load(shownMonth);
    } catch (e) {
      setConfirmFinal(false);
      setError(errorText(e, lang));
    } finally {
      setFinalizing(false);
    }
  }
  const { settings } = useBusinessSettings();
  // Payroll in manual mode → the "enter by hand" button shows on every automatic row (fix 2 / h).
  const manualMode = settings.calcModes.payroll === "manual";

  function load(m: string): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(m)) return Promise.resolve();
    setLoading(true);
    setError(null);
    return Promise.all([monthPayroll({ month: m }), getPayrollFinalizedAt(m).catch(() => null)])
      .then(([r, fin]) => {
        setRows(r.rows);
        setShownMonth(m);
        setFinalizedAt(fin);
      })
      .catch((e) => {
        setRows(null);
        setError(errorText(e, lang));
        throw e;
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(month).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [y, mm] = month.split("-").map(Number);
  const title = y && mm ? `${monthName(mm - 1, lang)} ${y}` : month;
  const sum = (pick: (r: PayrollRow) => number) => (rows ?? []).reduce((a, r) => a + pick(r), 0);

  const modeCell = (r: PayrollRow) => (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <CalcModeChip
        meta={toCalcMeta(r)}
        value={r.net}
        canChange
        onEnterManual={() => setEditing(r)}
        onSwitchToAuto={async () => {
          await overridePayrollRow({ month: shownMonth, staffId: r.staffId, auto: true });
          await load(shownMonth);
        }}
      />
      {manualMode && r.calcMode !== "manual" && (
        <Button size="small" variant="outlined" onClick={() => setEditing(r)}>
          {L("చేతితో", "By hand")}
        </Button>
      )}
    </Box>
  );
  const typeChip = (r: PayrollRow) => <Chip size="small" label={r.payType === "monthly" ? L("నెల జీతం", "Monthly") : L("రోజువారీ", "Daily")} />;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("జీతాలు", "Payroll")}
        subtitle={L("రోజువారీ, నెల జీతం సిబ్బంది — server లెక్క", "Daily and monthly staff — calculated by the server")}
        onRefresh={() => load(month)}
      />
      <Paper sx={{ p: 2, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          type="month"
          label={L("నెల", "Month")}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button variant="contained" onClick={() => load(month).catch(() => {})} disabled={loading}>
          {L("లెక్క చూపించు", "Show payroll")}
        </Button>
        {loading && <CircularProgress size={22} />}
      </Paper>
      <ErrorBox message={error} />
      {finalMsg && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {finalMsg}
        </Alert>
      )}
      {rows && (
        <>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
            <Typography variant="h6" component="h2">
              {title}
            </Typography>
            {rows.length > 0 && (
              <Button variant="contained" color="success" onClick={() => setConfirmFinal(true)} disabled={finalizing || !!finalizedAt || !isOwner}>
                {finalizedAt ? L("ఖరారు అయ్యాయి", "Finalized") : L("జీతాలు ఖరారు చేయి", "Finalize payroll")}
              </Button>
            )}
          </Box>
          {finalizedAt && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {L(`ఈ నెల జీతాలు ఖరారు అయ్యాయి (${formatDate(finalizedAt, lang)})`, `This month's payroll is finalized (${formatDate(finalizedAt, lang)})`)}
            </Alert>
          )}
          {/* QA fix 9: phone width → one card per staff member (no table overflow); wider screens → the table. */}
          <Box sx={{ display: { xs: "grid", sm: "none" }, gap: 1 }}>
            {rows.length === 0 && (
              <Paper sx={{ p: 2 }}>
                <Typography color="text.secondary">{L("ఈ నెలకి జీతాల వివరాలు లేవు.", "No payroll for this month.")}</Typography>
              </Paper>
            )}
            {rows.map((r) => (
              <Paper key={r.staffId} sx={{ p: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{r.name}</Typography>
                  {typeChip(r)}
                </Box>
                {[
                  [L("మొత్తం", "Gross"), rupees2(r.gross)],
                  [L("కోత", "Cut"), r.cut ? `− ${rupees2(r.cut)}` : "—"],
                  ["OT", r.ot ? rupees2(r.ot) : "—"],
                  [L("అడ్వాన్స్ కోత", "Advance cut"), r.advances ? `− ${rupees2(r.advances)}` : "—"],
                ].map(([k, v]) => (
                  <Box key={k} sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {k}
                    </Typography>
                    <Typography variant="body2">{v}</Typography>
                  </Box>
                ))}
                {(r.advanceCarry ?? 0) > 0 && (
                  <Typography variant="caption" sx={{ display: "block", color: tokens.color.warning }}>
                    {L(`మిగతా ${rupees2(r.advanceCarry)} వచ్చే నెల`, `${rupees2(r.advanceCarry)} carries to next month`)}
                  </Typography>
                )}
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mt: 0.5 }}>
                  <Typography sx={{ fontWeight: 600 }}>{L("చేతికి", "Net pay")}</Typography>
                  <Typography sx={{ fontWeight: 600, color: r.net < 0 ? tokens.color.bad : undefined }}>
                    {rupees2(r.net)}
                    {r.net < 0 && ` · ${L("సిబ్బంది తిరిగి ఇవ్వాలి", "staff owes this")}`}
                  </Typography>
                </Box>
                <Box sx={{ mt: 1 }}>{modeCell(r)}</Box>
              </Paper>
            ))}
            {rows.length > 1 && (
              <Paper sx={{ p: 1.5, display: "flex", justifyContent: "space-between" }}>
                <Typography sx={{ fontWeight: 700 }}>{L("మొత్తం చేతికి", "Total net pay")}</Typography>
                <Typography sx={{ fontWeight: 700 }}>{rupees2(sum((r) => r.net))}</Typography>
              </Paper>
            )}
          </Box>
          <Box sx={{ display: { xs: "none", sm: "block" }, maxWidth: "100%", overflowX: "auto" }}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.staffId}
            emptyText={L("ఈ నెలకి జీతాల వివరాలు లేవు.", "No payroll for this month.")}
            columns={[
              { label: L("పేరు", "Name"), render: (r) => r.name },
              {
                label: L("రకం", "Type"),
                hideOnMobile: true,
                render: (r) => typeChip(r),
              },
              { label: L("మొత్తం", "Gross"), align: "right", render: (r) => rupees2(r.gross) },
              { label: L("కోత", "Cut"), align: "right", hideOnMobile: true, render: (r) => (r.cut ? `− ${rupees2(r.cut)}` : "—") },
              { label: "OT", align: "right", hideOnMobile: true, render: (r) => (r.ot ? rupees2(r.ot) : "—") },
              {
                label: L("అడ్వాన్స్ కోత", "Advance cut"),
                align: "right",
                render: (r) => (
                  <Box component="span">
                    {r.advances ? `− ${rupees2(r.advances)}` : "—"}
                    {(r.advanceCarry ?? 0) > 0 && (
                      <Typography component="span" variant="caption" sx={{ display: "block", color: tokens.color.warning }}>
                        {L(`మిగతా ${rupees2(r.advanceCarry)} వచ్చే నెల`, `${rupees2(r.advanceCarry)} carries to next month`)}
                      </Typography>
                    )}
                  </Box>
                ),
              },
              {
                label: L("చేతికి", "Net pay"),
                align: "right",
                render: (r) => (
                  <Box component="span" sx={{ fontWeight: 600, color: r.net < 0 ? tokens.color.bad : undefined }}>
                    {rupees2(r.net)}
                    {r.net < 0 && (
                      <Typography component="span" variant="caption" sx={{ display: "block" }}>
                        {L("సిబ్బంది తిరిగి ఇవ్వాలి", "staff owes this")}
                      </Typography>
                    )}
                  </Box>
                ),
              },
              {
                label: L("లెక్క", "Mode"),
                render: (r) => modeCell(r),
              },
            ]}
            footer={
              rows.length > 1
                ? [
                    L("మొత్తం", "Total"),
                    "",
                    rupees2(sum((r) => r.gross)),
                    rupees2(sum((r) => r.cut)),
                    rupees2(sum((r) => r.ot)),
                    rupees2(sum((r) => r.advances)),
                    rupees2(sum((r) => r.net)),
                    "",
                  ]
                : undefined
            }
          />
          </Box>
          <SalaryPayPanel rows={rows} month={shownMonth} isOwner={isOwner} onDone={() => void load(shownMonth)} />
        </>
      )}
      <Dialog open={confirmFinal} onClose={() => !finalizing && setConfirmFinal(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{L("జీతాలు ఖరారు చేయాలా?", "Finalize payroll?")}</DialogTitle>
        <DialogContent>
          <Typography>
            {L(
              `${title} payslips save అవుతాయి, అడ్వాన్స్ కోతలు ఆ అడ్వాన్స్‌ల మీద నమోదు అవుతాయి. మళ్ళీ చేస్తే అదే లెక్క మళ్ళీ వేస్తాం (రెండుసార్లు కోయము). చేతితో పెట్టిన జీతం అలాగే ఉంటుంది.`,
              `${title} payslips are saved and the advance cuts are booked on the advances. Running it again redoes the same month (nothing is cut twice). Hand-entered net pay is kept.`,
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmFinal(false)} disabled={finalizing}>
            {L("వద్దు", "Back")}
          </Button>
          <Button variant="contained" color="success" onClick={finalize} disabled={finalizing}>
            {finalizing ? <CircularProgress size={20} color="inherit" /> : L("ఖరారు చేయి", "Finalize")}
          </Button>
        </DialogActions>
      </Dialog>
      <ManualValueDialog
        open={!!editing}
        title={L(`${editing?.name ?? ""} — చేతికి ఇచ్చే జీతం`, `${editing?.name ?? ""} — net pay by hand`)}
        label={L("చేతికి (₹)", "Net pay (₹)")}
        initial={editing?.net ?? null}
        onClose={() => setEditing(null)}
        onSubmit={async (net, reason) => {
          if (!editing) return;
          await overridePayrollRow({ month: shownMonth, staffId: editing.staffId, net, reason });
          await load(shownMonth);
        }}
      />
    </Box>
  );
}
