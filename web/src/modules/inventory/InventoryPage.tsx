import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import {
  adjustStock,
  expiryStatusOf,
  saveInventoryItemMetadata,
  subscribeBatches,
  subscribeInventory,
  subscribeReservations,
  type InventoryItem,
  type StockBatch,
  type StockReservation,
} from "../../data/inventoryRepository";
import { useBusinessSettings } from "../../data/settingsRepository";
import { StockAdjustRequests } from "./StockAdjustRequests";
import { StoreStockDialog } from "./StoreStockDialog";
import { BatchSafety } from "./BatchSafety";
import { errorText, refreshStockReservations, STOCK_REASONS, type StockReason } from "../../data/functions";
import { liveRows, visibleRows } from "../../data/cancel";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { branchQuery, refreshFromServer } from "../../data/refresh";

const isLow = (i: InventoryItem) => i.quantityInStock <= i.reorderLevel;

const REASON_LABEL: Record<StockReason, { te: string; en: string }> = {
  count: { te: "లెక్కపెట్టాం (అసలు ఉన్నది)", en: "Counted (actual stock)" },
  damage: { te: "పాడైంది / పారేశాం", en: "Damaged / thrown away" },
  return: { te: "తిరిగి వచ్చింది / తిరిగి ఇచ్చాం", en: "Returned" },
  correction: { te: "తప్పు సరిచేయడం", en: "Correction" },
};

const numOrNaN = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(/,/g, "")));

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Module 2d: red "expired" / amber "expires soon" chip for a date; nothing when the date is far or missing. */
function ExpiryChip({ day, alertDays }: { day: string; alertDays: number }) {
  const { L } = useLang();
  const st = expiryStatusOf(day, todayIso(), alertDays);
  if (st === "expired") return <Chip size="small" color="error" label={L(`గడువు దాటింది ${day}`, `Expired ${day}`)} />;
  if (st === "soon") return <Chip size="small" color="warning" label={L(`గడువు ${day}`, `Expires ${day}`)} />;
  return null;
}

/** Module 2d: the batches of one tracked item, earliest expiry first (that one is used first). */
function BatchList({ item, alertDays }: { item: InventoryItem; alertDays: number }) {
  const { L } = useLang();
  const session = useSession();
  const canManage = session.status === "loggedIn" && session.profile.role !== "staff";
  const [rows, setRows] = useState<StockBatch[] | null>(null);
  useEffect(() => subscribeBatches(item.id, setRows, () => setRows([])), [item.id]);
  if (rows === null) return null;
  const loose = Math.round((item.quantityInStock - rows.reduce((s, b) => s + b.qty, 0)) * 1000) / 1000;
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
      <Typography variant="subtitle2">{L("బ్యాచ్‌లు (ముందు గడువు ఉన్నది ముందు వాడతారు)", "Batches (earliest expiry is used first)")}</Typography>
      {loose > 0 && (
        <Typography variant="body2" color="text.secondary">
          {L(`గడువు తేదీ లేని పాత నిల్వ: ${loose} ${item.unit} — ఇది ముందు వాడబడుతుంది`, `Older stock without a date: ${loose} ${item.unit} — used first`)}
        </Typography>
      )}
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {L("ఇంకా బ్యాచ్‌లు లేవు. నిల్వ లోపలికి వచ్చినప్పుడు గడువు తేదీ రాయండి.", "No batches yet. Enter the expiry date when stock comes in.")}
        </Typography>
      ) : (
        rows.map((b) => (
          <Box key={b.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.25, flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ minWidth: 90 }}>
              <b>{b.qty} {item.unit}</b>
            </Typography>
            <Typography variant="body2">{b.expiryDay || L("తేదీ లేదు", "no date")}</Typography>
            {b.batchNo && <Typography variant="body2" color="text.secondary">#{b.batchNo}</Typography>}
            <ExpiryChip day={b.expiryDay} alertDays={alertDays} />
            {canManage && <BatchSafety itemId={item.id} batchId={b.id} hold={b.hold} holdReason={b.holdReason} unit={item.unit} />}
          </Box>
        ))
      )}
    </Box>
  );
}

