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
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import {
  addTrip,
  daysUntil,
  EXPIRY_FIELDS,
  saveVehicle,
  subscribeTrips,
  subscribeVehicles,
  type EquipmentKind,
  type ExpiryField,
  type Vehicle,
  type VehicleTrip,
} from "../../data/assetsRepository";
import { errorText } from "../../data/functions";
import { liveRows, visibleRows } from "../../data/cancel";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { bookingLabel, openBookings } from "../../components/CostTargetPicker";
import { formatDate, formatINR } from "../../util/format";

const VEHICLE_TYPES = ["Auto", "Bike", "Car", "Van", "Tata Ace", "Dost", "Pickup", "Mini Truck", "Truck", "Other"];

const EXPIRY_LABEL: Record<ExpiryField, { te: string; en: string }> = {
  insuranceExpiry: { te: "ఇన్సూరెన్స్", en: "Insurance" },
  fitnessExpiry: { te: "ఫిట్‌నెస్", en: "Fitness" },
  pollutionExpiry: { te: "పొల్యూషన్", en: "Pollution" },
  driverLicenseExpiry: { te: "డ్రైవర్ లైసెన్స్", en: "Driver licence" },
};

const numOrNull = (t: string) => {
  if (!t.trim()) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const toInput = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
const fromInput = (s: string) => (s ? new Date(`${s}T12:00:00`) : null);

/** Expiry chip: red when past or ≤ 7 days, orange ≤ 30 days (same windows as the morning alerts). */
function ExpiryChip({ label, date }: { label: string; date: Date | null }) {
  const { L, lang } = useLang();
  const days = daysUntil(date);
  if (days === null) return <Chip size="small" variant="outlined" label={`${label}: ${L("తేదీ లేదు", "no date")}`} />;
  const color = days < 0 || days <= 7 ? "error" : days <= 30 ? "warning" : "success";
  const when = days < 0 ? L(`${-days} రోజుల క్రితం అయిపోయింది`, `expired ${-days} d ago`) : days === 0 ? L("ఈరోజే", "today") : L(`${days} రోజుల్లో`, `in ${days} d`);
  return <Chip size="small" color={color} variant={color === "success" ? "outlined" : "filled"} label={`${label}: ${formatDate(date, lang)} (${when})`} />;
}

function VehicleDialog({ open, vehicle, branchId, onClose }: { open: boolean; vehicle: Vehicle | null; branchId: string | null; onClose: () => void }) {
  const { L, T, lang } = useLang();
  const [number, setNumber] = useState("");
  const [type, setType] = useState("Van");
  const [kind, setKind] = useState<EquipmentKind>("own");
  const [driver, setDriver] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [rate, setRate] = useState("");
  const [dates, setDates] = useState<Record<ExpiryField, string>>({ insuranceExpiry: "", fitnessExpiry: "", pollutionExpiry: "", driverLicenseExpiry: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNumber(vehicle?.number ?? "");
    setType(vehicle?.type || "Van");
    setKind(vehicle?.kind ?? "own");
    setDriver(vehicle?.driver ?? "");
    setDriverPhone(vehicle?.driverPhone ?? "");
    setRate(vehicle?.ratePerKm ? String(vehicle.ratePerKm) : "");
    setDates({
      insuranceExpiry: toInput(vehicle?.insuranceExpiry ?? null),
      fitnessExpiry: toInput(vehicle?.fitnessExpiry ?? null),
      pollutionExpiry: toInput(vehicle?.pollutionExpiry ?? null),
      driverLicenseExpiry: toInput(vehicle?.driverLicenseExpiry ?? null),
    });
    setError(null);
  }, [open, vehicle]);

  const r = numOrNull(rate);
  const valid = number.trim() && !Number.isNaN(r);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveVehicle(
        {
          id: vehicle?.id,
          number: number.trim().toUpperCase(),
          type,
          kind,
          driver: driver.trim(),
          driverPhone: driverPhone.trim(),
          ratePerKm: r ?? 0,
          insuranceExpiry: fromInput(dates.insuranceExpiry),
          fitnessExpiry: fromInput(dates.fitnessExpiry),
          pollutionExpiry: fromInput(dates.pollutionExpiry),
          driverLicenseExpiry: fromInput(dates.driverLicenseExpiry),
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
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{vehicle ? L("వాహనం మార్చు", "Edit vehicle") : L("కొత్త వాహనం", "New vehicle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        {error && <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>{error}</Alert>}
        <TextField size="small" required label={L("వాహనం నంబర్", "Vehicle number")} value={number} onChange={(e) => setNumber(e.target.value)} />
        <TextField select size="small" label={L("రకం", "Type")} value={type} onChange={(e) => setType(e.target.value)}>
          {[...new Set([type, ...VEHICLE_TYPES])].map((t) => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup exclusive size="small" color="primary" value={kind} onChange={(_, v) => v && setKind(v)}>
          <ToggleButton value="own">{L("మనది", "Own")}</ToggleButton>
          <ToggleButton value="rented">{L("అద్దె", "Rented")}</ToggleButton>
        </ToggleButtonGroup>
        <TextField size="small" label={L("కి.మీ కి రేటు (అద్దె వాహనం)", "Rate per km (rented)")} value={rate} onChange={(e) => setRate(e.target.value)} />
        <TextField size="small" label={L("డ్రైవర్", "Driver")} value={driver} onChange={(e) => setDriver(e.target.value)} />
        <TextField size="small" type="tel" label={L("డ్రైవర్ ఫోన్", "Driver phone")} value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
        {EXPIRY_FIELDS.map((f) => (
          <TextField
            key={f}
            size="small"
            type="date"
            label={`${T(EXPIRY_LABEL[f])} ${L("గడువు", "expiry")}`}
            value={dates[f]}
            onChange={(e) => setDates((d) => ({ ...d, [f]: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        ))}
        <Typography variant="body2" color="text.secondary" sx={{ gridColumn: "1 / -1" }}>
          {L("గడువుకి 30 రోజులు, 7 రోజుల ముందు ఉదయం సందేశంలో గుర్తు చేస్తాం.", "We remind you in the morning summary 30 and 7 days before each expiry.")}
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

function TripDialog({ open, vehicles, bookings, branchId, onClose }: { open: boolean; vehicles: Vehicle[]; bookings: Booking[]; branchId: string | null; onClose: () => void }) {
  const { L, lang } = useLang();
  const [vehicleId, setVehicleId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [date, setDate] = useState(toInput(new Date()));
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [fuel, setFuel] = useState("");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVehicleId("");
    setBookingId("");
    setDate(toInput(new Date()));
    setKmStart("");
    setKmEnd("");
    setFuel("");
    setRate("");
    setNote("");
    setError(null);
  }, [open]);

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const s = numOrNull(kmStart);
  const e2 = numOrNull(kmEnd);
  const f = numOrNull(fuel);
  const r = numOrNull(rate);
  const kmOk = s === null || e2 === null || (e2 as number) >= (s as number);
  const valid = !!vehicle && !!bookingId && ![s, e2, f, r].some((x) => Number.isNaN(x)) && kmOk;
  const booking = bookings.find((b) => b.id === bookingId);

  const save = async () => {
    if (!vehicle) return;
    const bId = booking?.branchId || branchId;
    if (!bId) return;
    setBusy(true);
    setError(null);
    try {
      await addTrip(
        {
          vehicleId: vehicle.id,
          vehicleNumber: vehicle.number,
          bookingId,
          date: new Date(`${date}T12:00:00`),
          kmStart: s,
          kmEnd: e2,
          fuelCost: f ?? 0,
          ratePerKm: r ?? (vehicle.kind === "rented" ? vehicle.ratePerKm : 0),
          note: note.trim(),
        },
        bId,
      );
      onClose();
    } catch (err) {
      setError(errorText(err, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{L("ట్రిప్ నమోదు", "Log a trip")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select size="small" required label={L("వాహనం", "Vehicle")} value={vehicleId} onChange={(e) => {
          setVehicleId(e.target.value);
          const v = vehicles.find((x) => x.id === e.target.value);
          if (v?.kind === "rented" && v.ratePerKm) setRate(String(v.ratePerKm));
        }}>
          {vehicles.map((v) => (
            <MenuItem key={v.id} value={v.id}>
              {v.number} · {v.type}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" required label={L("Event", "Event")} value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
          {openBookings(bookings).map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {bookingLabel(b, lang)}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="date" label={L("తేదీ", "Date")} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField size="small" label={L("మొదలు కి.మీ", "Start km")} value={kmStart} onChange={(e) => setKmStart(e.target.value)} />
          <TextField size="small" label={L("చివరి కి.మీ", "End km")} value={kmEnd} error={!kmOk} onChange={(e) => setKmEnd(e.target.value)} />
        </Box>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
          <TextField size="small" label={L("డీజిల్ / పెట్రోల్ ఖర్చు", "Fuel cost")} value={fuel} onChange={(e) => setFuel(e.target.value)} />
          <TextField size="small" label={L("కి.మీ కి రేటు (అద్దె)", "Rate per km (rented)")} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Box>
        <TextField size="small" label={L("గమనిక", "Note")} value={note} onChange={(e) => setNote(e.target.value)} />
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

/** R7-4 vehicles: documents with expiry alerts, and trips per event (fuel, km, rented rate). */
export function VehiclesPage() {
  const { L, T, lang } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const mayEdit = can.manageAssets(role);
  const { currentBranchId } = useBranch();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [trips, setTrips] = useState<VehicleTrip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null | "new">(null);
  const [tripOpen, setTripOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeVehicles(currentBranchId, setVehicles, (e) => setError(errorText(e, lang))), [currentBranchId, lang]);
  useEffect(() => subscribeTrips(currentBranchId, setTrips, (e) => setError(errorText(e, lang))), [currentBranchId, lang]);
  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);

  const live = liveRows(vehicles);
  const dueSoon = useMemo(
    () => live.filter((v) => EXPIRY_FIELDS.some((f) => { const d = daysUntil(v[f]); return d !== null && d <= 30; })).length,
    [live],
  );
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("వాహనాలు", "Vehicles")}
        onRefresh={() => refreshFromServer(branchQuery("vehicles", currentBranchId), branchQuery("vehicleTrips", currentBranchId))}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" onClick={() => setTripOpen(true)} disabled={live.length === 0}>
              {L("ట్రిప్ నమోదు", "Log trip")}
            </Button>
            {mayEdit && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
                {L("కొత్త వాహనం", "New vehicle")}
              </Button>
            )}
          </Box>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <StatRow>
        <StatCard label={L("వాహనాలు", "Vehicles")} value={live.length} />
        <StatCard label={L("30 రోజుల్లో గడువు", "Expiring in 30 days")} value={dueSoon} tone={dueSoon ? "warn" : "good"} />
      </StatRow>
      <Box sx={{ mb: 1 }}>
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={vehicles.length - live.length} />
      </Box>
      <DataTable
        rows={visibleRows(vehicles, showCancelled)}
        rowKey={(v) => v.id}
        onRowClick={mayEdit ? (v) => !v.cancelled && setEditing(v) : undefined}
        emptyText={L("ఇంకా వాహనాలు చేర్చలేదు. \"కొత్త వాహనం\" తో మొదలుపెట్టండి.", "No vehicles yet. Start with \"New vehicle\".")}
        columns={[
          {
            label: L("వాహనం", "Vehicle"),
            render: (v) => (
              <>
                <b>{v.number}</b> · {v.type} {v.kind === "rented" && <Chip size="small" variant="outlined" label={L("అద్దె", "Rented")} />}{" "}
                {v.cancelled && <CancelledChip archived reason={v.cancelReason} />}
              </>
            ),
          },
          { label: L("డ్రైవర్", "Driver"), hideOnMobile: true, render: (v) => [v.driver, v.driverPhone].filter(Boolean).join(" · ") || "—" },
          {
            label: L("గడువులు", "Expiries"),
            render: (v) => (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {EXPIRY_FIELDS.map((f) => (
                  <ExpiryChip key={f} label={T(EXPIRY_LABEL[f])} date={v[f]} />
                ))}
              </Box>
            ),
          },
          { label: "", render: (v) => (v.cancelled ? null : <CancelButton collection="vehicles" id={v.id} what={v.number} />) },
        ]}
      />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        {L("ట్రిప్పులు", "Trips")}
      </Typography>
      <DataTable
        rows={trips.slice(0, 100)}
        rowKey={(t) => t.id}
        emptyText={L("ఇంకా ట్రిప్పులు లేవు.", "No trips yet.")}
        columns={[
          { label: L("తేదీ", "Date"), render: (t) => formatDate(t.date, lang) },
          { label: L("వాహనం", "Vehicle"), render: (t) => vehicleById.get(t.vehicleId)?.number ?? "—" },
          { label: L("Event", "Event"), hideOnMobile: true, render: (t) => (bookingById.get(t.bookingId) ? bookingLabel(bookingById.get(t.bookingId) as Booking, lang) : "—") },
          {
            label: L("కి.మీ", "Km"),
            align: "right",
            render: (t) => (t.kmStart !== null && t.kmEnd !== null ? t.kmEnd - t.kmStart : "—"),
          },
          { label: L("ఇంధనం", "Fuel"), align: "right", render: (t) => formatINR(t.fuelCost) },
          { label: L("రేటు / కి.మీ", "Rate / km"), align: "right", hideOnMobile: true, render: (t) => (t.ratePerKm ? formatINR(t.ratePerKm) : "—") },
        ]}
      />
      <VehicleDialog open={editing !== null} vehicle={editing === "new" ? null : editing} branchId={currentBranchId} onClose={() => setEditing(null)} />
      <TripDialog open={tripOpen} vehicles={live} bookings={bookings} branchId={currentBranchId} onClose={() => setTripOpen(false)} />
    </Box>
  );
}
