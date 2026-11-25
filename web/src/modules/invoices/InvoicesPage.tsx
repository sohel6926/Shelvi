import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { subscribeInvoice, subscribeInvoices, subscribePayments, type Invoice, type Payment } from "../../data/records";
import { useInvoiceBrand } from "./useInvoiceBrand";
import { PaymentLinkButton, PortalLinkButton } from "../portal/ShareLinkButtons";
import { useBusinessSettings } from "../../data/settingsRepository";
import {
  errorText,
  overrideInvoiceTotal,
  PAYMENT_METHODS,
  recordPayment,
  decideRefund,
  refundOrAdjust,
  requestRefund,
  type PaymentMethod,
} from "../../data/functions";
import { canOverride } from "../../data/calcMode";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { CalcModeChip, ManualValueDialog } from "../../components/CalcModeChip";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip, useCustomerNames } from "../../components/StatusChip";
import { SummaryLine, TaxDocumentView } from "../../components/TaxDocumentView";
import { ErrorBox, parseMoney } from "../../components/ui";
import { RefreshButton } from "../../components/RefreshButton";
import { HistorySection } from "../../components/HistoryList";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { formatDate, formatINR, sum } from "../../util/format";
import { istDay } from "../../util/dates";

const INVOICE_STATUSES = ["All", "Draft", "Sent", "PartiallyPaid", "Paid", "Overdue"];

const METHOD_LABEL: Record<PaymentMethod, { te: string; en: string }> = {
  Cash: { te: "నగదు", en: "Cash" },
  UPI: { te: "UPI", en: "UPI" },
  BankTransfer: { te: "బ్యాంక్ బదిలీ", en: "Bank transfer" },
  Card: { te: "కార్డ్", en: "Card" },
  Other: { te: "ఇతర", en: "Other" },
};

