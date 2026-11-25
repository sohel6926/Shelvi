import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import {
  errorText,
  getVendorDues,
  migratePaymentStatuses,
  PAYMENT_METHODS,
  recordVendorPayment,
  type DueBill,
  type PaymentMethod,
  type VendorDue,
} from "../../data/functions";
import { loadOpenBills } from "../../data/records";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip } from "../../components/StatusChip";
import { formatDate, formatINR, sum } from "../../util/format";

const round2 = (n: number) => Math.round(n * 100) / 100;
const KIND: Record<DueBill["collection"], { te: string; en: string }> = {
  purchases: { te: "కొనుగోలు", en: "Purchase" },
  expenses: { te: "ఖర్చు", en: "Expense" },
  outsideOrders: { te: "బయటి ఆర్డర్", en: "Outside order" },
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Oldest bill first: split a payment across the open bills. */
function autoAllocate(bills: DueBill[], amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = amount;
  const open = bills.filter((b) => b.balance > 0 && !b.held).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  for (const b of open) {
    if (left <= 0) break;
    const take = round2(Math.min(b.balance, left));
    out[`${b.collection}/${b.id}`] = take;
    left = round2(left - take);
  }
  return out;
}

/** Bills of a vendor: from the server if it sent them, else read from Firestore. */
function useBills(vendor: VendorDue | null): { bills: DueBill[] | null; error: string | null } {
  const { lang } = useLang();
  const [bills, setBills] = useState<DueBill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setBills(null);
    setError(null);
    if (!vendor) return;
    if (vendor.bills.length) {
      setBills(vendor.bills);
      return;
    }
    loadOpenBills(vendor.vendorId, vendor.vendorName).then(setBills, (e) => {
      setError(errorText(e, lang));
      setBills([]);
    });
  }, [vendor, lang]);
  return { bills, error };
}

