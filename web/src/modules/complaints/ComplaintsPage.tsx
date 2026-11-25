import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import { useBranch } from "../../session/BranchContext";
import { subscribeCustomers, type Customer } from "../../data/customerRepository";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { subscribeStaff, type Staff } from "../../data/records";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  saveComplaint,
  subscribeComplaints,
  type Complaint,
  type ComplaintCategory,
  type ComplaintInput,
  type ComplaintSeverity,
  type ComplaintStatus,
} from "../../data/complaintsRepository";
import { errorText } from "../../data/functions";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip } from "../../components/StatusChip";
import { bookingLabel } from "../../components/CostTargetPicker";
import { formatDate } from "../../util/format";

const CATEGORY_LABEL: Record<ComplaintCategory, { te: string; en: string }> = {
  food: { te: "భోజనం / రుచి", en: "Food" },
  service: { te: "సేవ / సిబ్బంది", en: "Service" },
  delay: { te: "ఆలస్యం", en: "Delay" },
  billing: { te: "బిల్లు", en: "Billing" },
  other: { te: "ఇతర", en: "Other" },
};

const SEVERITY_LABEL: Record<ComplaintSeverity, { te: string; en: string; color: "default" | "warning" | "error" }> = {
  low: { te: "చిన్నది", en: "Low", color: "default" },
  medium: { te: "మధ్యస్థం", en: "Medium", color: "warning" },
  high: { te: "తీవ్రమైనది", en: "High", color: "error" },
};

/** Telugu reply templates per category ({name}, {resolution} are filled in). */
const REPLY_TEMPLATES: Record<ComplaintCategory, string> = {
  food:
    "నమస్కారం {name} గారు, మా భోజనం విషయంలో మీకు కలిగిన ఇబ్బందికి మనస్ఫూర్తిగా క్షమాపణలు. {resolution} మా వంట బృందంతో మాట్లాడాం — మళ్ళీ ఇలా జరగకుండా చూసుకుంటాం. — సుశీల క్యాటరింగ్స్",
  service:
    "నమస్కారం {name} గారు, మా సిబ్బంది సేవలో లోపానికి క్షమించండి. {resolution} సంబంధిత సిబ్బందితో మాట్లాడి సరిచేశాం. మీ అభిప్రాయం మాకు చాలా విలువైనది. — సుశీల క్యాటరింగ్స్",
  delay:
    "నమస్కారం {name} గారు, మేము ఆలస్యంగా రావడం వల్ల మీకు కలిగిన ఇబ్బందికి క్షమించండి. {resolution} ఇకపై ముందుగానే బయలుదేరి సమయానికి వడ్డిస్తాం. — సుశీల క్యాటరింగ్స్",
  billing:
    "నమస్కారం {name} గారు, బిల్లు విషయంలో గందరగోళానికి క్షమించండి. {resolution} సరిచేసిన వివరాలు మీకు పంపుతున్నాం. ఏమైనా సందేహం ఉంటే ఫోన్ చేయండి. — సుశీల క్యాటరింగ్స్",
  other:
    "నమస్కారం {name} గారు, మీరు తెలియజేసినందుకు ధన్యవాదాలు. {resolution} మళ్ళీ ఇలా జరగకుండా జాగ్రత్త పడతాం. — సుశీల క్యాటరింగ్స్",
};

function fillTemplate(category: ComplaintCategory, name: string, resolution: string): string {
  const r = resolution.trim();
  return REPLY_TEMPLATES[category]
    .replace("{name}", name.trim() || "")
    .replace("{resolution}", r ? (/[.!?।]$/.test(r) ? r : `${r}.`) : "")
    .replace(/\s{2,}/g, " ");
}

function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

const EMPTY: ComplaintInput = {
  customerId: "",
  customerName: "",
  customerPhone: "",
  bookingId: "",
  category: "food",
  severity: "medium",
  description: "",
  status: "open",
  assignedToStaffId: "",
  assignedToName: "",
  resolution: "",
  replyText: "",
};

