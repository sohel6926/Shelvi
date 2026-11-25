import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { customerPhone, waLink } from "../bookings/bookingCancelHelpers";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { useLang } from "../../i18n/LanguageContext";
import { useBusinessSettings } from "../../data/settingsRepository";
import { useBranch } from "../../session/BranchContext";
import {
  getQuotation,
  QUOTATION_STATUS_FLOW,
  QUOTATION_STATUSES,
  setQuotationStatus,
  subscribeQuotations,
  subscribeQuotationVersions,
  type Quotation,
  type QuotationVersion,
} from "../../data/records";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip, useCustomerNames, useStatusLabel } from "../../components/StatusChip";
import { CalcModeChip, ManualValueDialog } from "../../components/CalcModeChip";
import { RefreshButton } from "../../components/RefreshButton";
import { HistorySection } from "../../components/HistoryList";
import { canOverride } from "../../data/calcMode";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { saveQuotation, type QuoteRequest } from "../../data/functions";
import { doc } from "firebase/firestore";
import { db } from "../../firebase";
import { TaxDocumentView } from "../../components/TaxDocumentView";
import { useInvoiceBrand } from "../invoices/useInvoiceBrand";
import { PortalLinkButton } from "../portal/ShareLinkButtons";
import { formatDate, formatINR, sum } from "../../util/format";

