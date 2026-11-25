import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import { useBranch } from "../../session/BranchContext";
import { subscribeBookings, sessionName, isClosed, type Booking } from "../../data/bookingRepository";
import { OUTSIDE_ORDER_ITEMS, subscribeOutsideOrders, subscribeVendors, type OutsideOrder, type Vendor } from "../../data/records";
import { errorText, recordOutsideDelivery, saveOutsideOrder } from "../../data/functions";
import { liveRows, visibleRows } from "../../data/cancel";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { StatusChip } from "../../components/StatusChip";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { bookingLabel, openBookings } from "../../components/CostTargetPicker";
import { formatINR, sum } from "../../util/format";

const ITEM_WORDS: [RegExp, string][] = [
  [/Small /g, "చిన్న "],
  [/Big /g, "పెద్ద "],
  [/Regular /g, "మామూలు "],
  [/Special /g, "స్పెషల్ "],
  [/Pulka/g, "పుల్కా"],
  [/Rumali Roti/g, "రుమాలీ రోటీ"],
  [/Bobbatlu/g, "బొబ్బట్లు"],
  [/Ice Cream/g, "ఐస్ క్రీమ్"],
  [/Kulfi/g, "కుల్ఫీ"],
  [/Chocobar/g, "చోకోబార్"],
  [/Bulk /g, "బల్క్ "],
  [/Cup/g, "కప్"],
  [/Tub/g, "టబ్"],
  [/Cone/g, "కోన్"],
  [/Sweet /g, "స్వీట్ "],
  [/Normal /g, "మామూలు "],
  [/Meetha /g, "మీఠా "],
  [/Chocolate /g, "చాక్లెట్ "],
  [/Fire /g, "ఫైర్ "],
  [/Other /g, "ఇతర "],
  [/Pan\b/g, "పాన్"],
];

/** Telugu name for the stored (English) outside-order item. */
export function outsideItemTe(item: string): string {
  return ITEM_WORDS.reduce((s, [re, te]) => s.replace(re, te), item);
}

