import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { useBranch } from "../../session/BranchContext";
import { subscribeBookings, isClosed, type Booking } from "../../data/bookingRepository";
import { GROCERY_MODULES, matchesGrocery, subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";
import { subscribeInventory } from "../../data/inventoryRepository";
import { FIXED_UOMS, useBusinessSettings } from "../../data/settingsRepository";
import {
  ENTRY_PAYMENT_METHODS,
  getPurchase,
  savePurchase,
  subscribeVendors,
  type Purchase,
  type PurchaseLine,
  type Vendor,
} from "../../data/records";
import { GENERAL_OVERHEAD, type CostTarget } from "../../data/costTarget";
import { errorText, recordVendorPayment, type PaymentMethod } from "../../data/functions";
import { CostTargetPicker } from "../../components/CostTargetPicker";
import { formatINR } from "../../util/format";

/** Purchase units offered when the master item has none (PurchaseCatalog.kt PURCHASE_UNITS). */
const PURCHASE_UNITS = ["Kg", "Gram", "Litre", "ML", "Packet", "Box", "Bag", "Tin", "Bottle", "Piece", "Bundle", "Dozen", "Crate", "Tray", "Can", "Cylinder", "Block"];
const OTHER_MODULE = "Other Items";

const round2 = (n: number) => Math.round(n * 100) / 100;
const numOr0 = (t: string) => {
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Stock unit (kg / L / pcs) of the master vs the bill unit (Kg / Gram / Litre / …). */
function sameUnit(stockUnit: string, billUnit: string): boolean {
  const map: Record<string, string> = { kg: "kg", l: "L", litre: "L", liter: "L", pcs: "pcs", piece: "pcs", pieces: "pcs" };
  return (map[billUnit.toLowerCase()] ?? billUnit) === (map[stockUnit.toLowerCase()] ?? stockUnit);
}

interface Line extends PurchaseLine {
  key: number;
  qtyText: string;
  priceText: string;
}

let lineKey = 1;

function toLine(p: PurchaseLine): Line {
  return { ...p, key: lineKey++, qtyText: p.quantity ? String(p.quantity) : "", priceText: p.unitPrice ? String(p.unitPrice) : "" };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * R7-1 purchase entry (web): folders and items from the grocery master (same 7 folders as the phone
 * app's PurchaseCatalog) plus free "other" items, and the required cost target. Stock is moved by the
 * server's purchases trigger for lines linked to a stock item — this screen never touches stock.
 */
export function PurchaseFormPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { L, lang } = useLang();
  const session = useSession();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const role = profile?.role ?? "staff";
  const { currentBranchId } = useBranch();

  const [loaded, setLoaded] = useState<Purchase | null | undefined>(id ? undefined : null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [master, setMaster] = useState<GroceryItem[]>([]);
  // Module 2d: stock items that keep batches with an expiry date — their lines get a date field
  // Module 2h: the units list comes from Settings (fixed units + the owner's pack names)
  const { settings: bizSettings, loaded: bizLoaded } = useBusinessSettings();
  const masterUnits = bizLoaded ? [...FIXED_UOMS, ...bizSettings.uomPacks] : PURCHASE_UNITS;
  const [expiryItems, setExpiryItems] = useState<Set<string>>(new Set());
  useEffect(() => subscribeInventory(currentBranchId, (rows) => setExpiryItems(new Set(rows.filter((r) => r.trackExpiry).map((r) => r.id)))), [currentBranchId]);

  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<CostTarget>(() => {
    const b = params.get("booking");
    return b ? { type: "booking", bookingId: b } : GENERAL_OVERHEAD;
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [discountText, setDiscountText] = useState("");
  const [otherText, setOtherText] = useState("");
  const [paidNow, setPaidNow] = useState(false);

  const [moduleId, setModuleId] = useState(GROCERY_MODULES[0]?.id ?? "Kirana");
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);
  useEffect(() => subscribeVendors((v) => setVendors(v.filter((x) => !x.cancelled))), []);
  useEffect(() => subscribeGroceryItems((rows) => setMaster(rows.filter((r) => !r.cancelled))), []);

  useEffect(() => {
    if (!id) return;
    getPurchase(id)
      .then((p) => {
        setLoaded(p);
        if (!p) return;
        setVendorId(p.vendorId);
        setVendorName(p.vendorNameSnapshot);
        setBillNumber(p.billNumber);
        if (p.purchaseDate) {
          const d = p.purchaseDate;
          setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
        setMethod(p.paymentMethod || "Cash");
        setNotes(p.notes);
        setTarget(p.costTarget);
        setLines(p.items.map(toLine));
        setDiscountText(p.discount ? String(p.discount) : "");
        setOtherText(p.otherCharges ? String(p.otherCharges) : "");
      })
      .catch((e) => setError(errorText(e, lang)));
  }, [id, lang]);

  const masterById = useMemo(() => new Map(master.map((m) => [m.id, m])), [master]);
  const groups = useMemo(() => [...new Set(master.filter((m) => m.module === moduleId).map((m) => m.group))].sort(), [master, moduleId]);
  const picks = useMemo(() => {
    const q = search.trim();
    return master
      .filter((m) => (q ? matchesGrocery(m, q) : m.module === moduleId && (!group || m.group === group)))
      .slice(0, 60);
  }, [master, moduleId, group, search]);

  const amounts = lines.map((l) => round2(numOr0(l.qtyText) * numOr0(l.priceText)));
  const subtotal = round2(amounts.reduce((a, b) => a + b, 0));
  const discount = numOr0(discountText);
  const otherCharges = numOr0(otherText);
  const total = round2(Math.max(0, subtotal - discount + otherCharges));

  const booking = target.type === "booking" ? bookings.find((b) => b.id === target.bookingId) : undefined;
  const locked = !!loaded && (loaded.cancelled || (booking ? isClosed(booking) : false));

  const addMaster = (m: GroceryItem) =>
    setLines((ls) => [
      ...ls,
      toLine({
        description: m.nameRoman || m.nameEn || m.nameTe,
        category: m.group,
        module: m.module,
        quantity: 0,
        unit: m.purchaseUnits[0] ?? (m.unit === "L" ? "Litre" : m.unit === "pcs" ? "Piece" : "Kg"),
        unitPrice: 0,
        amount: 0,
        inventoryItemId: m.inventoryItemId,
        groceryItemId: m.id,
      }),
    ]);

  const addOther = () =>
    setLines((ls) => [
      ...ls,
      toLine({ description: "", category: "", module: OTHER_MODULE, quantity: 0, unit: "Piece", unitPrice: 0, amount: 0, inventoryItemId: "", groceryItemId: "" }),
    ]);

  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const valid =
    lines.length > 0 &&
    lines.every((l) => l.description.trim() && numOr0(l.qtyText) > 0) &&
    total > 0 &&
    (target.type === "overhead" || !!target.bookingId) &&
    (vendorId || vendorName.trim());

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const items: PurchaseLine[] = lines.map((l, i) => ({
        description: l.description.trim(),
        category: l.category,
        module: l.module,
        quantity: numOr0(l.qtyText),
        unit: l.unit,
        unitPrice: numOr0(l.priceText),
        amount: amounts[i],
        inventoryItemId: l.inventoryItemId,
        groceryItemId: l.groceryItemId,
        ...(l.expiryDay && expiryItems.has(l.inventoryItemId) ? { expiryDay: l.expiryDay, batchNo: (l.batchNo ?? "").trim() } : {}),
      }));
      const vendor = vendors.find((v) => v.id === vendorId);
      const savedId = await savePurchase(
        {
          id,
          vendorId,
          vendorNameSnapshot: vendor?.name ?? vendorName.trim(),
          billNumber: billNumber.trim(),
          purchaseDate: new Date(`${date}T12:00:00`),
          items,
          subtotal,
          discount,
          otherCharges,
          totalAmount: total,
          paymentMethod: method,
          notes: notes.trim(),
          costTarget: target,
        },
        { uid: profile.uid, name: profile.name },
        currentBranchId,
      );
      if (!id && paidNow && method !== "Credit" && vendor && can.vendorDues(role)) {
        try {
          await recordVendorPayment({
            vendorId: vendor.id,
            vendorName: vendor.name,
            amount: total,
            date,
            method: method === "Bank Transfer" ? "BankTransfer" : method === "Credit" ? "Other" : (method as PaymentMethod),
            allocations: [{ collection: "purchases", id: savedId, amount: total }],
            note: L("కొన్నప్పుడే చెల్లించాం", "Paid at purchase"),
          });
        } catch (e) {
          // The bill is saved; only the payment failed — say so and stay on the list.
          setError(L("బిల్ సేవ్ అయింది, కానీ చెల్లింపు నమోదు కాలేదు: ", "Bill saved, but the payment was not recorded: ") + errorText(e, lang));
          setBusy(false);
          return;
        }
      }
      navigate("/purchases");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  if (loaded === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const nameOf = (l: Line) => {
    const m = l.groceryItemId ? masterById.get(l.groceryItemId) : undefined;
    return m ? (lang === "te" ? m.nameTe || m.nameEn : m.nameEn || m.nameTe) : l.description;
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/purchases")} sx={{ mb: 1 }}>
        {L("కొనుగోళ్లు", "Purchases")}
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        {id ? L("కొనుగోలు బిల్ మార్చు", "Edit purchase bill") : L("కొత్త కొనుగోలు బిల్", "New purchase bill")}
      </Typography>
      {id && !loaded && <Alert severity="warning">{L("బిల్ దొరకలేదు.", "Bill not found.")}</Alert>}
      {locked && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {loaded?.cancelled
            ? L("ఈ బిల్ రద్దు అయింది — మార్చలేము.", "This bill is cancelled — it can't be changed.")
            : L("ఈ Event ముగించారు (lock) — దీని ఖర్చులు మార్చలేము.", "This event is closed — its costs can't be changed.")}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <Autocomplete
          freeSolo
          disabled={locked}
          options={vendors.map((v) => v.name)}
          value={vendors.find((v) => v.id === vendorId)?.name ?? vendorName}
          onInputChange={(_, v) => {
            const match = vendors.find((x) => x.name === v);
            setVendorId(match?.id ?? "");
            setVendorName(v);
          }}
          renderInput={(p) => <TextField {...p} size="small" required label={L("సరఫరాదారు / షాప్", "Vendor / shop")} />}
        />
        <TextField size="small" disabled={locked} label={L("బిల్ నంబర్", "Bill number")} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
        <TextField
          size="small"
          type="date"
          disabled={locked}
          label={L("తేదీ", "Date")}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField select size="small" disabled={locked} label={L("ఎలా చెల్లించారు", "Payment method")} value={method} onChange={(e) => setMethod(e.target.value)}>
          {ENTRY_PAYMENT_METHODS.map((m) => (
            <MenuItem key={m} value={m}>
              {m === "Credit" ? L("అప్పు (తర్వాత ఇస్తాం)", "Credit (pay later)") : m}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
          <CostTargetPicker value={target} onChange={setTarget} bookings={bookings} disabled={locked} />
        </Box>
      </Paper>

      {!locked && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("వస్తువులు ఎంచుకోండి", "Pick items")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            {GROCERY_MODULES.map((m) => (
              <Chip
                key={m.id}
                label={lang === "te" ? m.te : m.en}
                color={moduleId === m.id && !search ? "primary" : "default"}
                onClick={() => {
                  setModuleId(m.id);
                  setGroup("");
                  setSearch("");
                }}
              />
            ))}
            <Chip icon={<AddIcon />} label={L("వేరే వస్తువు", "Other item")} variant="outlined" onClick={addOther} />
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
            <TextField select size="small" label={L("గ్రూప్", "Group")} value={group} onChange={(e) => setGroup(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">{L("అన్నీ", "All")}</MenuItem>
              {groups.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              placeholder={L("వెతకండి (తెలుగు / English)", "Search (Telugu / English)")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: "1 1 220px" }}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", maxHeight: 220, overflowY: "auto" }}>
            {picks.map((m) => (
              <Chip
                key={m.id}
                size="small"
                variant="outlined"
                icon={<AddIcon />}
                label={lang === "te" ? m.nameTe || m.nameEn : m.nameEn || m.nameTe}
                onClick={() => addMaster(m)}
              />
            ))}
            {picks.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {master.length === 0
                  ? L("సరుకుల జాబితా ఇంకా load కాలేదు — \"వేరే వస్తువు\" వాడండి.", "Grocery list not loaded yet — use \"Other item\".")
                  : L("ఏమీ దొరకలేదు.", "Nothing found.")}
              </Typography>
            )}
          </Box>
        </Paper>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          {L("బిల్ లోని వస్తువులు", "Bill items")} ({lines.length})
        </Typography>
        {lines.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {L("పైన వస్తువు నొక్కితే ఇక్కడ వస్తుంది.", "Tap an item above to add it here.")}
          </Typography>
        )}
        {lines.map((l, i) => {
          const m = l.groceryItemId ? masterById.get(l.groceryItemId) : undefined;
          const units = m?.purchaseUnits.length ? m.purchaseUnits : masterUnits;
          const stockOk = !!l.inventoryItemId && (!m || sameUnit(m.unit, l.unit));
          return (
            <Box
              key={l.key}
              sx={{
                display: "grid",
                gap: 1,
                alignItems: "center",
                py: 1,
                borderBottom: 1,
                borderColor: "divider",
                gridTemplateColumns: { xs: "1fr 1fr", md: "2.2fr 0.9fr 1fr 1fr 1fr auto" },
              }}
            >
              <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
                {l.groceryItemId ? (
                  <Typography sx={{ fontWeight: 500 }}>{nameOf(l)}</Typography>
                ) : (
                  <TextField
                    size="small"
                    fullWidth
                    disabled={locked}
                    label={L("వస్తువు పేరు", "Item name")}
                    value={l.description}
                    onChange={(e) => patch(l.key, { description: e.target.value })}
                  />
                )}
                {l.inventoryItemId ? (
                  stockOk ? (
                    <Chip size="small" color="success" variant="outlined" label={L("Stock లో కలుస్తుంది", "Adds to stock")} sx={{ mt: 0.5 }} />
                  ) : (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={L(`Stock unit ${m?.unit} — అదే unit లో రాయండి`, `Stock unit is ${m?.unit} — use that unit`)}
                      sx={{ mt: 0.5 }}
                    />
                  )
                ) : null}
                {stockOk && expiryItems.has(l.inventoryItemId) && (
                  <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      type="date"
                      disabled={locked}
                      label={L("గడువు తేదీ (ప్యాక్ మీద)", "Expiry date (on the pack)")}
                      value={l.expiryDay ?? ""}
                      onChange={(e) => patch(l.key, { expiryDay: e.target.value })}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField size="small" disabled={locked} label={L("బ్యాచ్ నంబర్", "Batch no.")} value={l.batchNo ?? ""} onChange={(e) => patch(l.key, { batchNo: e.target.value })} sx={{ width: 140 }} />
                  </Box>
                )}
              </Box>
              <TextField size="small" disabled={locked} label={L("పరిమాణం", "Qty")} value={l.qtyText} onChange={(e) => patch(l.key, { qtyText: e.target.value })} />
              <TextField select size="small" disabled={locked} label={L("యూనిట్", "Unit")} value={l.unit} onChange={(e) => patch(l.key, { unit: e.target.value })}>
                {[...new Set([l.unit, ...units])].filter(Boolean).map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" disabled={locked} label={L("ధర / యూనిట్", "Price / unit")} value={l.priceText} onChange={(e) => patch(l.key, { priceText: e.target.value })} />
              <Typography sx={{ textAlign: "right", fontWeight: 600 }}>{formatINR(amounts[i])}</Typography>
              {!locked && (
                <IconButton aria-label={L("తీసేయి", "Remove")} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <CloseIcon />
                </IconButton>
              )}
            </Box>
          );
        })}
        <Box sx={{ display: "grid", gap: 1.5, mt: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, alignItems: "center" }}>
          <Typography>
            {L("మొత్తం", "Subtotal")}: <b>{formatINR(subtotal)}</b>
          </Typography>
          <TextField size="small" disabled={locked} label={L("తగ్గింపు", "Discount")} value={discountText} onChange={(e) => setDiscountText(e.target.value)} />
          <TextField size="small" disabled={locked} label={L("ఇతర ఛార్జీలు", "Other charges")} value={otherText} onChange={(e) => setOtherText(e.target.value)} />
          <Typography variant="h6" sx={{ textAlign: "right" }}>
            {formatINR(total)}
          </Typography>
        </Box>
      </Paper>

      <TextField fullWidth multiline minRows={2} disabled={locked} label={L("గమనిక", "Notes")} value={notes} onChange={(e) => setNotes(e.target.value)} sx={{ mb: 2 }} />
      {!id && can.vendorDues(role) && (
        <FormControlLabel
          control={<Checkbox checked={paidNow && method !== "Credit"} disabled={!vendorId || method === "Credit"} onChange={(e) => setPaidNow(e.target.checked)} />}
          label={
            vendorId
              ? L("ఈ బిల్ మొత్తం ఇప్పుడే చెల్లించాం", "This bill is paid in full now")
              : L("ఈ బిల్ ఇప్పుడే చెల్లించాం (జాబితాలోని సరఫరాదారు ఎంచుకోండి)", "Paid now (pick a listed vendor)")
          }
          sx={{ mb: 2, display: "flex" }}
        />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {L(
          "చెల్లింపు స్థితి (చెల్లించలేదు / కొంత / పూర్తి) server లెక్కిస్తుంది. Stock కి కలపడం కూడా server చేస్తుంది.",
          "Payment status (unpaid / part / paid) is worked out by the server, and so is adding to stock.",
        )}
      </Typography>
      {!locked && (
        <Button variant="contained" size="large" disabled={!valid || busy} onClick={save}>
          {busy ? <CircularProgress size={22} /> : L("సేవ్ చేయి", "Save")}
        </Button>
      )}
    </Box>
  );
}