function ComplaintDialog({
  value,
  wasResolved,
  customers,
  bookings,
  staff,
  branchId,
  onClose,
}: {
  value: ComplaintInput | null;
  wasResolved: boolean;
  customers: Customer[];
  bookings: Booking[];
  staff: Staff[];
  branchId: string | null;
  onClose: () => void;
}) {
  const { L, T, lang } = useLang();
  const [f, setF] = useState<ComplaintInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (value) setF(value);
    setError(null);
    setCopied(false);
  }, [value]);

  if (!value) return null;
  const set = (p: Partial<ComplaintInput>) => setF((x) => ({ ...x, ...p }));
  const customerBookings = bookings.filter((b) => !f.customerId || b.customerId === f.customerId);
  const booking = bookings.find((b) => b.id === f.bookingId);
  const bId = booking?.branchId || branchId;
  const resolving = f.status === "resolved";
  const valid = !!bId && f.customerName.trim().length > 0 && f.description.trim().length >= 3 && (!resolving || f.resolution.trim().length >= 3);

  const save = async () => {
    if (!bId) return;
    setBusy(true);
    setError(null);
    try {
      await saveComplaint(
        { ...f, customerName: f.customerName.trim(), description: f.description.trim(), resolution: f.resolution.trim(), replyText: f.replyText.trim() },
        bId,
        wasResolved,
      );
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(f.replyText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{f.id ? L("ఫిర్యాదు", "Complaint") : L("కొత్త ఫిర్యాదు", "New complaint")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!bId && <Alert severity="info">{L("పైన శాఖ (branch) ఎంచుకోండి లేదా ఒక event ఎంచుకోండి.", "Pick a branch above or an event.")}</Alert>}
        <Autocomplete
          options={customers}
          value={customers.find((c) => c.id === f.customerId) ?? null}
          onChange={(_e, c) => set({ customerId: c?.id ?? "", customerName: c?.name ?? f.customerName, customerPhone: c?.phone ?? f.customerPhone, bookingId: "" })}
          getOptionLabel={(c) => `${c.name}${c.phone ? " · " + c.phone : ""}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} size="small" label={L("కస్టమర్", "Customer")} />}
        />
        {!f.customerId && (
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label={L("పేరు", "Name")} value={f.customerName} onChange={(e) => set({ customerName: e.target.value })} />
            <TextField size="small" type="tel" label={L("ఫోన్", "Phone")} value={f.customerPhone} onChange={(e) => set({ customerPhone: e.target.value })} />
          </Box>
        )}
        <TextField select size="small" label={L("Event (ఐచ్ఛికం)", "Event (optional)")} value={f.bookingId} onChange={(e) => set({ bookingId: e.target.value })}>
          <MenuItem value="">{L("ఏదీ కాదు", "None")}</MenuItem>
          {customerBookings.slice(0, 50).map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {bookingLabel(b, lang)}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField select size="small" label={L("దేని గురించి", "About")} value={f.category} onChange={(e) => set({ category: e.target.value as ComplaintCategory })}>
            {COMPLAINT_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {T(CATEGORY_LABEL[c])}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label={L("ఎంత తీవ్రం", "Severity")} value={f.severity} onChange={(e) => set({ severity: e.target.value as ComplaintSeverity })}>
            {COMPLAINT_SEVERITIES.map((c) => (
              <MenuItem key={c} value={c}>
                {T(SEVERITY_LABEL[c])}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <TextField multiline minRows={2} size="small" label={L("ఏం జరిగింది", "What happened")} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField
            select
            size="small"
            label={L("ఎవరు చూస్తారు", "Assigned to")}
            value={f.assignedToStaffId}
            onChange={(e) => {
              const st = staff.find((x) => x.id === e.target.value);
              set({ assignedToStaffId: st?.id ?? "", assignedToName: st?.name ?? "", status: st && f.status === "open" ? "in-progress" : f.status });
            }}
          >
            <MenuItem value="">{L("ఇంకా ఎవరూ లేరు", "Nobody yet")}</MenuItem>
            {staff.map((x) => (
              <MenuItem key={x.id} value={x.id}>
                {x.name}
                {x.jobRole ? ` · ${x.jobRole}` : ""}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label={L("స్థితి", "Status")} value={f.status} onChange={(e) => set({ status: e.target.value as ComplaintStatus })}>
            {COMPLAINT_STATUSES.map((st) => (
              <MenuItem key={st} value={st}>
                {st === "open" ? L("తెరిచి ఉంది", "Open") : st === "in-progress" ? L("చూస్తున్నాం", "In progress") : L("పరిష్కరించాం", "Resolved")}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        {(resolving || f.resolution) && (
          <TextField
            multiline
            minRows={2}
            size="small"
            required={resolving}
            label={L("ఏం చేశాం (పరిష్కారం)", "What we did (resolution)")}
            value={f.resolution}
            onChange={(e) => set({ resolution: e.target.value })}
          />
        )}
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
            <Typography variant="subtitle2">{L("Customer కి జవాబు (తెలుగు)", "Reply to the customer (Telugu)")}</Typography>
            <Button size="small" onClick={() => set({ replyText: fillTemplate(f.category, f.customerName, f.resolution) })}>
              {L("తయారు జవాబు పెట్టు", "Use the template")}
            </Button>
          </Box>
          <TextField fullWidth multiline minRows={3} size="small" value={f.replyText} onChange={(e) => set({ replyText: e.target.value })} />
          {f.replyText && (
            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={copy}>
                {copied ? <><CheckIcon fontSize="small" sx={{ mr: 0.5 }} />{L("Copy అయింది", "Copied")}</> : L("Copy చేయి", "Copy")}
              </Button>
              {f.customerPhone && (
                <Button size="small" variant="outlined" component="a" href={waLink(f.customerPhone, f.replyText)} target="_blank" rel="noopener">
                  {L("WhatsApp లో తెరువు", "Open in WhatsApp")}
                </Button>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Back")}
        </Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("సేవ్", "Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** R7-10 complaints / feedback: list, add, assign, resolve with a Telugu reply. */
export function ComplaintsPage() {
  const { L, T, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [rows, setRows] = useState<Complaint[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState<ComplaintStatus | "notResolved" | "all">("notResolved");
  const [editing, setEditing] = useState<{ value: ComplaintInput; wasResolved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeComplaints(currentBranchId, setRows, (e) => setError(errorText(e, lang))), [currentBranchId, lang]);
  useEffect(() => subscribeCustomers((c) => setCustomers(c.filter((x) => !x.cancelled))), []);
  useEffect(() => subscribeBookings(currentBranchId, (b) => setBookings(b.filter((x) => !x.cancelled))), [currentBranchId]);
  useEffect(() => subscribeStaff(currentBranchId, (s) => setStaff(s.filter((x) => x.active && !x.cancelled))), [currentBranchId]);

  const shown = useMemo(
    () => rows.filter((r) => (filter === "all" ? true : filter === "notResolved" ? r.status !== "resolved" : r.status === filter)),
    [rows, filter],
  );
  const byId = new Map(bookings.map((b) => [b.id, b]));
  // QA fix 7: "open" = everything not resolved (open + in progress); both parts are shown.
  const newCount = rows.filter((r) => r.status === "open").length;
  const inProgressCount = rows.filter((r) => r.status === "in-progress").length;
  const openCount = newCount + inProgressCount;
  const highOpen = rows.filter((r) => r.status !== "resolved" && r.severity === "high").length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("ఫిర్యాదులు / అభిప్రాయాలు", "Complaints & feedback")}
        onRefresh={() => refreshFromServer(branchQuery("complaints", currentBranchId))}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ value: { ...EMPTY }, wasResolved: false })}>
            {L("కొత్త ఫిర్యాదు", "New complaint")}
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <StatRow>
        <StatCard
          label={L("తేలనివి (తెరిచి + చూస్తున్నాం)", "Not resolved (open + in progress)")}
          value={
            <>
              {openCount}
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {L(`తెరిచి ${newCount} · చూస్తున్నాం ${inProgressCount}`, `open ${newCount} · in progress ${inProgressCount}`)}
              </Typography>
            </>
          }
          tone={openCount ? "warn" : "good"}
        />
        <StatCard label={L("తీవ్రమైనవి (తేలనివి)", "High, not resolved")} value={highOpen} tone={highOpen ? "warn" : "good"} />
        <StatCard label={L("పరిష్కరించినవి", "Resolved")} value={rows.filter((r) => r.status === "resolved").length} tone="good" />
      </StatRow>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {(["notResolved", "open", "in-progress", "resolved", "all"] as const).map((k) => (
          <Chip
            key={k}
            clickable
            color={filter === k ? "primary" : "default"}
            variant={filter === k ? "filled" : "outlined"}
            onClick={() => setFilter(k)}
            label={
              k === "notResolved"
                ? L("తేలనివి", "Not resolved")
                : k === "open"
                  ? L("తెరిచి ఉన్నవి", "Open")
                  : k === "in-progress"
                    ? L("చూస్తున్నాం", "In progress")
                    : k === "resolved"
                      ? L("పరిష్కరించినవి", "Resolved")
                      : L("అన్నీ", "All")
            }
          />
        ))}
      </Box>
      <DataTable
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={(r) => setEditing({ value: { ...r }, wasResolved: r.status === "resolved" })}
        emptyText={L("ఫిర్యాదులు లేవు — మంచి విషయం!", "No complaints — good news!")}
        columns={[
          { label: L("తేదీ", "Date"), render: (r) => formatDate(r.createdAt, lang) },
          { label: L("కస్టమర్", "Customer"), render: (r) => r.customerName || "—" },
          { label: L("దేని గురించి", "About"), render: (r) => T(CATEGORY_LABEL[r.category]) },
          {
            label: L("తీవ్రత", "Severity"),
            hideOnMobile: true,
            render: (r) => <Chip size="small" color={SEVERITY_LABEL[r.severity].color} label={T(SEVERITY_LABEL[r.severity])} />,
          },
          { label: L("Event", "Event"), hideOnMobile: true, render: (r) => (byId.get(r.bookingId) ? bookingLabel(byId.get(r.bookingId) as Booking, lang) : "—") },
          { label: L("ఎవరు చూస్తారు", "Assigned"), hideOnMobile: true, render: (r) => r.assignedToName || "—" },
          { label: L("స్థితి", "Status"), render: (r) => <StatusChip status={r.status} /> },
        ]}
      />
      {editing && (
        <ComplaintDialog
          value={editing.value}
          wasResolved={editing.wasResolved}
          customers={customers}
          bookings={bookings}
          staff={staff}
          branchId={currentBranchId}
          onClose={() => setEditing(null)}
        />
      )}
    </Box>
  );
}