const numOr0 = (t: string) => {
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const txt = (n: number) => (n ? String(n) : "");

function OrderDialog({
  open,
  order,
  bookings,
  vendors,
  defaultBookingId,
  branchId,
  onClose,
}: {
  open: boolean;
  order: OutsideOrder | null;
  bookings: Booking[];
  vendors: Vendor[];
  defaultBookingId: string;
  branchId: string | null;
  onClose: () => void;
}) {
  const { L, lang } = useLang();
  const [bookingId, setBookingId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [vendorText, setVendorText] = useState("");
  const [item, setItem] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState("");
  const [advance, setAdvance] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBookingId(order?.bookingId ?? defaultBookingId);
    setSessionId(order?.sessionId ?? "");
    setVendorText(order?.vendorName ?? "");
    setItem(order?.item ?? "");
    setUnit(order?.unit || "pcs");
    setRate(txt(order?.rate ?? 0));
    setQty(txt(order?.orderedQty ?? 0));
    setAdvance(txt(order?.advancePaid ?? 0));
    setNotes(order?.notes ?? "");
    setError(null);
  }, [open, order, defaultBookingId]);

  const choices = openBookings(bookings);
  const booking = bookings.find((b) => b.id === bookingId);
  const valid = !!bookingId && item.trim() && numOr0(qty) > 0 && numOr0(rate) > 0 && vendorText.trim();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const vendor = vendors.find((v) => v.name === vendorText.trim());
      await saveOutsideOrder({
        ...(order ? { id: order.id } : {}),
        bookingId,
        ...(sessionId ? { sessionId } : {}),
        ...(vendor ? { vendorId: vendor.id } : {}),
        vendorName: vendorText.trim(),
        item: item.trim(),
        unit: unit.trim() || "pcs",
        rate: numOr0(rate),
        orderedQty: numOr0(qty),
        advancePaid: numOr0(advance),
        costTarget: sessionId ? { type: "booking", bookingId, sessionId } : { type: "booking", bookingId },
        notes: notes.trim(),
        ...(branchId ? { branchId } : {}),
      });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{order ? L("ఆర్డర్ మార్చు", "Edit order") : L("కొత్త బయటి ఆర్డర్", "New outside order")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select size="small" required label={L("Event", "Event")} value={bookingId} onChange={(e) => { setBookingId(e.target.value); setSessionId(""); }}>
          {(booking && !choices.includes(booking) ? [booking, ...choices] : choices).map((b) => (
            <MenuItem key={b.id} value={b.id} disabled={isClosed(b)}>
              {bookingLabel(b, lang)}
            </MenuItem>
          ))}
        </TextField>
        {booking && booking.sessions.length > 0 && (
          <TextField select size="small" label={L("భోజనం (session)", "Meal session")} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <MenuItem value="">{L("మొత్తం event", "Whole event")}</MenuItem>
            {booking.sessions.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {sessionName(s, lang)}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Autocomplete
          freeSolo
          options={vendors.map((v) => v.name)}
          value={vendorText}
          onInputChange={(_, v) => setVendorText(v)}
          renderInput={(p) => <TextField {...p} size="small" required label={L("ఎవరి దగ్గర (సరఫరాదారు)", "From (vendor)")} />}
        />
        <Autocomplete
          freeSolo
          options={[...OUTSIDE_ORDER_ITEMS]}
          renderOption={(props, o) => {
            const { key, ...rest } = props as typeof props & { key: string };
            return (
              <li key={key} {...rest}>
                {lang === "te" ? `${outsideItemTe(o)} (${o})` : o}
              </li>
            );
          }}
          value={item}
          onInputChange={(_, v) => setItem(v)}
          renderInput={(p) => (
            <TextField
              {...p}
              size="small"
              required
              label={L("వస్తువు", "Item")}
              helperText={lang === "te" && item && outsideItemTe(item) !== item ? outsideItemTe(item) : " "}
            />
          )}
        />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <TextField size="small" required label={L("ఎన్ని", "Quantity")} value={qty} onChange={(e) => setQty(e.target.value)} />
          <TextField size="small" label={L("యూనిట్", "Unit")} value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextField size="small" required label={L("ధర / ఒక్కటి", "Rate each")} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Box>
        <TextField size="small" label={L("ఇచ్చిన అడ్వాన్స్", "Advance paid")} value={advance} onChange={(e) => setAdvance(e.target.value)} />
        <TextField size="small" multiline minRows={2} label={L("గమనిక", "Notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
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

function DeliveryDialog({ order, onClose }: { order: OutsideOrder | null; onClose: () => void }) {
  const { L, lang } = useLang();
  const [delivered, setDelivered] = useState("");
  const [accepted, setAccepted] = useState("");
  const [returned, setReturned] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    const d = order.deliveredQty || order.orderedQty;
    setDelivered(txt(d));
    setAccepted(txt(order.acceptedQty || d));
    setReturned(txt(order.returnedQty));
    setReason(order.rejectReason);
    setError(null);
  }, [order]);

  const d = numOr0(delivered);
  const a = numOr0(accepted);
  const r = numOr0(returned);
  const short = a < d || r > 0;
  const valid = d >= 0 && a <= d && r <= d && (!short || reason.trim().length >= 3);

  const save = async () => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await recordOutsideDelivery({ id: order.id, deliveredQty: d, acceptedQty: a, returnedQty: r, ...(reason.trim() ? { rejectReason: reason.trim() } : {}) });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!order} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{L("ఎంత వచ్చింది?", "What was delivered?")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {order && (
          <Typography variant="body2" color="text.secondary">
            {lang === "te" ? outsideItemTe(order.item) : order.item} · {L("ఆర్డర్", "Ordered")} {order.orderedQty} {order.unit}
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField size="small" label={L("వచ్చినవి", "Delivered")} value={delivered} onChange={(e) => setDelivered(e.target.value)} />
        <TextField
          size="small"
          label={L("తీసుకున్నవి (బాగున్నవి)", "Accepted (good)")}
          value={accepted}
          error={a > d}
          onChange={(e) => {
            setAccepted(e.target.value);
            setReturned(txt(Math.max(0, d - numOr0(e.target.value))));
          }}
        />
        <TextField size="small" label={L("వెనక్కి ఇచ్చినవి", "Returned")} value={returned} onChange={(e) => setReturned(e.target.value)} />
        {short && (
          <TextField
            size="small"
            required
            label={L("ఎందుకు తీసుకోలేదు?", "Why not accepted?")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        <Typography variant="body2" color="text.secondary">
          {L("తీసుకున్నవాటికి మాత్రమే డబ్బు — బాకీ server లెక్కిస్తుంది.", "Only accepted items are paid for — the server works out the amount due.")}
        </Typography>
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

/** R7-6 outside orders (pulka, bobbatlu, ice cream, paan …): ordered → delivered / accepted / returned → settled. */
export function OutsideOrdersPage() {
  const { L, lang } = useLang();
  const [params] = useSearchParams();
  const { currentBranchId } = useBranch();
  const [rows, setRows] = useState<OutsideOrder[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bookingFilter, setBookingFilter] = useState(params.get("booking") ?? "");
  const [showCancelled, setShowCancelled] = useState(false);
  const [editing, setEditing] = useState<OutsideOrder | null | "new">(null);
  const [delivering, setDelivering] = useState<OutsideOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOutsideOrders(currentBranchId, setRows, (e) => setError(errorText(e, lang))), [currentBranchId, lang]);
  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);
  useEffect(() => subscribeVendors((v) => setVendors(v.filter((x) => !x.cancelled))), []);

  const byId = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const filtered = rows.filter((r) => !bookingFilter || r.bookingId === bookingFilter);
  const live = liveRows(filtered);
  const shown = visibleRows(filtered, showCancelled);
  const locked = (r: OutsideOrder) => {
    const b = byId.get(r.bookingId);
    return r.cancelled || r.status === "settled" || (b ? isClosed(b) : false);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("బయటి ఆర్డర్లు", "Outside orders")}
        onRefresh={() => refreshFromServer(branchQuery("outsideOrders", currentBranchId))}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
            {L("కొత్త ఆర్డర్", "New order")}
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label={L("Event", "Event")} value={bookingFilter} onChange={(e) => setBookingFilter(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">{L("అన్ని events", "All events")}</MenuItem>
          {bookings
            .filter((b) => !b.cancelled)
            .map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {bookingLabel(b, lang)}
              </MenuItem>
            ))}
        </TextField>
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={filtered.length - live.length} />
      </Box>
      <StatRow>
        <StatCard label={L("ఆర్డర్లు", "Orders")} value={live.length} />
        <StatCard label={L("ఇంకా రావాలి", "Not delivered yet")} value={live.filter((r) => r.status === "ordered").length} tone="warn" />
        <StatCard label={L("ఇంకా ఇవ్వాల్సింది", "Still to pay")} value={formatINR(sum(live, (r) => r.amountDue ?? 0))} tone="warn" />
      </StatRow>
      <DataTable
        rows={shown}
        rowKey={(r) => r.id}
        emptyText={L("బయటి ఆర్డర్లు లేవు.", "No outside orders.")}
        columns={[
          {
            label: L("Event", "Event"),
            render: (r) => {
              const b = byId.get(r.bookingId);
              const s = b?.sessions.find((x) => x.id === r.sessionId);
              return b ? `${bookingLabel(b, lang)}${s ? ` · ${sessionName(s, lang)}` : ""}` : "—";
            },
          },
          { label: L("వస్తువు", "Item"), render: (r) => (lang === "te" ? outsideItemTe(r.item) : r.item) },
          { label: L("ఎవరు", "Vendor"), hideOnMobile: true, render: (r) => r.vendorName || "—" },
          {
            label: L("ఆర్డర్ / వచ్చినవి / తీసుకున్నవి", "Ordered / delivered / accepted"),
            render: (r) => `${r.orderedQty} / ${r.deliveredQty || "—"} / ${r.acceptedQty || "—"} ${r.unit}`,
          },
          { label: L("ధర", "Rate"), align: "right", hideOnMobile: true, render: (r) => formatINR(r.rate) },
          { label: L("బాకీ", "Due"), align: "right", render: (r) => (r.amountDue === null ? "—" : formatINR(r.amountDue)) },
          { label: L("స్థితి", "Status"), render: (r) => (r.cancelled ? <CancelledChip reason={r.cancelReason} /> : <StatusChip status={r.status} />) },
          {
            label: "",
            render: (r) =>
              locked(r) ? null : (
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                  <Button size="small" variant="outlined" onClick={() => setDelivering(r)}>
                    {r.status === "ordered" ? L("వచ్చింది", "Delivered") : L("సరిచేయి", "Correct")}
                  </Button>
                  {r.status === "ordered" && (
                    <Button size="small" onClick={() => setEditing(r)}>
                      {L("మార్చు", "Edit")}
                    </Button>
                  )}
                  <CancelButton collection="outsideOrders" id={r.id} what={r.item} />
                </Box>
              ),
          },
        ]}
      />
      <OrderDialog
        open={editing !== null}
        order={editing === "new" ? null : editing}
        bookings={bookings}
        vendors={vendors}
        defaultBookingId={bookingFilter}
        branchId={currentBranchId}
        onClose={() => setEditing(null)}
      />
      <DeliveryDialog order={delivering} onClose={() => setDelivering(null)} />
    </Box>
  );
}