export function InvoicesPage() {
  const navigate = useNavigate();
  const { L } = useLang();
  const { currentBranchId } = useBranch();
  const customerNames = useCustomerNames();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(
    () =>
      subscribeInvoices(currentBranchId, setRows, () =>
        setError(L("ఇన్వాయిస్‌లు చూడటానికి అనుమతి లేదు.", "You don't have access to invoices.")),
      ),
    [currentBranchId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (showCancelled || !r.cancelled) &&
        (status === "All" || r.status === status) &&
        (!q ||
          r.invoiceNumber.toLowerCase().includes(q) ||
          (customerNames[r.customerId] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, status, search, customerNames, showCancelled]);
  const live = rows.filter((r) => !r.cancelled);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("ఇన్వాయిస్‌లు", "Invoices")}
        onRefresh={() => refreshFromServer(branchQuery("invoices", currentBranchId), branchQuery("customers", null))}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <StatRow>
        <StatCard label={L("బిల్ చేసింది", "Billed")} value={formatINR(sum(live, (r) => r.totalAmount))} />
        <StatCard label={L("వచ్చింది", "Received")} value={formatINR(sum(live, (r) => r.amountPaid))} tone="good" />
        <StatCard label={L("బాకీ", "Balance due")} value={formatINR(sum(live, (r) => r.balanceDue))} tone="warn" />
      </StatRow>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder={L("నంబర్ / customer వెతకండి", "Search number or customer")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 240px" }}
        />
        <TextField select size="small" label={L("స్థితి", "Status")} value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 170 }}>
          {INVOICE_STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s === "All" ? L("అన్నీ", "All") : s === "PartiallyPaid" ? "Partially Paid" : s}
            </MenuItem>
          ))}
        </TextField>
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={rows.length - live.length} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {L(
          "మొత్తాలు, చెల్లింపులు server మాత్రమే లెక్కిస్తుంది. Invoice తెరిచి చెల్లింపు నమోదు చేయండి.",
          "Totals and payments are calculated only by the server. Open an invoice to record a payment.",
        )}
      </Typography>
      <DataTable
        rows={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/invoices/${r.id}`)}
        emptyText={L("ఇన్వాయిస్‌లు లేవు.", "No invoices found.")}
        columns={[
          { label: L("నంబర్", "Number"), render: (r) => r.invoiceNumber || "—" },
          { label: L("కస్టమర్", "Customer"), render: (r) => customerNames[r.customerId] ?? "—" },
          { label: L("తేదీ", "Date"), hideOnMobile: true, render: (r) => formatDate(r.issueDate) },
          { label: L("మొత్తం", "Total"), align: "right", render: (r) => formatINR(r.totalAmount) },
          { label: L("చెల్లించింది", "Paid"), align: "right", hideOnMobile: true, render: (r) => formatINR(r.amountPaid) },
          { label: L("బాకీ", "Balance"), align: "right", render: (r) => formatINR(r.balanceDue) },
          { label: L("స్థితి", "Status"), render: (r) => (r.cancelled ? <CancelledChip reason={r.cancelReason} /> : <StatusChip status={r.status} />) },
        ]}
        footer={
          filtered.length > 1
            ? [
                L("మొత్తం", "Total"),
                "",
                "",
                formatINR(sum(filtered, (r) => r.totalAmount)),
                formatINR(sum(filtered, (r) => r.amountPaid)),
                formatINR(sum(filtered, (r) => r.balanceDue)),
                "",
              ]
            : undefined
        }
      />
    </Box>
  );
}

function PaymentForm({ invoice }: { invoice: Invoice }) {
  const { L, T, lang } = useLang();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [date, setDate] = useState(istDay());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setDone(null);
    const amt = parseMoney(amount);
    if (amt === null || Number.isNaN(amt) || amt < 0.01) {
      setError(L("సరైన మొత్తం ఇవ్వండి (పైసలు 2 అంకెల వరకు).", "Enter a valid amount (up to 2 decimals)."));
      return;
    }
    if (amt > invoice.balanceDue + 0.005) {
      setError(L(`బాకీ ${formatINR(invoice.balanceDue)} కంటే ఎక్కువ తీసుకోలేము.`, `Can't take more than the balance ${formatINR(invoice.balanceDue)}.`));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(L("తేదీ ఇవ్వండి.", "Choose the date."));
      return;
    }
    setSaving(true);
    try {
      const res = await recordPayment({ invoiceId: invoice.id, amount: amt, method, date, ...(note.trim() ? { note: note.trim() } : {}) });
      setAmount("");
      setNote("");
      setDone(
        L(
          `చెల్లింపు నమోదైంది. ఇప్పుడు బాకీ ${formatINR(res.newBalance)}.`,
          `Payment recorded. Balance is now ${formatINR(res.newBalance)}.`,
        ),
      );
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Paper sx={{ p: 2.5, displayPrint: "none" }}>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        {L("చెల్లింపు నమోదు", "Record a payment")}
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 2fr auto" }, alignItems: "start" }}>
        <TextField
          label={L("మొత్తం (₹)", "Amount (₹)")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          helperText={L(`బాకీ ${formatINR(invoice.balanceDue)}`, `Balance ${formatINR(invoice.balanceDue)}`)}
        />
        <TextField select label={L("ఎలా", "Method")} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <MenuItem key={m} value={m}>
              {T(METHOD_LABEL[m])}
            </MenuItem>
          ))}
        </TextField>
        <TextField type="date" label={L("తేదీ", "Date")} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label={L("గమనిక", "Note")} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="contained" onClick={submit} disabled={saving} sx={{ mt: 0.5 }}>
          {saving ? L("నమోదు…", "Saving…") : L("నమోదు చేయి", "Record")}
        </Button>
      </Box>
      <ErrorBox message={error} />
      {done && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {done}
        </Alert>
      )}
    </Paper>
  );
}

interface RefundReq { id: string; amount: number; reason: string; status: string; requestedByName: string; decideNote: string }

