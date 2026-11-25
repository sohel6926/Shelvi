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
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import { useBranch } from "../../session/BranchContext";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { subscribeBookings, sessionName, type Booking } from "../../data/bookingRepository";
import {
  addEquipmentMove,
  MOVE_TYPES,
  outstanding,
  saveEquipment,
  subscribeEquipment,
  subscribeEquipmentMoves,
  type Equipment,
  type EquipmentKind,
  type EquipmentMove,
  type MoveType,
} from "../../data/assetsRepository";
import { errorText } from "../../data/functions";
import { liveRows, visibleRows } from "../../data/cancel";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { bookingLabel, openBookings } from "../../components/CostTargetPicker";
import { formatDate, formatINR } from "../../util/format";

export const MOVE_LABEL: Record<MoveType, { te: string; en: string }> = {
  issue: { te: "Event కి పంపాం", en: "Sent to event" },
  return: { te: "తిరిగి వచ్చింది", en: "Returned" },
  damaged: { te: "పాడైంది", en: "Damaged" },
  lost: { te: "పోయింది", en: "Lost" },
};

type MovePreset = { equipmentId?: string; bookingId?: string; type?: MoveType; qty?: number };
const NO_PRESET: MovePreset = {};

const numOr0 = (t: string) => {
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ItemDialog({ open, item, branchId, onClose }: { open: boolean; item: Equipment | null; branchId: string | null; onClose: () => void }) {
  const { L, lang } = useLang();
  const [nameTe, setNameTe] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [kind, setKind] = useState<EquipmentKind>("own");
  const [unit, setUnit] = useState("pcs");
  const [qty, setQty] = useState("");
  const [vendor, setVendor] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameTe(item?.nameTe ?? "");
    setNameEn(item?.nameEn ?? "");
    setKind(item?.kind ?? "own");
    setUnit(item?.unit ?? "pcs");
    setQty(item ? String(item.qtyOwned) : "");
    setVendor(item?.rentalVendor ?? "");
    setRate(item?.rentalRate ? String(item.rentalRate) : "");
    setError(null);
  }, [open, item]);

  const valid = (nameTe.trim() || nameEn.trim()) && numOr0(qty) >= 0 && (kind === "own" || numOr0(rate) >= 0);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveEquipment(
        {
          id: item?.id,
          nameTe: nameTe.trim(),
          nameEn: nameEn.trim(),
          kind,
          unit: unit.trim() || "pcs",
          qtyOwned: numOr0(qty),
          rentalVendor: vendor.trim(),
          rentalRate: numOr0(rate),
        },
        branchId,
      );
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{item ? L("సామాను మార్చు", "Edit item") : L("కొత్త పాత్ర / సామాను", "New vessel / equipment")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField size="small" label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={nameTe} onChange={(e) => setNameTe(e.target.value)} />
        <TextField size="small" label={L("పేరు (English)", "Name (English)")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <ToggleButtonGroup exclusive size="small" color="primary" value={kind} onChange={(_, v) => v && setKind(v)}>
          <ToggleButton value="own">{L("మనవి", "Own")}</ToggleButton>
          <ToggleButton value="rented">{L("అద్దెకు తెచ్చినవి", "Rented")}</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField size="small" label={kind === "own" ? L("మన దగ్గర ఎన్ని", "How many we own") : L("ఎన్ని తెచ్చాం", "How many rented")} value={qty} onChange={(e) => setQty(e.target.value)} />
          <TextField size="small" label={L("యూనిట్", "Unit")} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Box>
        {kind === "rented" && (
          <>
            <TextField size="small" label={L("ఎవరి దగ్గర అద్దె", "Rented from")} value={vendor} onChange={(e) => setVendor(e.target.value)} />
            <TextField size="small" label={L("అద్దె / ఒక్కటి / రోజుకి", "Rent per unit per day")} value={rate} onChange={(e) => setRate(e.target.value)} />
          </>
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

export function MoveDialog({
  open,
  items,
  bookings,
  preset,
  branchId,
  onClose,
}: {
  open: boolean;
  items: Equipment[];
  bookings: Booking[];
  preset: MovePreset;
  branchId: string | null;
  onClose: () => void;
}) {
  const { L, T, lang } = useLang();
  const [equipmentId, setEquipmentId] = useState("");
  const [type, setType] = useState<MoveType>("issue");
  const [bookingId, setBookingId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEquipmentId(preset.equipmentId ?? "");
    setType(preset.type ?? "issue");
    setBookingId(preset.bookingId ?? "");
    setSessionId("");
    setQty(preset.qty ? String(preset.qty) : "");
    setDate(today());
    setNote("");
    setError(null);
  }, [open, preset]);

  const choices = openBookings(bookings);
  const booking = bookings.find((b) => b.id === bookingId);
  const item = items.find((i) => i.id === equipmentId);
  const needsNote = type === "damaged" || type === "lost";
  const valid = !!item && !!bookingId && numOr0(qty) > 0 && (!needsNote || note.trim().length >= 3);

  const save = async () => {
    if (!item) return;
    const bId = booking?.branchId || branchId;
    if (!bId) return;
    setBusy(true);
    setError(null);
    try {
      await addEquipmentMove(
        {
          equipmentId: item.id,
          equipmentName: item.nameEn || item.nameTe,
          type,
          qty: numOr0(qty),
          bookingId,
          sessionId,
          date: new Date(`${date}T12:00:00`),
          note: note.trim(),
        },
        bId,
      );
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{L("పాత్రలు పంపడం / తిరిగి రావడం", "Vessels out / back")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select size="small" label={L("ఏమిటి", "What")} value={type} onChange={(e) => setType(e.target.value as MoveType)}>
          {MOVE_TYPES.map((m) => (
            <MenuItem key={m} value={m}>
              {T(MOVE_LABEL[m])}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" required label={L("పాత్ర / సామాను", "Vessel / equipment")} value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
          {items.map((i) => (
            <MenuItem key={i.id} value={i.id}>
              {lang === "te" ? i.nameTe || i.nameEn : i.nameEn || i.nameTe}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" required label={L("Event", "Event")} value={bookingId} onChange={(e) => { setBookingId(e.target.value); setSessionId(""); }}>
          {(booking && !choices.includes(booking) ? [booking, ...choices] : choices).map((b) => (
            <MenuItem key={b.id} value={b.id}>
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
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField size="small" required label={`${L("ఎన్ని", "How many")}${item ? ` (${item.unit})` : ""}`} value={qty} onChange={(e) => setQty(e.target.value)} />
          <TextField size="small" type="date" label={L("తేదీ", "Date")} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        <TextField
          size="small"
          required={needsNote}
          label={needsNote ? L("ఏమైంది? (తప్పనిసరి)", "What happened? (required)") : L("గమనిక", "Note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
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

/** R7-4 vessels / equipment: what we own or rent, what is out at which event, returns / damage / loss. */
export function EquipmentPage() {
  const { L, lang } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const mayEdit = can.manageAssets(role);
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<Equipment[]>([]);
  const [moves, setMoves] = useState<EquipmentMove[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [editing, setEditing] = useState<Equipment | null | "new">(null);
  const [moving, setMoving] = useState<MovePreset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeEquipment(currentBranchId, setItems, (e) => setError(errorText(e, lang))), [currentBranchId, lang]);
  useEffect(() => subscribeEquipmentMoves(currentBranchId, setMoves, (e) => setError(errorText(e, lang))), [currentBranchId, lang]);
  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);

  const live = liveRows(items);
  const out = useMemo(() => outstanding(moves), [moves]);
  const byItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const per of out.values()) for (const [eq, q] of per) if (q > 0) m.set(eq, (m.get(eq) ?? 0) + q);
    return m;
  }, [out]);
  const lostDamaged = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of moves) if (mv.type === "lost" || mv.type === "damaged") m.set(mv.equipmentId, (m.get(mv.equipmentId) ?? 0) + mv.qty);
    return m;
  }, [moves]);
  const name = (id: string) => {
    const i = items.find((x) => x.id === id);
    return i ? (lang === "te" ? i.nameTe || i.nameEn : i.nameEn || i.nameTe) : id;
  };
  const pending = [...out.entries()]
    .flatMap(([bookingId, per]) => [...per.entries()].filter(([, q]) => q > 0).map(([equipmentId, qty]) => ({ bookingId, equipmentId, qty })))
    .sort((a, b) => a.bookingId.localeCompare(b.bookingId));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("పాత్రలు & సామాను", "Vessels & equipment")}
        onRefresh={() => refreshFromServer(branchQuery("equipment", currentBranchId), branchQuery("equipmentMoves", currentBranchId))}
        action={
          mayEdit ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => setMoving({})} disabled={live.length === 0}>
                {L("పంపు / తిరిగి వచ్చింది", "Out / back")}
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
                {L("కొత్త సామాను", "New item")}
              </Button>
            </Box>
          ) : undefined
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <StatRow>
        <StatCard label={L("సామాను రకాలు", "Item types")} value={live.length} />
        <StatCard label={L("ఇంకా తిరిగి రాలేదు", "Still out")} value={pending.length} tone={pending.length ? "warn" : "good"} />
      </StatRow>

      {pending.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("Event వారీగా బయట ఉన్నవి", "Out at events")}
          </Typography>
          <DataTable
            rows={pending}
            rowKey={(r) => `${r.bookingId}/${r.equipmentId}`}
            columns={[
              { label: L("Event", "Event"), render: (r) => (bookingById.get(r.bookingId) ? bookingLabel(bookingById.get(r.bookingId) as Booking, lang) : "—") },
              { label: L("సామాను", "Item"), render: (r) => name(r.equipmentId) },
              { label: L("బయట", "Out"), align: "right", render: (r) => r.qty },
              {
                label: "",
                render: (r) =>
                  mayEdit ? (
                    <Button size="small" variant="outlined" onClick={() => setMoving({ bookingId: r.bookingId, equipmentId: r.equipmentId, type: "return", qty: r.qty })}>
                      {L("తిరిగి వచ్చింది", "Returned")}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </Box>
      )}

      <Box sx={{ mb: 1 }}>
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={items.length - live.length} />
      </Box>
      <DataTable
        rows={visibleRows(items, showCancelled)}
        rowKey={(i) => i.id}
        onRowClick={mayEdit ? (i) => !i.cancelled && setEditing(i) : undefined}
        emptyText={L("ఇంకా పాత్రలు / సామాను చేర్చలేదు. \"కొత్త సామాను\" తో మొదలుపెట్టండి.", "No vessels or equipment yet. Start with \"New item\".")}
        columns={[
          { label: L("పేరు", "Name"), render: (i) => (lang === "te" ? i.nameTe || i.nameEn : i.nameEn || i.nameTe) },
          {
            label: L("రకం", "Kind"),
            render: (i) =>
              i.cancelled ? (
                <CancelledChip archived reason={i.cancelReason} />
              ) : (
                <Chip size="small" variant="outlined" label={i.kind === "own" ? L("మనవి", "Own") : L("అద్దె", "Rented")} />
              ),
          },
          { label: L("మొత్తం", "Total"), align: "right", render: (i) => `${i.qtyOwned} ${i.unit}` },
          { label: L("బయట ఉన్నవి", "Out now"), align: "right", render: (i) => byItem.get(i.id) ?? 0 },
          { label: L("పాడైనవి / పోయినవి", "Damaged / lost"), align: "right", hideOnMobile: true, render: (i) => lostDamaged.get(i.id) ?? 0 },
          {
            label: L("అద్దె", "Rent"),
            hideOnMobile: true,
            render: (i) => (i.kind === "rented" ? `${formatINR(i.rentalRate)} / ${L("రోజు", "day")}${i.rentalVendor ? ` · ${i.rentalVendor}` : ""}` : "—"),
          },
          { label: "", render: (i) => (i.cancelled ? null : <CancelButton collection="equipment" id={i.id} what={i.nameTe || i.nameEn} />) },
        ]}
      />

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        {L("ఇటీవలి కదలికలు", "Recent moves")}
      </Typography>
      <DataTable
        rows={moves.slice(0, 50)}
        rowKey={(m) => m.id}
        emptyText={L("ఇంకా కదలికలు లేవు.", "No moves yet.")}
        columns={[
          { label: L("తేదీ", "Date"), render: (m) => formatDate(m.date, lang) },
          { label: L("సామాను", "Item"), render: (m) => name(m.equipmentId) },
          { label: L("ఏమిటి", "What"), render: (m) => L(MOVE_LABEL[m.type].te, MOVE_LABEL[m.type].en) },
          { label: L("ఎన్ని", "Qty"), align: "right", render: (m) => m.qty },
          { label: L("Event", "Event"), hideOnMobile: true, render: (m) => (bookingById.get(m.bookingId) ? bookingLabel(bookingById.get(m.bookingId) as Booking, lang) : "—") },
          { label: L("గమనిక", "Note"), hideOnMobile: true, render: (m) => m.note || "—" },
        ]}
      />

      <ItemDialog open={editing !== null} item={editing === "new" ? null : editing} branchId={currentBranchId} onClose={() => setEditing(null)} />
      <MoveDialog open={moving !== null} items={live} bookings={bookings} preset={moving ?? NO_PRESET} branchId={currentBranchId} onClose={() => setMoving(null)} />
    </Box>
  );
}
