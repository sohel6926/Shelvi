import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Link, MenuItem, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { costDocQuery, setBillPhoto, subscribePurchases, type Purchase } from "../../data/records";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { liveRows, visibleRows } from "../../data/cancel";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { PhotoUploadButton } from "../../components/PhotoUpload";
import { refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip } from "../../components/StatusChip";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { useCostTargetText } from "../../components/CostTargetPicker";
import { formatDate, formatINR, monthKey, monthLabel, sum } from "../../util/format";

export function PurchasesPage() {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const mayUpload = session.status === "loggedIn" && can.uploadPhotos(session.profile.role);
  const { currentBranchId } = useBranch();
  const [rows, setRows] = useState<Purchase[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const targetText = useCostTargetText(bookings);
  // Staff may read only their own entries (firestore.rules costDocReadOk) — "నా ఎంట్రీలు".
  const mineUid = session.status === "loggedIn" && session.profile.role === "staff" ? session.profile.uid : null;

  useEffect(() => subscribePurchases(currentBranchId, setRows, mineUid), [currentBranchId, mineUid]);
  useEffect(() => (mineUid ? undefined : subscribeBookings(currentBranchId, setBookings)), [currentBranchId, mineUid]);

  const months = useMemo(() => {
    const keys = new Set(rows.map((r) => monthKey(r.purchaseDate)).filter(Boolean));
    keys.add(monthKey(new Date()));
    return [...keys].sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (month === "All" || monthKey(r.purchaseDate) === month) &&
        (!q ||
          r.vendorNameSnapshot.toLowerCase().includes(q) ||
          r.billNumber.toLowerCase().includes(q) ||
          r.purchaseNumber.toLowerCase().includes(q) ||
          r.staffName.toLowerCase().includes(q)),
    );
  }, [rows, month, search]);
  const live = liveRows(filtered);
  const shown = visibleRows(filtered, showCancelled);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={mineUid ? L("కొనుగోళ్లు — నా ఎంట్రీలు", "Purchases — my entries") : L("కొనుగోళ్లు", "Purchases")}
        onRefresh={() => refreshFromServer(costDocQuery("purchases", currentBranchId, mineUid))}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/purchases/new")}>
            {L("కొత్త బిల్", "New bill")}
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
        <TextField
          size="small"
          placeholder={L("సరఫరాదారు / బిల్ / సిబ్బంది వెతకండి", "Search vendor, bill or staff")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 220px" }}
        />
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={filtered.length - live.length} />
      </Box>
      <StatRow>
        <StatCard label={L("మొత్తం కొనుగోళ్లు", "Total purchases")} value={formatINR(sum(live, (r) => r.totalAmount))} />
        <StatCard label={L("బిల్లులు", "Bills")} value={live.length} />
        <StatCard label={L("ఇంకా చెల్లించాలి", "Still to pay")} value={formatINR(sum(live, (r) => r.balance))} tone="warn" />
      </StatRow>
      <DataTable
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/purchases/${r.id}/edit`)}
        emptyText={L("ఈ ఎంపికకి కొనుగోళ్లు లేవు.", "No purchases for this filter.")}
        columns={[
          { label: L("తేదీ", "Date"), render: (r) => formatDate(r.purchaseDate, lang) },
          { label: L("సరఫరాదారు", "Vendor"), render: (r) => r.vendorNameSnapshot || "—" },
          { label: L("దేనికి", "For"), hideOnMobile: true, render: (r) => targetText(r.costTarget) },
          { label: L("బిల్ నం.", "Bill no."), hideOnMobile: true, render: (r) => r.billNumber || "—" },
          { label: L("వస్తువులు", "Items"), align: "right", hideOnMobile: true, render: (r) => r.itemCount },
          { label: L("మొత్తం", "Amount"), align: "right", render: (r) => formatINR(r.totalAmount) },
          {
            label: L("స్థితి", "Status"),
            render: (r) => (r.cancelled ? <CancelledChip reason={r.cancelReason} /> : <StatusChip status={r.paymentStatus} />),
          },
          {
            label: L("బిల్", "Bill"),
            render: (r) =>
              r.billPhotoUrl ? (
                <Link href={r.billPhotoUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                  {L("ఫోటో", "Photo")}
                </Link>
              ) : mayUpload && r.branchId && !r.cancelled ? (
                <Box component="span" onClick={(e) => e.stopPropagation()}>
                  <PhotoUploadButton
                    folder={`purchases/${r.branchId}`}
                    baseName={r.id}
                    label={L("బిల్ ఫోటో", "Bill photo")}
                    onUploaded={(url) => setBillPhoto("purchases", r.id, url)}
                  />
                </Box>
              ) : (
                "—"
              ),
          },
          {
            label: "",
            render: (r) => (r.cancelled ? null : <CancelButton collection="purchases" id={r.id} what={r.billNumber || r.vendorNameSnapshot} />),
          },
        ]}
      />
    </Box>
  );
}