/** Module 6a — refund requests of this invoice: the owner approves / rejects; a manager sees how theirs stands. */
function RefundRequests({ invoice, role }: { invoice: Invoice; role: string }) {
  const { L, lang } = useLang();
  const [rows, setRows] = useState<RefundReq[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    const base = collection(db, "refundRequests");
    const q = role === "admin" ? query(base, where("invoiceId", "==", invoice.id)) : query(base, where("invoiceId", "==", invoice.id), where("branchId", "==", invoice.branchId));
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, amount: Number(d.data().amount ?? 0), reason: String(d.data().reason ?? ""), status: String(d.data().status ?? ""), requestedByName: String(d.data().requestedByName ?? ""), decideNote: String(d.data().decideNote ?? "") }))),
      () => setRows([]),
    );
  }, [invoice.id, invoice.branchId, role]);
  if (!rows.length) return null;
  const decide = async (id: string, approve: boolean, why = "") => {
    setBusy(id);
    setError(null);
    try {
      await decideRefund({ id, approve, ...(why ? { note: why } : {}) });
      setRejecting("");
      setNote("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy("");
    }
  };
  const label: Record<string, { te: string; en: string }> = { pending: { te: "ఆమోదం కోసం ఆగింది", en: "Waiting for approval" }, approved: { te: "ఆమోదించారు", en: "Approved" }, rejected: { te: "తిరస్కరించారు", en: "Rejected" } };
  return (
    <Paper variant="outlined" sx={{ p: 2, displayPrint: "none" }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {L("Refund అభ్యర్థనలు", "Refund requests")}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {rows.map((r) => (
        <Box key={r.id} sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", borderTop: 1, borderColor: "divider", py: 0.75 }}>
          <Typography variant="body2" sx={{ flex: "1 1 240px" }}>
            <b>{formatINR(r.amount)}</b> · {r.reason} · {r.requestedByName}
            {r.decideNote ? ` · ${r.decideNote}` : ""}
          </Typography>
          {r.status === "pending" && role === "admin" ? (
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
                  {L("ఆమోదించి refund చేయి", "Approve and refund")}
                </Button>
                <Button size="small" color="error" disabled={busy === r.id} onClick={() => { setRejecting(r.id); setNote(""); }}>
                  {L("తిరస్కరించు", "Reject")}
                </Button>
              </>
            )
          ) : (
            <Chip size="small" color={r.status === "approved" ? "success" : r.status === "rejected" ? "error" : "default"} label={L(label[r.status]?.te ?? r.status, label[r.status]?.en ?? r.status)} />
          )}
        </Box>
      ))}
    </Paper>
  );
}

function RefundForm({ invoice, asRequest = false }: { invoice: Invoice; asRequest?: boolean }) {
  const { L, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setDone(null);
    const amt = parseMoney(amount);
    if (amt === null || Number.isNaN(amt) || amt < 0.01) {
      setError(L("సరైన మొత్తం ఇవ్వండి.", "Enter a valid amount."));
      return;
    }
    if (amt > invoice.amountPaid + 0.005) {
      setError(L("చెల్లించిన దాని కంటే ఎక్కువ తిరిగి ఇవ్వలేము.", "Can't refund more than was paid."));
      return;
    }
    if (!reason.trim()) {
      setError(L("కారణం రాయండి.", "Write the reason."));
      return;
    }
    setSaving(true);
    try {
      if (asRequest) {
        await requestRefund({ invoiceId: invoice.id, amount: amt, reason: reason.trim() });
        setAmount("");
        setReason("");
        setOpen(false);
        setDone(L("అభ్యర్థన యజమానికి వెళ్ళింది. ఆమోదం అయ్యాక refund నమోదవుతుంది.", "Request sent to the owner. The refund is recorded once approved."));
        return;
      }
      const res = await refundOrAdjust({ invoiceId: invoice.id, amount: amt, reason: reason.trim() });
      setAmount("");
      setReason("");
      setOpen(false);
      setDone(L(`నమోదైంది. ఇప్పుడు బాకీ ${formatINR(res.newBalance)}.`, `Recorded. Balance is now ${formatINR(res.newBalance)}.`));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ displayPrint: "none" }}>
      {done && (
        <Alert severity="success" sx={{ mb: 1 }}>
          {done}
        </Alert>
      )}
      {!open ? (
        <Button color="warning" variant="outlined" onClick={() => setOpen(true)} disabled={invoice.amountPaid <= 0}>
          {asRequest ? L("Refund కోసం అభ్యర్థన", "Ask for a refund") : L("Refund / సర్దుబాటు", "Refund / adjust")}
        </Button>
      ) : (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            {L("Refund / సర్దుబాటు", "Refund / adjustment")}
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 2fr auto auto" }, alignItems: "start" }}>
            <TextField
              label={L("మొత్తం (₹)", "Amount (₹)")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              helperText={L(`చెల్లించింది ${formatINR(invoice.amountPaid)}`, `Paid ${formatINR(invoice.amountPaid)}`)}
            />
            <TextField label={L("కారణం", "Reason")} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <Button variant="contained" color="warning" onClick={submit} disabled={saving} sx={{ mt: 0.5 }}>
              {saving ? L("నమోదు…", "Saving…") : asRequest ? L("అభ్యర్థన పంపు", "Send request") : L("నమోదు చేయి", "Record")}
            </Button>
            <Button onClick={() => setOpen(false)} disabled={saving} sx={{ mt: 0.5 }}>
              {L("వద్దు", "Cancel")}
            </Button>
          </Box>
          <ErrorBox message={error} />
        </Paper>
      )}
    </Box>
  );
}

