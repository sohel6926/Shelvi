import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Link, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useBranch } from "../../session/BranchContext";
import { hiIfOn, useLang } from "../../i18n/LanguageContext";
import { EXPENSE_SECTIONS, costDocQuery, expenseDate, setBillPhoto, subscribeExpenses, type Expense } from "../../data/records";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { PhotoUploadButton } from "../../components/PhotoUpload";
import { refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip } from "../../components/StatusChip";
import { formatDate, formatINR, monthKey, monthLabel, sum } from "../../util/format";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { liveRows, visibleRows } from "../../data/cancel";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { useCostTargetText } from "../../components/CostTargetPicker";
import { SECTION_TE } from "./sections";

export function ExpensesPage() {
  const { L, lang } = useLang();
  const sectionName = (s: string) => (lang === "te" && SECTION_TE[s] ? SECTION_TE[s] : hiIfOn(s));
  const session = useSession();
  const mayUpload = session.status === "loggedIn" && can.uploadPhotos(session.profile.role);
  const { currentBranchId } = useBranch();
  const [rows, setRows] = useState<Expense[]>([]);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [section, setSection] = useState("All");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const navigate = useNavigate();
  const targetText = useCostTargetText(bookings);
  // Staff may read only their own entries (firestore.rules costDocReadOk) — "నా ఎంట్రీలు".
  const mineUid = session.status === "loggedIn" && session.profile.role === "staff" ? session.profile.uid : null;

  useEffect(() => subscribeExpenses(currentBranchId, setRows, mineUid), [currentBranchId, mineUid]);
  useEffect(() => (mineUid ? undefined : subscribeBookings(currentBranchId, setBookings)), [currentBranchId, mineUid]);

  const months = useMemo(() => {
    const keys = new Set(rows.map((r) => monthKey(expenseDate(r))).filter(Boolean));
    keys.add(monthKey(new Date()));
    return [...keys].sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (month === "All" || monthKey(expenseDate(r)) === month) &&
        (section === "All" || r.section === section) &&
        (!q ||
          r.personName.toLowerCase().includes(q) ||
          r.subCategory.toLowerCase().includes(q) ||
          r.expenseNumber.toLowerCase().includes(q) ||
          r.staffName.toLowerCase().includes(q)),
    );
  }, [rows, month, section, search]);

  const live = useMemo(() => liveRows(filtered), [filtered]);
  const shown = visibleRows(filtered, showCancelled);

  const bySection = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const r of live) totals[r.section || "Other"] = (totals[r.section || "Other"] ?? 0) + r.totalAmount;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [live]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={mineUid ? L("ఖర్చులు — నా ఎంట్రీలు", "Expenses — my entries") : L("ఖర్చులు", "Expenses")}
        onRefresh={() => refreshFromServer(costDocQuery("expenses", currentBranchId, mineUid))}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/expenses/new")}>
            {L("కొత్త ఖర్చు", "New expense")}
          </Button>
        }
      />
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label={L("నెల", "Month")} value={month} onChange={(e) => setMonth(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="All">{L("అన్ని నెలలు", "All months")}</MenuItem>
          {months.map((m) => (
            <MenuItem key={m} value={m}>
              {monthLabel(m, lang)}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={L("విభాగం", "Section")} value={section} onChange={(e) => setSection(e.target.value)} sx={{ minWidth: 200 }}>
          {["All", ...EXPENSE_SECTIONS].map((s) => (
            <MenuItem key={s} value={s}>
              {s === "All" ? L("అన్నీ", "All") : sectionName(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          placeholder={L("వ్యక్తి / వస్తువు / నంబర్ వెతకండి", "Search person, item or number")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 220px" }}
        />
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={filtered.length - live.length} />
      </Box>
      <StatRow>
        <StatCard label={L("మొత్తం ఖర్చు", "Total spent")} value={formatINR(sum(live, (r) => r.totalAmount))} />
        <StatCard label={L("చెల్లించింది / అడ్వాన్స్", "Paid / advance")} value={formatINR(sum(live, (r) => r.paid))} tone="good" />
        <StatCard label={L("ఇంకా చెల్లించాలి", "Still to pay")} value={formatINR(sum(live, (r) => r.balanceAmount))} tone="warn" />
        <StatCard label={L("నమోదులు", "Entries")} value={live.length} />
      </StatRow>
      {bySection.length > 1 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("విభాగం వారీగా", "By section")}
          </Typography>
          <DataTable
            rows={bySection}
            rowKey={([name]) => name}
            columns={[
              { label: L("విభాగం", "Section"), render: ([name]) => sectionName(name) },
              { label: L("మొత్తం", "Amount"), align: "right", render: ([, amount]) => formatINR(amount) },
            ]}
          />
        </Box>
      )}
      <DataTable
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/expenses/${r.id}/edit`)}
        emptyText={L("ఈ ఎంపికకి ఖర్చులు లేవు.", "No expenses for this filter.")}
        columns={[
          { label: L("తేదీ", "Date"), render: (r) => formatDate(expenseDate(r), lang) },
          { label: L("విభాగం", "Section"), render: (r) => (r.subCategory ? `${sectionName(r.section)} · ${r.subCategory}` : sectionName(r.section)) },
          { label: L("వ్యక్తి", "Person"), hideOnMobile: true, render: (r) => r.personName || r.staffName || "—" },
          { label: L("దేనికి", "For"), hideOnMobile: true, render: (r) => targetText(r.costTarget) },
          { label: L("మొత్తం", "Amount"), align: "right", render: (r) => formatINR(r.totalAmount) },
          { label: L("బాకీ", "Balance"), align: "right", hideOnMobile: true, render: (r) => formatINR(r.balanceAmount) },
          {
            label: L("స్థితి", "Status"),
            render: (r) => (r.cancelled ? <CancelledChip reason={r.cancelReason} /> : <StatusChip status={r.paymentStatus} />),
          },
          {
            label: L("బిల్", "Bill"),
            render: (r) =>
              r.photoUrl ? (
                <Link href={r.photoUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                  {L("ఫోటో", "Photo")}
                </Link>
              ) : mayUpload && r.branchId && !r.cancelled ? (
                <Box component="span" onClick={(e) => e.stopPropagation()}>
                  <PhotoUploadButton
                    folder={`expenses/${r.branchId}`}
                    baseName={r.id}
                    label={L("బిల్ ఫోటో", "Bill photo")}
                    onUploaded={(url) => setBillPhoto("expenses", r.id, url)}
                  />
                </Box>
              ) : (
                "—"
              ),
          },
          {
            label: "",
            render: (r) => (r.cancelled ? null : <CancelButton collection="expenses" id={r.id} what={r.subCategory || r.section} />),
          },
        ]}
      />
    </Box>
  );
}