function PayDialog({ vendor, onClose, onPaid }: { vendor: VendorDue | null; onClose: () => void; onPaid: () => void }) {
  const { L, T, lang } = useLang();
  const { bills, error: billsError } = useBills(vendor);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [note, setNote] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vendor) return;
    const payable = round2(vendor.outstanding - vendor.heldAmount);
    setAmountText(payable > 0 ? String(payable) : "");
    setDate(today());
    setMethod("Cash");
    setNote("");
    setError(null);
  }, [vendor]);
  useEffect(() => {
    if (!vendor || !bills) return;
    const a = autoAllocate(bills, round2(vendor.outstanding - vendor.heldAmount));
    setAlloc(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])));
  }, [vendor, bills]);

  if (!vendor) return null;
  const amount = Number(amountText.replace(/,/g, "")) || 0;
  const open = (bills ?? []).filter((b) => b.balance > 0 && !b.held);
  const heldBills = (bills ?? []).filter((b) => b.balance > 0 && b.held);
  const allocTotal = round2(Object.values(alloc).reduce((a, v) => a + (Number(v) || 0), 0));
  const overBill = open.some((b) => (Number(alloc[`${b.collection}/${b.id}`]) || 0) > b.balance + 0.001);
  const valid = amount > 0 && bills !== null && allocTotal <= amount + 0.005 && !overBill;

  const redistribute = (amt: number) => {
    const a = autoAllocate(bills ?? [], amt);
    setAlloc(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await recordVendorPayment({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        amount,
        date,
        method,
        allocations: open
          .map((b) => ({ collection: b.collection, id: b.id, amount: Number(alloc[`${b.collection}/${b.id}`]) || 0 }))
          .filter((a) => a.amount > 0),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onPaid();
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        {L("చెల్లింపు", "Pay")} — {vendor.vendorName}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {(error || billsError) && <Alert severity="error">{error || billsError}</Alert>}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" } }}>
          <TextField
            size="small"
            label={L("ఎంత", "Amount")}
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              redistribute(Number(e.target.value.replace(/,/g, "")) || 0);
            }}
          />
          <TextField size="small" type="date" label={L("తేదీ", "Date")} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label={L("ఎలా", "Method")} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <MenuItem key={m} value={m}>
                {m === "BankTransfer" ? L("బ్యాంక్ ట్రాన్స్‌ఫర్", "Bank transfer") : m === "Other" ? L("ఇతర", "Other") : m}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {bills === null && <CircularProgress size={22} />}
        {open.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {L("ఏ బిల్లులకు (పాతవి ముందు)", "Which bills (oldest first)")}
            </Typography>
            {open.map((b) => {
              const k = `${b.collection}/${b.id}`;
              return (
                <Box key={k} sx={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 1, alignItems: "center", mb: 1 }}>
                  <Typography variant="body2">
                    {T(KIND[b.collection])} {b.label} · {b.date ? formatDate(new Date(b.date), lang) : "—"}
                  </Typography>
                  <Typography variant="body2" sx={{ textAlign: "right" }}>
                    {L("బాకీ", "Due")} {formatINR(b.balance)}
                  </Typography>
                  <TextField
                    size="small"
                    value={alloc[k] ?? ""}
                    error={(Number(alloc[k]) || 0) > b.balance + 0.001}
                    onChange={(e) => setAlloc((a) => ({ ...a, [k]: e.target.value }))}
                  />
                </Box>
              );
            })}
            <Typography variant="body2" color={allocTotal <= amount + 0.005 ? "text.secondary" : "error"}>
              {L("బిల్లులకు పంచింది", "Allocated")}: {formatINR(allocTotal)} / {formatINR(amount)}
              {allocTotal < amount - 0.005 && ` · ${L("మిగతాది అడ్వాన్స్ గా ఉంటుంది", "the rest stays as an advance")}`}
            </Typography>
          </Box>
        )}
        {heldBills.length > 0 && (
          <Alert severity="warning">
            {L("ఈ బిల్లుల చెల్లింపు ఆగింది (ఆర్డర్‌తో సరిపోలలేదు) — ముందు బిల్ సరిచేయాలి లేదా యజమాని విడుదల చేయాలి:", "Payment is held on these bills (they do not match their order) — correct the bill or have the owner release it first:")}{" "}
            {heldBills.map((b) => `${b.label} ${formatINR(b.balance)}`).join(", ")}
          </Alert>
        )}
        <TextField size="small" label={L("గమనిక", "Note")} value={note} onChange={(e) => setNote(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Back")}
        </Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("చెల్లింపు నమోదు", "Record payment")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** R7-8 (admin): who we owe — per vendor bills, paid, outstanding, oldest due date; pay dialog. */
export function VendorDuesPage() {
  const { L, T, lang } = useLang();
  const [rows, setRows] = useState<VendorDue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<VendorDue | null>(null);
  const [open, setOpen] = useState<VendorDue | null>(null);
  const openBills = useBills(open);
  const [migrating, setMigrating] = useState(false);
  const [migrated, setMigrated] = useState<string | null>(null);

  const migrate = async () => {
    setMigrating(true);
    setError(null);
    try {
      const counts = await migratePaymentStatuses({});
      const total = Object.values(counts).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
      setMigrated(L(`పాత బిల్లుల స్థితులు మార్చాం (${total}).`, `Old bill statuses converted (${total}).`));
      await load();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setMigrating(false);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await getVendorDues());
    } catch (e) {
      setError(errorText(e, lang));
      setRows([]);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = (rows ?? []).slice().sort((a, b) => b.outstanding - a.outstanding);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("సరఫరాదారుల బాకీలు", "Vendor dues")}
        onRefresh={load}
        action={
          <Button variant="outlined" size="small" onClick={migrate} disabled={migrating}>
            {L("పాత బిల్లుల స్థితి మార్చు (ఒక్కసారి)", "Convert old bill statuses (once)")}
          </Button>
        }
      />
      {migrated && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {migrated}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {rows === null ? (
        <CircularProgress />
      ) : (
        <>
          <StatRow>
            <StatCard label={L("మనం ఇవ్వాల్సింది", "We owe")} value={formatINR(sum(list, (v) => v.outstanding))} tone="warn" />
            <StatCard label={L("బాకీ ఉన్న సరఫరాదారులు", "Vendors with dues")} value={list.filter((v) => v.outstanding > 0).length} />
            {sum(list, (v) => v.heldAmount) > 0 && (
              <StatCard label={L("చెల్లింపు ఆపినవి (బిల్ తేడా)", "Held (bill mismatch)")} value={formatINR(sum(list, (v) => v.heldAmount))} tone="warn" />
            )}
          </StatRow>
          <DataTable
            rows={list}
            rowKey={(v) => v.vendorId || v.vendorName}
            onRowClick={(v) => setOpen(v)}
            emptyText={L("బాకీలు లేవు.", "No dues.")}
            columns={[
              { label: L("సరఫరాదారు", "Vendor"), render: (v) => v.vendorName || "—" },
              { label: L("బిల్లులు", "Bills"), align: "right", hideOnMobile: true, render: (v) => `${v.billCount} · ${formatINR(v.billed)}` },
              { label: L("చెల్లించింది", "Paid"), align: "right", hideOnMobile: true, render: (v) => formatINR(v.paid) },
              { label: L("బాకీ", "Outstanding"), align: "right", render: (v) => (
                  <>
                    <b>{formatINR(v.outstanding)}</b>
                    {v.heldAmount > 0 && (
                      <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                        {L("ఆగింది", "Held")} {formatINR(v.heldAmount)}
                      </Typography>
                    )}
                  </>
                ) },
              {
                label: L("పాత బాకీ తేదీ", "Oldest due"),
                hideOnMobile: true,
                render: (v) => (v.oldestDueDate ? formatDate(new Date(v.oldestDueDate), lang) : "—"),
              },
              {
                label: "",
                render: (v) =>
                  v.outstanding - v.heldAmount > 0.005 ? (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPaying(v);
                      }}
                    >
                      {L("చెల్లించు", "Pay")}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} fullWidth maxWidth="sm">
        <DialogTitle>{open?.vendorName}</DialogTitle>
        <DialogContent>
          {openBills.error && <Alert severity="error">{openBills.error}</Alert>}
          {open && openBills.bills === null && <CircularProgress size={22} />}
          {open && openBills.bills && (
            <DataTable
              rows={openBills.bills}
              rowKey={(b) => `${b.collection}/${b.id}`}
              emptyText={L("తెరిచి ఉన్న బిల్లులు లేవు.", "No open bills.")}
              columns={[
                { label: L("రకం", "Kind"), render: (b) => T(KIND[b.collection]) },
                { label: L("బిల్", "Bill"), render: (b) => b.label || "—" },
                { label: L("తేదీ", "Date"), render: (b) => (b.date ? formatDate(new Date(b.date), lang) : "—") },
                { label: L("మొత్తం", "Amount"), align: "right", render: (b) => formatINR(b.amount) },
                { label: L("బాకీ", "Due"), align: "right", render: (b) => formatINR(b.balance) },
                { label: L("స్థితి", "Status"), render: (b) => <StatusChip status={b.paymentStatus} /> },
              ]}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(null)}>{L("మూసివేయి", "Close")}</Button>
        </DialogActions>
      </Dialog>
      <PayDialog vendor={paying} onClose={() => setPaying(null)} onPaid={load} />
    </Box>
  );
}