export function InvoiceDetailPage() {
  const navigate = useNavigate();
  const { L, T } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { id } = useParams<{ id: string }>();
  const customerNames = useCustomerNames();
  const { settings } = useBusinessSettings();
  const [invoice, setInvoice] = useState<Invoice | null | undefined>(undefined);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  const brand = useInvoiceBrand(invoice?.bookingId ?? "", invoice?.branchId ?? "");

  useEffect(() => {
    if (!id) return;
    const offInvoice = subscribeInvoice(id, setInvoice, () => setInvoice(null));
    const offPayments = subscribePayments(id, setPayments);
    return () => {
      offInvoice();
      offPayments();
    };
  }, [id]);

  if (invoice === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const title = invoice?.docTitle || (settings.gstRegistered ? "Tax Invoice" : "Invoice");
  const mayOverride = canOverride(role, settings.managerCanOverride) && !invoice?.cancelled;
  // Invoice area in manual mode → open the manual-entry dialog once per invoice (fix 2 / h).
  if (
    invoice &&
    settings.calcModes.invoice === "manual" &&
    invoice.calc.calcMode === "auto" &&
    mayOverride &&
    invoice.amountPaid === 0 &&
    autoOpened !== invoice.id
  ) {
    setAutoOpened(invoice.id);
    setManualOpen(true);
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, "@media print": { p: 0, maxWidth: "none" } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 2, flexWrap: "wrap", displayPrint: "none" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/invoices")}>
          {L("ఇన్వాయిస్‌లు", "Invoices")}
        </Button>
        {invoice && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <RefreshButton
              onRefresh={() =>
                refreshFromServer(doc(db, "invoices", invoice.id), query(collection(db, "invoices", invoice.id, "payments")))
              }
            />
            {invoice.cancelled ? <CancelledChip reason={invoice.cancelReason} /> : <StatusChip status={invoice.status} />}
            {!invoice.cancelled && <CancelButton variant="button" collection="invoices" id={invoice.id} what={invoice.invoiceNumber} />}
            {!invoice.cancelled && <PortalLinkButton kind="invoice" id={invoice.id} customerId={invoice.customerId} label={invoice.invoiceNumber} />}
            {!invoice.cancelled && <PaymentLinkButton invoiceId={invoice.id} customerId={invoice.customerId} balance={invoice.balanceDue} number={invoice.invoiceNumber} />}
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>
              {L("ప్రింట్ / PDF", "Print / PDF")}
            </Button>
          </Box>
        )}
      </Box>
      {!invoice ? (
        <Alert severity="warning">{L("Invoice దొరకలేదు.", "Invoice not found.")}</Alert>
      ) : (
        <Box sx={{ display: "grid", gap: 2 }}>
          {invoice.cancelled && invoice.bookingId && invoice.status === "Cancelled" && invoice.subtotal - invoice.totalAmount > 0.005 && (
            // Round 9: older cancelBooking runs kept the old lines + subtotal and only added a "రద్దు చార్జీ" line,
            // so the document read "subtotal ₹12,000 … total ₹2,499.50". The note hides itself once the server
            // stores a consistent cancelled invoice (subtotal no longer above the total).
            <Alert severity="warning" sx={{ displayPrint: "none" }}>
              {L(
                `ఈ బిల్లు ఆర్డర్ రద్దుతో రద్దు అయింది. కింద పాత లైన్లు చరిత్ర కోసం మాత్రమే — ఇప్పుడు మొత్తం ${formatINR(invoice.totalAmount)} (రద్దు చార్జీ), బాకీ ${formatINR(invoice.balanceDue)}.`,
                `This invoice was cancelled with the order. The old lines below are kept for history — the total is now ${formatINR(invoice.totalAmount)} (cancellation charge), balance ${formatINR(invoice.balanceDue)}.`,
              )}
            </Alert>
          )}
          <TaxDocumentView
            doc={invoice}
            totalBadge={
              <CalcModeChip
                meta={invoice.calc}
                value={invoice.totalAmount}
                canChange={mayOverride}
                onEnterManual={() => setManualOpen(true)}
                onSwitchToAuto={() => overrideInvoiceTotal({ invoiceId: invoice.id, auto: true })}
              />
            }
            letterhead={{
              title,
              number: invoice.invoiceNumber,
              date: invoice.issueDate,
              customerName: customerNames[invoice.customerId],
              business: brand ? { ...settings, ...(brand.name ? { name: brand.name, brandName: brand.name } : {}), ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}) } : settings,
              // Bills print their own terms (not the quotation terms).
              terms: invoice.terms || settings.invoiceTerms,
              upiPayload: invoice.balanceDue > 0 ? invoice.upiQrPayload : undefined,
            }}
            extra={
              <>
                <SummaryLine label={L("చెల్లించింది", "Paid")} value={formatINR(invoice.amountPaid)} />
                <SummaryLine label={L("బాకీ", "Balance due")} value={formatINR(invoice.balanceDue)} bold />
              </>
            }
          />

          <ManualValueDialog
            open={manualOpen}
            title={L("Invoice మొత్తం చేతితో", "Enter invoice total manually")}
            label={L("కొత్త మొత్తం (₹)", "New total (₹)")}
            initial={invoice.totalAmount}
            min={invoice.amountPaid}
            onClose={() => setManualOpen(false)}
            onSubmit={(total, reason) => overrideInvoiceTotal({ invoiceId: invoice.id, total, reason })}
          />
          {settings.calcModes.invoice === "manual" && invoice.calc.calcMode === "auto" && mayOverride && (
            <Alert severity="info" sx={{ displayPrint: "none" }}>
              {L(
                "Invoice లు మాన్యువల్ mode లో ఉన్నాయి — మొత్తాన్ని సరిచూసి అవసరమైతే 'చేతితో నమోదు చేయి' వాడండి.",
                "Invoices are in manual mode — check the total and use 'Enter manually' if needed.",
              )}
            </Alert>
          )}
          {can.recordPayment(role) && invoice.balanceDue > 0 && !invoice.cancelled && <PaymentForm invoice={invoice} />}
          {can.refund(role) && !invoice.cancelled && <RefundForm invoice={invoice} />}
          {role === "manager" && !invoice.cancelled && <RefundForm invoice={invoice} asRequest />}
          {(role === "admin" || role === "manager") && <RefundRequests invoice={invoice} role={role} />}

          <Box sx={{ displayPrint: "none" }}>
            <Typography variant="h6" component="h2" sx={{ mt: 1, mb: 1 }}>
              {L("చెల్లింపులు", "Payments")}
            </Typography>
            <DataTable
              rows={payments}
              rowKey={(p) => p.id}
              emptyText={L("ఇంకా చెల్లింపులు లేవు.", "No payments recorded yet.")}
              columns={[
                { label: L("తేదీ", "Date"), render: (p) => formatDate(p.date) },
                {
                  label: L("రకం", "Type"),
                  render: (p) =>
                    p.type === "refund" ? (
                      <Chip size="small" color="warning" label={L("Refund", "Refund")} />
                    ) : (
                      METHOD_LABEL[p.method as PaymentMethod] ? T(METHOD_LABEL[p.method as PaymentMethod]) : p.method
                    ),
                },
                { label: L("గమనిక", "Note"), hideOnMobile: true, render: (p) => p.note || "—" },
                { label: L("ఎవరు", "By"), hideOnMobile: true, render: (p) => p.recordedByName || "—" },
                {
                  label: L("మొత్తం", "Amount"),
                  align: "right",
                  render: (p) => (p.cancelled ? <s>{formatINR(p.amount)}</s> : formatINR(p.amount)),
                },
                {
                  label: "",
                  render: (p) =>
                    p.cancelled ? (
                      <CancelledChip reason={p.cancelReason} />
                    ) : invoice.cancelled ? null : (
                      <CancelButton collection="payments" id={`${invoice.id}/${p.id}`} what={formatINR(p.amount)} />
                    ),
                },
              ]}
            />
          </Box>
          <HistorySection collection="invoices" docId={invoice.id} />
        </Box>
      )}
    </Box>
  );
}