/** R7-2: stock changes only through adjustStock, always with a reason. */
function AdjustDialog({ item, reservations, onClose }: { item: InventoryItem | null; reservations: StockReservation[]; onClose: () => void }) {
  const { L, T, lang } = useLang();
  const [reason, setReason] = useState<StockReason>("count");
  const [dir, setDir] = useState<"IN" | "OUT">("IN");
  const [qtyText, setQtyText] = useState("");
  const [note, setNote] = useState("");
  const [expiryDay, setExpiryDay] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useBusinessSettings();

  useEffect(() => {
    setReason("count");
    setDir("IN");
    setQtyText("");
    setNote("");
    setExpiryDay("");
    setBatchNo("");
    setError(null);
  }, [item]);

  if (!item) return null;
  const holds = reservations
    .map((r) => ({ bookingId: r.bookingId, day: r.day, customer: r.customer, ...(r.lines.find((l) => l.inventoryItemId === item.id) ?? { reserved: 0, short: 0 }) }))
    .filter((h) => h.reserved > 0 || h.short > 0);
  const n = numOrNaN(qtyText);
  // count: the person types what is actually there; the change is counted − current.
  const delta = reason === "count" ? n - item.quantityInStock : reason === "damage" ? -n : dir === "IN" ? n : -n;
  const valid = Number.isFinite(n) && n >= 0 && Number.isFinite(delta) && delta !== 0 && item.quantityInStock + delta >= 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await adjustStock(
        item.id,
        delta > 0 ? "IN" : "OUT",
        Math.abs(delta),
        reason,
        note.trim() || undefined,
        item.trackExpiry && delta > 0 && expiryDay ? { expiryDay, batchNo: batchNo.trim() || undefined } : undefined,
      );
      // Module 4d (B5): a big change by store / staff waits for a supervisor — say so, the stock has not moved
      if (r.pending) window.alert(L("ఇది పెద్ద మార్పు కాబట్టి ఆమోదం కోసం పంపాం. ఆమోదించే వరకు నిల్వ మారదు.", "This is a big change, so it was sent for approval. The stock does not change until it is approved."));
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>
        {L("నిల్వ సరిచేయి", "Adjust stock")} — {item.name}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Typography variant="body2">
          {L("ఇప్పుడు ఉన్నది", "In stock now")}: <b>{item.quantityInStock} {item.unit}</b>
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select size="small" label={L("కారణం", "Reason")} value={reason} onChange={(e) => setReason(e.target.value as StockReason)}>
          {STOCK_REASONS.map((r) => (
            <MenuItem key={r} value={r}>
              {T(REASON_LABEL[r])}
            </MenuItem>
          ))}
        </TextField>
        {(reason === "return" || reason === "correction") && (
          <ToggleButtonGroup exclusive size="small" color="primary" value={dir} onChange={(_, v) => v && setDir(v)}>
            <ToggleButton value="IN">{L("కలపాలి (+)", "Add (+)")}</ToggleButton>
            <ToggleButton value="OUT">{L("తీసేయాలి (−)", "Remove (−)")}</ToggleButton>
          </ToggleButtonGroup>
        )}
        <TextField
          size="small"
          autoFocus
          label={reason === "count" ? L(`అసలు ఉన్నది (${item.unit})`, `Actual quantity (${item.unit})`) : L(`ఎంత (${item.unit})`, `How much (${item.unit})`)}
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value)}
          helperText={
            Number.isFinite(delta) && delta !== 0
              ? `${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta * 1000) / 1000)} ${item.unit} → ${Math.round((item.quantityInStock + delta) * 1000) / 1000} ${item.unit}`
              : " "
          }
          error={Number.isFinite(delta) && item.quantityInStock + delta < 0}
        />
        {item.trackExpiry && Number.isFinite(delta) && delta > 0 && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <TextField
              size="small"
              type="date"
              label={L("గడువు తేదీ (ప్యాక్ మీద)", "Expiry date (on the pack)")}
              value={expiryDay}
              onChange={(e) => setExpiryDay(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={L("రాస్తే ఈ నిల్వ ఒక బ్యాచ్‌గా లెక్కలోకి వస్తుంది", "With a date, this stock is kept as a batch")}
            />
            <TextField size="small" label={L("బ్యాచ్ నంబర్", "Batch no.")} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} sx={{ width: 140 }} />
          </Box>
        )}
        <TextField size="small" multiline minRows={2} label={L("గమనిక", "Note")} value={note} onChange={(e) => setNote(e.target.value)} />
        {item.trackExpiry && <BatchList item={item} alertDays={settings.expiryAlert.days} />}
        {holds.length > 0 && (
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1 }}>
            <Typography variant="subtitle2">{L("ఖరారైన ఈవెంట్‌లకు రిజర్వ్ అయినది", "Reserved for confirmed events")}</Typography>
            {holds.map((h) => (
              <Typography key={h.bookingId} variant="body2">
                {h.day} · {h.customer || h.bookingId} · <b>{h.reserved} {item.unit}</b>
                {h.short > 0 ? L(` (ఇంకా ${h.short} తక్కువ)`, ` (short by ${h.short})`) : ""}
              </Typography>
            ))}
          </Box>
        )}
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