export function QuotationsPage() {
  const navigate = useNavigate();
  const { L, lang } = useLang();
  const statusLabel = useStatusLabel();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { currentBranchId } = useBranch();
  const customerNames = useCustomerNames();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => subscribeQuotations(currentBranchId, setRows), [currentBranchId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (showCancelled || !r.cancelled) &&
        (status === "All" || r.status === status) &&
        (!q ||
          r.quotationNumber.toLowerCase().includes(q) ||
          (customerNames[r.customerId] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, status, search, customerNames, showCancelled]);

  const accepted = rows.filter((r) => r.status === "Accepted" && !r.cancelled);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("కొటేషన్లు", "Quotations")}
        onRefresh={() => refreshFromServer(branchQuery("quotations", currentBranchId), branchQuery("customers", null))}
        action={
          can.quote(role) ? (
            <Button variant="contained" startIcon={<NoteAddIcon />} onClick={() => navigate("/quotes/new")}>
              {L("కొత్త కొటేషన్", "New quote")}
            </Button>
          ) : undefined
        }
      />
      <StatRow>
        <StatCard label={L("అన్ని కొటేషన్లు", "All quotations")} value={rows.filter((r) => !r.cancelled).length} />
        <StatCard label={L("ఒప్పుకున్నవి", "Accepted")} value={accepted.length} tone="good" />
        <StatCard label={L("ఒప్పుకున్న విలువ", "Accepted value")} value={formatINR(sum(accepted, (r) => r.totalAmount))} />
      </StatRow>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder={L("నంబర్ / customer వెతకండి", "Search number or customer")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 240px" }}
        />
        <TextField select size="small" label={L("స్థితి", "Status")} value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 160 }}>
          {["All", ...QUOTATION_STATUSES].map((s) => (
            <MenuItem key={s} value={s}>
              {s === "All" ? L("అన్నీ", "All") : statusLabel(s)}
            </MenuItem>
          ))}
        </TextField>
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={rows.filter((r) => r.cancelled).length} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {L(
          "కొటేషన్ మొత్తాలు server లెక్కిస్తుంది. చూడటానికి ఒకదాన్ని నొక్కండి.",
          "Quotation totals are calculated by the server. Tap one to see it.",
        )}
      </Typography>
      <DataTable
        rows={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/quotations/${r.id}`)}
        emptyText={L("కొటేషన్లు లేవు.", "No quotations found.")}
        columns={[
          { label: L("నంబర్", "Number"), render: (r) => r.quotationNumber || "—" },
          { label: L("కస్టమర్", "Customer"), render: (r) => customerNames[r.customerId] ?? "—" },
          { label: L("తేదీ", "Date"), hideOnMobile: true, render: (r) => formatDate(r.issueDate, lang) },
          { label: L("చెల్లుబాటు", "Valid until"), hideOnMobile: true, render: (r) => formatDate(r.validUntil, lang) },
          { label: L("మొత్తం", "Total"), align: "right", render: (r) => formatINR(r.totalAmount) },
          // X9: estimated cost and margin — profit numbers, never shown to staff
          ...(role !== "staff"
            ? [
                {
                  label: L("అంచనా ఖర్చు / లాభం", "Est. cost / margin"),
                  align: "right" as const,
                  hideOnMobile: true,
                  render: (r: Quotation) =>
                    !r.costEstimate ? "—" : r.costEstimate.complete ? `${formatINR(r.costEstimate.total)} · ${r.costEstimate.marginPct === null ? "—" : `${r.costEstimate.marginPct}%`}` : L(`పూర్తిగా తెలియదు (${r.costEstimate.coveragePct ?? 0}%)`, `not fully known (${r.costEstimate.coveragePct ?? 0}%)`),
                },
              ]
            : []),
          {
            label: L("స్థితి", "Status"),
            render: (r) => (
              <>
                {r.cancelled ? <CancelledChip reason={r.cancelReason} /> : <StatusChip status={r.status} />}
                {r.version > 1 && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={r.status === "Draft" && !r.cancelled ? "warning" : "default"}
                    label={r.status === "Draft" && !r.cancelled ? L(`v${r.version} · మళ్ళీ పంపాలి`, `v${r.version} · send again`) : `v${r.version}`}
                    sx={{ ml: 0.5 }}
                  />
                )}
              </>
            ),
          },
        ]}
      />
    </Box>
  );
}

/** WhatsApp text for a quotation (number, lines, total, valid until) in the screen language. */
function quotationSummary(q: Quotation, customerName: string, businessName: string, lang: "te" | "en"): string {
  const te = lang === "te";
  const lines = q.lineItems.map((l) => `• ${(te && l.descriptionTe) || l.description}: ${formatINR(l.amount)}`);
  return [
    businessName,
    te ? `కొటేషన్ ${q.quotationNumber}${q.version > 1 ? ` (v${q.version})` : ""}` : `Quotation ${q.quotationNumber}${q.version > 1 ? ` (v${q.version})` : ""}`,
    customerName ? (te ? `${customerName} గారికి` : `For ${customerName}`) : "",
    "",
    ...lines,
    "",
    te ? `మొత్తం: ${formatINR(q.totalAmount)}` : `Total: ${formatINR(q.totalAmount)}`,
    q.validUntil ? (te ? `${formatDate(q.validUntil, lang)} వరకు చెల్లుతుంది` : `Valid until ${formatDate(q.validUntil, lang)}`) : "",
  ]
    .filter((x, i, all) => x !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** QA fix 2: status control (Draft → Sent → Accepted / Rejected) with WhatsApp share when sending. */
function QuotationStatusCard({ quotation, customerName, onChanged }: { quotation: Quotation; customerName: string; onChanged: () => void }) {
  const { L, lang } = useLang();
  const statusLabel = useStatusLabel();
  const { settings } = useBusinessSettings();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void customerPhone(quotation.customerId).then((p) => live && setPhone(p), () => undefined);
    return () => {
      live = false;
    };
  }, [quotation.customerId]);

  const next = (QUOTATION_STATUS_FLOW[quotation.status] ?? []) as (typeof QUOTATION_STATUSES)[number][];
  const change = async (status: (typeof QUOTATION_STATUSES)[number]) => {
    setBusy(true);
    setError(null);
    try {
      await setQuotationStatus(quotation.id, status);
      onChanged();
    } catch (e) {
      setError((e as Error).message || L("మార్చలేకపోయాం.", "Could not change the status."));
    } finally {
      setBusy(false);
    }
  };
  const actionLabel = (s: string) =>
    s === "Sent"
      ? L("పంపినట్టు గుర్తు పెట్టు", "Mark as sent")
      : s === "Accepted"
        ? L("Customer ఒప్పుకున్నారు", "Customer accepted")
        : s === "Rejected"
          ? L("Customer వద్దన్నారు", "Customer rejected")
          : statusLabel(s);
  const text = quotationSummary(quotation, customerName, settings.brandName || settings.name, lang);
  const showShare = quotation.status === "Draft" || quotation.status === "Sent" || quotation.status === "Rejected" || quotation.status === "Expired";

  return (
    <Paper sx={{ p: 2, mt: 2, displayPrint: "none" }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L("కొటేషన్ స్థితి", "Quotation status")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
        {["Draft", "Sent", "Accepted / Rejected"].map((s, i) => (
          <Box key={s} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {i > 0 && <ChevronRightIcon fontSize="small" color="disabled" />}
            <Chip
              size="small"
              variant={quotation.status === s || (i === 2 && (quotation.status === "Accepted" || quotation.status === "Rejected")) ? "filled" : "outlined"}
              color={quotation.status === s || (i === 2 && (quotation.status === "Accepted" || quotation.status === "Rejected")) ? "primary" : "default"}
              label={i === 2 ? `${statusLabel("Accepted")} / ${statusLabel("Rejected")}` : statusLabel(s)}
            />
          </Box>
        ))}
      </Box>
      {quotation.status === "Draft" && quotation.version > 1 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {L(`మార్పు తర్వాత (v${quotation.version}) — మళ్ళీ పంపాలి`, `Changed (v${quotation.version}) — send again`)}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {showShare && (
          <Button
            variant="contained"
            color="success"
            startIcon={<WhatsAppIcon />}
            disabled={busy}
            href={phone ? waLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (quotation.status !== "Sent") void change("Sent");
            }}
          >
            {quotation.status === "Sent" ? L("WhatsApp లో మళ్ళీ పంపు", "Share on WhatsApp again") : L("WhatsApp లో పంపు (Sent)", "Send on WhatsApp (marks Sent)")}
          </Button>
        )}
        {next.map((s) => (
          <Button key={s} variant="outlined" color={s === "Rejected" ? "error" : s === "Accepted" ? "success" : "primary"} disabled={busy} onClick={() => void change(s)}>
            {actionLabel(s)}
          </Button>
        ))}
        {quotation.status === "Accepted" && (
          <Typography variant="body2" color="text.secondary">
            {L("Customer ఒప్పుకున్నారు — బుకింగ్ పేజీలో 'బిల్ తయారు చేయి' నొక్కండి.", "Accepted — use 'Make bill' on the booking page.")}
          </Typography>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
}

/** R7-10: every re-save after Sent / Accepted keeps the old one; show them and which one the customer accepted. */
function VersionsCard({ quotation }: { quotation: Quotation }) {
  const { L, lang } = useLang();
  const [versions, setVersions] = useState<QuotationVersion[]>([]);
  const [open, setOpen] = useState<QuotationVersion | null>(null);
  useEffect(() => subscribeQuotationVersions(quotation.id, setVersions, () => setVersions([])), [quotation.id]);

  const rows = [
    { n: quotation.version, savedAt: quotation.issueDate, doc: quotation, current: true },
    ...versions.filter((v) => v.n !== quotation.version).map((v) => ({ ...v, current: false })),
  ];
  if (rows.length <= 1 && quotation.acceptedVersion === null) return null;

  return (
    <Paper sx={{ p: 2, mt: 2, displayPrint: "none" }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L("వెర్షన్లు", "Versions")}
      </Typography>
      <DataTable
        rows={rows}
        rowKey={(r) => String(r.n)}
        onRowClick={(r) => (r.current ? undefined : setOpen(r))}
        columns={[
          { label: L("వెర్షన్", "Version"), render: (r) => `v${r.n}` },
          { label: L("తేదీ", "Date"), render: (r) => formatDate(r.savedAt, lang) },
          { label: L("మొత్తం", "Total"), align: "right", render: (r) => formatINR(r.doc.totalAmount) },
          {
            label: "",
            render: (r) => (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {r.current && <Chip size="small" color="info" label={L("ఇప్పటిది", "Current")} />}
                {quotation.acceptedVersion === r.n && (
                  <Chip size="small" color="success" label={L("Customer ఒప్పుకున్నది ఇదే", "Customer accepted this one")} />
                )}
              </Box>
            ),
          },
        ]}
      />
      <Dialog open={!!open} onClose={() => setOpen(null)} fullWidth maxWidth="md">
        <DialogTitle>
          {L("వెర్షన్", "Version")} v{open?.n}
          {open && quotation.acceptedVersion === open.n && (
            <Chip size="small" color="success" label={L("Customer ఒప్పుకున్నది", "Accepted by customer")} sx={{ ml: 1 }} />
          )}
        </DialogTitle>
        <DialogContent>{open && <TaxDocumentView doc={open.doc} />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(null)}>{L("మూసివేయి", "Close")}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export function QuotationDetailPage() {
  const navigate = useNavigate();
  const { L } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { settings } = useBusinessSettings();
  const { id } = useParams<{ id: string }>();
  const customerNames = useCustomerNames();
  const [quotation, setQuotation] = useState<Quotation | null | undefined>(undefined);
  const brand = useInvoiceBrand(quotation?.bookingId ?? "", quotation?.branchId ?? "");
  const [manualOpen, setManualOpen] = useState(false);

  function load() {
    if (!id) return Promise.resolve();
    return getQuotation(id).then(setQuotation, () => setQuotation(null));
  }

  useEffect(() => {
    void load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Re-save through saveQuotation (server recomputes); `manual` set = manual total, omitted = automatic.
   * notes / validDays / bookingId are not sent, so the server keeps the stored values (contract audit fix 3).
   */
  async function resave(manual?: { total: number; reason: string }) {
    if (!quotation) return;
    const first = quotation.sessions[0];
    const base = quotation.resave ?? (first ? { menuPackageId: first.menuPackageId, selections: first.selections, quoteInput: first.quote } : null);
    if (!base) return;
    await saveQuotation({
      quotationId: quotation.id,
      customerId: quotation.customerId,
      menuPackageId: base.menuPackageId,
      selections: base.selections,
      quote: base.quoteInput as unknown as QuoteRequest,
      // Multi-session quotes: the server needs the booking to check the sessions (QA fix 3).
      ...(quotation.sessions.length
        ? {
            bookingId: quotation.bookingId,
            sessions: quotation.sessions.map((x) => ({ ...x, quote: x.quote as unknown as QuoteRequest })),
          }
        : {}),
      ...(manual ? { manual } : {}),
    });
    await load();
  }

  const mayOverride = canOverride(role, settings.managerCanOverride) && !!(quotation?.resave || quotation?.sessions.length) && !quotation?.cancelled;

  if (quotation === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, "@media print": { p: 0, maxWidth: "none" } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 2, flexWrap: "wrap", displayPrint: "none" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/quotations")}>
          {L("కొటేషన్లు", "Quotations")}
        </Button>
        {quotation && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <RefreshButton
              onRefresh={async () => {
                await refreshFromServer(doc(db, "quotations", quotation.id));
                await load();
              }}
            />
            {quotation.cancelled ? <CancelledChip reason={quotation.cancelReason} /> : <StatusChip status={quotation.status} />}
            {!quotation.cancelled && quotation.status === "Draft" && quotation.version > 1 && (
              <Chip size="small" color="warning" label={L(`మారింది (v${quotation.version}) — మళ్ళీ పంపాలి`, `Changed (v${quotation.version}) — send again`)} />
            )}
            {!quotation.cancelled && <PortalLinkButton kind="quotation" id={quotation.id} customerId={quotation.customerId} label={quotation.quotationNumber} />}
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>
              {L("ప్రింట్ / PDF", "Print / PDF")}
            </Button>
            {!quotation.cancelled && (
              <CancelButton variant="button" collection="quotations" id={quotation.id} what={quotation.quotationNumber} onDone={() => void load()} />
            )}
          </Box>
        )}
      </Box>
      {!quotation ? (
        <Alert severity="warning">{L("కొటేషన్ దొరకలేదు.", "Quotation not found.")}</Alert>
      ) : (
        <>
        <TaxDocumentView
          doc={quotation}
          totalBadge={
            <CalcModeChip
              meta={quotation.calc}
              value={quotation.totalAmount}
              canChange={mayOverride}
              onEnterManual={() => setManualOpen(true)}
              onSwitchToAuto={() => resave()}
            />
          }
          letterhead={{
            // Always "Quotation": contract decision 4 lists only "Invoice" / "Tax Invoice" for docTitle.
            title: L("కొటేషన్ / Quotation", "Quotation"),
            number: quotation.quotationNumber,
            date: quotation.issueDate,
            validUntil: quotation.validUntil,
            customerName: customerNames[quotation.customerId],
            business: brand ? { ...settings, ...(brand.name ? { name: brand.name, brandName: brand.name } : {}), ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}) } : settings,
            notes: quotation.notes,
          }}
        />
        <ManualValueDialog
          open={manualOpen}
          title={L("కొటేషన్ మొత్తం చేతితో", "Enter quotation total manually")}
          label={L("కొత్త మొత్తం (₹)", "New total (₹)")}
          initial={quotation.totalAmount}
          onClose={() => setManualOpen(false)}
          onSubmit={(total, reason) => resave({ total, reason })}
        />
        {quotation.cancelled && (
          <Alert severity="info" sx={{ mt: 2, displayPrint: "none" }}>
            {L("ఈ కొటేషన్ రద్దు అయింది", "This quotation is cancelled")}
            {quotation.cancelReason ? `: ${quotation.cancelReason}` : "."}
          </Alert>
        )}
        {!quotation.cancelled && (role === "admin" || role === "manager") && (
          <QuotationStatusCard quotation={quotation} customerName={customerNames[quotation.customerId] ?? ""} onChanged={() => void load()} />
        )}
        <VersionsCard quotation={quotation} />
        <HistorySection collection="quotations" docId={quotation.id} />
        </>
      )}
    </Box>
  );
}