/** Admin: item name / unit / category / reorder level. New items start at 0 stock (rules). */
function ItemDialog({ item, open, branchId, onClose }: { item: InventoryItem | null; open: boolean; branchId: string | null; onClose: () => void }) {
  const { L, lang } = useLang();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [category, setCategory] = useState("");
  const [reorder, setReorder] = useState("");
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setUnit(item?.unit || "kg");
    setCategory(item?.category ?? "");
    setReorder(item ? String(item.reorderLevel) : "");
    setTrackExpiry(item?.trackExpiry ?? false);
    setError(null);
  }, [open, item]);

  const r = numOrNaN(reorder || "0");
  const valid = name.trim() && unit.trim() && Number.isFinite(r) && r >= 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveInventoryItemMetadata({ id: item?.id, name: name.trim(), unit: unit.trim(), category: category.trim(), reorderLevel: r, trackExpiry }, branchId);
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{item ? L("వస్తువు మార్చు", "Edit item") : L("కొత్త stock వస్తువు", "New stock item")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField size="small" label={L("పేరు", "Name")} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField select size="small" label={L("యూనిట్", "Unit")} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {[...new Set([unit, "kg", "L", "pcs"])].map((u) => (
            <MenuItem key={u} value={u}>
              {u}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label={L("రకం", "Category")} value={category} onChange={(e) => setCategory(e.target.value)} />
        <TextField size="small" label={L("ఇంత కంటే తగ్గితే కొనాలి", "Reorder at")} value={reorder} onChange={(e) => setReorder(e.target.value)} />
        <FormControlLabel
          control={<Switch checked={trackExpiry} onChange={(e) => setTrackExpiry(e.target.checked)} />}
          label={L("గడువు తేదీ ఉన్న వస్తువు (బ్యాచ్‌ల వారీగా లెక్క)", "Has an expiry date (track by batch)")}
        />
        {!item && (
          <Typography variant="body2" color="text.secondary">
            {L("కొత్త వస్తువు 0 తో మొదలవుతుంది. కొనుగోలు బిల్ లేదా \"నిల్వ సరిచేయి\" తో పెరుగుతుంది.", "A new item starts at 0. Purchases or \"Adjust stock\" add to it.")}
          </Typography>
        )}
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

export function InventoryPage() {
  const { L, lang } = useLang();
  const session = useSession();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [storeItem, setStoreItem] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);
  const [expiryOnly, setExpiryOnly] = useState(false);
  // Module 2g: stock promised to confirmed events
  const [reservations, setReservations] = useState<StockReservation[]>([]);
  const [resBusy, setResBusy] = useState(false);
  const [resNote, setResNote] = useState<string | null>(null);
  useEffect(() => subscribeReservations(setReservations, () => setReservations([])), []);
  const canRefresh = session.status === "loggedIn" && (session.profile.role === "admin" || session.profile.role === "manager");
  const refreshReservations = async () => {
    setResBusy(true);
    setResNote(null);
    try {
      const r = await refreshStockReservations({});
      setResNote(L(`${r.events} ఈవెంట్‌లకు రిజర్వ్ చేశాం. ${r.short} ఈవెంట్‌లకు సరుకు తక్కువ.`, `Reserved for ${r.events} events. ${r.short} events are short of stock.`));
    } catch (e) {
      setResNote(errorText(e, lang));
    } finally {
      setResBusy(false);
    }
  };
  const shortEvents = reservations.filter((r) => (!currentBranchId || r.branchId === currentBranchId) && r.lines.some((l) => l.short > 0));
  const { settings } = useBusinessSettings();
  const alertDays = settings.expiryAlert.days;
  const expiring = (i: InventoryItem) => {
    const st = i.trackExpiry ? expiryStatusOf(i.nearestExpiry, todayIso(), alertDays) : "none";
    return st === "expired" || st === "soon";
  };

  useEffect(() => subscribeInventory(currentBranchId, setItems), [currentBranchId]);

  const live = useMemo(() => liveRows(items), [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleRows(items, showCancelled).filter(
      (i) => (!lowOnly || isLow(i)) && (!expiryOnly || expiring(i)) && (!q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)),
    );
  }, [items, search, lowOnly, expiryOnly, alertDays, showCancelled]);

  const lowCount = live.filter(isLow).length;
  const expiringCount = live.filter(expiring).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <StockAdjustRequests branchId={currentBranchId} />
      <PageHeader
        title={L("సరుకుల నిల్వ", "Inventory")}
        onRefresh={() => refreshFromServer(branchQuery("inventory", currentBranchId))}
        action={
          isAdmin ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
              {L("కొత్త వస్తువు", "New item")}
            </Button>
          ) : undefined
        }
      />
      <StatRow>
        <StatCard label={L("వస్తువులు", "Items")} value={live.length} />
        <StatCard label={L("తక్కువ నిల్వ", "Low stock")} value={lowCount} tone={lowCount > 0 ? "warn" : "good"} />
        <StatCard label={L("గడువు దగ్గరలో / దాటినవి", "Expiring / expired")} value={expiringCount} tone={expiringCount > 0 ? "warn" : "good"} />
        <StatCard label={L("సరుకు తక్కువ ఉన్న ఈవెంట్‌లు", "Events short of stock")} value={shortEvents.length} tone={shortEvents.length > 0 ? "warn" : "good"} />
      </StatRow>
      {(shortEvents.length > 0 || resNote) && (
        <Alert severity={shortEvents.length > 0 ? "warning" : "info"} sx={{ mb: 2 }}>
          {resNote ? `${resNote} ` : ""}
          {shortEvents.slice(0, 5).map((r) => `${r.day} ${r.customer || r.bookingId}: ${r.lines.filter((l) => l.short > 0).slice(0, 4).map((l) => `${l.name} ${l.short} ${l.unit}`).join(", ")}`).join(" · ")}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder={L("వస్తువు / రకం వెతకండి", "Search item or category")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 240px" }}
        />
        <FormControlLabel control={<Switch checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />} label={L("తక్కువ నిల్వ మాత్రమే", "Low stock only")} />
        <FormControlLabel control={<Switch checked={expiryOnly} onChange={(e) => setExpiryOnly(e.target.checked)} />} label={L("గడువు దగ్గరలో ఉన్నవి మాత్రమే", "Expiring only")} />
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={items.length - live.length} />
        {canRefresh && (
          <Button size="small" variant="outlined" disabled={resBusy} onClick={refreshReservations}>
            {L("రిజర్వ్ లెక్క మళ్ళీ చెయ్యి", "Recalculate reservations")}
          </Button>
        )}
      </Box>
      <DataTable
        rows={filtered}
        rowKey={(i) => i.id}
        onRowClick={isAdmin ? (i) => !i.cancelled && setEditing(i) : undefined}
        emptyText={L("వస్తువులు లేవు.", "No items.")}
        columns={[
          { label: L("వస్తువు", "Item"), render: (i) => i.name },
          { label: L("రకం", "Category"), hideOnMobile: true, render: (i) => i.category || "—" },
          {
            label: L("నిల్వ", "In stock"),
            align: "right",
            render: (i) => (
              <>
                {`${i.quantityInStock} ${i.unit}`}
                {i.expiredQty > 0 && (
                  <span style={{ display: "block", fontSize: "0.8em", color: "#b3261e" }}>
                    {L(`గడువు దాటినది ${i.expiredQty} — లెక్కలో వాడము`, `expired ${i.expiredQty} — not counted`)}
                  </span>
                )}
                {i.reservedQty > 0 && (
                  <span style={{ display: "block", fontSize: "0.8em", opacity: 0.75 }}>
                    {L(`రిజర్వ్ ${i.reservedQty} · ఖాళీ ${Math.round(Math.max(0, i.quantityInStock - i.reservedQty) * 1000) / 1000}`, `reserved ${i.reservedQty} · free ${Math.round(Math.max(0, i.quantityInStock - i.reservedQty) * 1000) / 1000}`)}
                  </span>
                )}
              </>
            ),
          },
          { label: L("ఇంత కంటే తగ్గితే కొనాలి", "Reorder at"), align: "right", hideOnMobile: true, render: (i) => `${i.reorderLevel} ${i.unit}` },
          {
            label: L("స్థితి", "Status"),
            render: (i) =>
              i.cancelled ? (
                <CancelledChip archived reason={i.cancelReason} />
              ) : (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {isLow(i) ? <Chip size="small" color="error" label={L("తక్కువ", "Low")} /> : <Chip size="small" color="success" label={L("సరిపోతుంది", "OK")} />}
                  {i.trackExpiry && <ExpiryChip day={i.nearestExpiry} alertDays={alertDays} />}
                </Box>
              ),
          },
          {
            label: "",
            render: (i) =>
              i.cancelled ? null : (
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAdjusting(i);
                    }}
                  >
                    {L("సరిచేయి", "Adjust")}
                  </Button>
                  {canRefresh && (
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStoreItem(i);
                      }}
                    >
                      {L("స్టోర్లు", "Stores")}
                    </Button>
                  )}
                  <CancelButton collection="inventory" id={i.id} what={i.name} />
                </Box>
              ),
          },
        ]}
      />
      <AdjustDialog item={adjusting} reservations={reservations} onClose={() => setAdjusting(null)} />
      {storeItem && <StoreStockDialog itemId={storeItem.id} name={storeItem.name} unit={storeItem.unit} branchId={storeItem.branchId} onClose={() => setStoreItem(null)} />}
      <ItemDialog open={editing !== null} item={editing === "new" ? null : editing} branchId={currentBranchId} onClose={() => setEditing(null)} />
    </Box>
  );
}
