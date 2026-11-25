import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Link, MenuItem, Paper, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { hiIfOn, useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { subscribeBookings, isClosed, type Booking } from "../../data/bookingRepository";
import { ENTRY_PAYMENT_METHODS, EXPENSE_SECTIONS, EXPENSE_SUBCATEGORIES, getExpense, saveExpense, type Expense } from "../../data/records";
import { GENERAL_OVERHEAD, type CostTarget, type OverheadCentre } from "../../data/costTarget";
import { errorText, recordVendorPayment, type PaymentMethod } from "../../data/functions";
import { can } from "../../auth/roles";
import { CostTargetPicker, bookingLabel } from "../../components/CostTargetPicker";
import { formatINR } from "../../util/format";
import { SECTION_TE } from "./sections";

const OUTSIDE = "Outside Purchase";
/** Staff advances now live on the staff page (recovered from salary); old expense rows stay readable. */
const STAFF_ADVANCE = "Staff Advance";
const round2 = (n: number) => Math.round(n * 100) / 100;
const numOr0 = (t: string) => {
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const txt = (n: number) => (n ? String(n) : "");

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Natural overhead centre for a section, used when the expense is overhead. */
const SECTION_CENTRE: Record<string, OverheadCentre> = {
  "Utility Bill": "utilities",
  "Rent / Fixed Expense": "kitchen-rent",
  Transport: "vehicles",
};

/**
 * R7-1 expense entry (web), same fields as the phone app's expense form, with the required cost target.
 * "Outside Purchase" is no longer entered here — new outside items go to Outside orders (R7-6); old ones stay readable.
 * Paid / balance / status are worked out by the server (R7-8).
 */
export function ExpenseFormPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { L, lang } = useLang();
  const session = useSession();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const { currentBranchId } = useBranch();

  const [loaded, setLoaded] = useState<Expense | null | undefined>(id ? undefined : null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [section, setSection] = useState<string>("Other Expense");
  const [subCategory, setSubCategory] = useState("");
  const [personName, setPersonName] = useState("");
  const [mobile, setMobile] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState("");
  const [transport, setTransport] = useState("");
  const [setup, setSetup] = useState("");
  const [other, setOther] = useState("");
  const [totalText, setTotalText] = useState("");
  const [autoTotal, setAutoTotal] = useState(true);
  const [advance, setAdvance] = useState("");
  const [method, setMethod] = useState<string>("Cash");
  const [billNumber, setBillNumber] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<CostTarget>(() => {
    const b = params.get("booking");
    return b ? { type: "booking", bookingId: b } : GENERAL_OVERHEAD;
  });
  const [paidNow, setPaidNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);
  useEffect(() => {
    if (!id) return;
    getExpense(id)
      .then((e) => {
        setLoaded(e);
        if (!e) return;
        setSection(e.section || "Other Expense");
        setSubCategory(e.subCategory);
        setPersonName(e.personName);
        setMobile(e.mobileNumber);
        setQty(txt(e.quantity));
        setUnit(e.unit);
        setRate(txt(e.rate));
        setTransport(txt(e.transportCharges));
        setSetup(txt(e.setupCharges));
        setOther(txt(e.otherCharges));
        setTotalText(txt(e.totalAmount));
        setAutoTotal(false);
        setAdvance(txt(e.advancePaid));
        setMethod(e.paymentMethod || "Cash");
        setBillNumber(e.billNumber);
        if (e.serviceDate) setDate(isoDay(e.serviceDate));
        setNotes(e.notes);
        setTarget(e.costTarget);
      })
      .catch((e) => setError(errorText(e, lang)));
  }, [id, lang]);

  const subtotal = round2(numOr0(qty) * numOr0(rate));
  const computedTotal = round2(subtotal + numOr0(transport) + numOr0(setup) + numOr0(other));
  const total = autoTotal ? computedTotal : numOr0(totalText);
  const booking = target.type === "booking" ? bookings.find((b) => b.id === target.bookingId) : undefined;
  const locked = !!loaded && (loaded.cancelled || (booking ? isClosed(booking) : false));
  const isOldOutside = section === OUTSIDE;
  const isOldAdvance = section === STAFF_ADVANCE;
  const subOptions = EXPENSE_SUBCATEGORIES[section] ?? [];
  const valid = total > 0 && (target.type === "overhead" || !!target.bookingId) && !((isOldOutside || isOldAdvance) && !id);

  const pickSection = (s: string) => {
    setSection(s);
    setSubCategory("");
    if (target.type === "overhead" && SECTION_CENTRE[s]) setTarget({ type: "overhead", centre: SECTION_CENTRE[s] });
  };

  const save = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const savedId = await saveExpense(
        {
          id,
          section,
          subCategory: subCategory.trim(),
          personName: personName.trim(),
          mobileNumber: mobile.trim(),
          quantity: numOr0(qty),
          unit: unit.trim(),
          rate: numOr0(rate),
          transportCharges: numOr0(transport),
          setupCharges: numOr0(setup),
          otherCharges: numOr0(other),
          subtotal,
          totalAmount: total,
          paymentMethod: method,
          billNumber: billNumber.trim(),
          serviceDate: new Date(`${date}T12:00:00`),
          bookingLabel: booking ? bookingLabel(booking, "en") : "",
          costTarget: target,
          notes: notes.trim(),
        },
        { uid: profile.uid, name: profile.name },
        currentBranchId,
      );
      if (!id && paidNow && method !== "Credit" && personName.trim() && can.vendorDues(profile.role)) {
        try {
          await recordVendorPayment({
            vendorId: "",
            vendorName: personName.trim(),
            amount: total,
            date,
            method: method === "Bank Transfer" ? "BankTransfer" : (method as PaymentMethod),
            allocations: [{ collection: "expenses", id: savedId, amount: total }],
            note: L("ఖర్చు నమోదు చేసినప్పుడే చెల్లించాం", "Paid when the expense was entered"),
          });
        } catch (e) {
          setError(L("ఖర్చు సేవ్ అయింది, కానీ చెల్లింపు నమోదు కాలేదు: ", "Expense saved, but the payment was not recorded: ") + errorText(e, lang));
          setBusy(false);
          return;
        }
      }
      navigate("/expenses");
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

  const field = (label: string, value: string, set: (v: string) => void, extra?: object) => (
    <TextField size="small" disabled={locked} label={label} value={value} onChange={(e) => set(e.target.value)} {...extra} />
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/expenses")} sx={{ mb: 1 }}>
        {L("ఖర్చులు", "Expenses")}
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        {id ? L("ఖర్చు మార్చు", "Edit expense") : L("కొత్త ఖర్చు", "New expense")}
      </Typography>
      {id && !loaded && <Alert severity="warning">{L("ఖర్చు దొరకలేదు.", "Expense not found.")}</Alert>}
      {locked && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {loaded?.cancelled
            ? L("ఈ ఖర్చు రద్దు అయింది — మార్చలేము.", "This expense is cancelled — it can't be changed.")
            : L("ఈ Event ముగించారు (lock) — దీని ఖర్చులు మార్చలేము.", "This event is closed — its costs can't be changed.")}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField select size="small" disabled={locked || !!id} label={L("విభాగం", "Section")} value={section} onChange={(e) => pickSection(e.target.value)}>
          {EXPENSE_SECTIONS.filter((s) => (s !== OUTSIDE && s !== STAFF_ADVANCE) || section === s).map((s) => (
            <MenuItem key={s} value={s}>
              {lang === "te" && SECTION_TE[s] ? SECTION_TE[s] : hiIfOn(s)}
            </MenuItem>
          ))}
        </TextField>
        {subOptions.length > 0 ? (
          <TextField select size="small" disabled={locked} label={L("రకం", "Type")} value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
            {[...new Set([subCategory, ...subOptions])].filter(Boolean).map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          field(L("వివరం", "Detail"), subCategory, setSubCategory)
        )}
        {(!id || isOldAdvance) && (
          <Alert severity="info" sx={{ gridColumn: { sm: "1 / -1" } }}>
            {L("సిబ్బంది అడ్వాన్స్ → ", "Staff advance → give it as an 'Advance' on the ")}
            <Link component={RouterLink} to="/staff">
              {L("సిబ్బంది page", "Staff page")}
            </Link>
            {L(
              " లో 'అడ్వాన్స్' ఇవ్వండి (జీతంలో దానంతట అదే కట్ అవుతుంది)",
              " (it is cut from the salary automatically)",
            )}
            {isOldAdvance && id ? L(" — ఇది పాత నమోదు, చూడటానికి మాత్రమే.", " — this is an old entry, shown read-only.") : ""}
          </Alert>
        )}
        {!id && (
          <Alert severity="info" sx={{ gridColumn: { sm: "1 / -1" } }}>
            {L("పుల్కా, బొబ్బట్లు, ఐస్ క్రీమ్, పాన్ లాంటి బయటి ఆర్డర్లు ఇప్పుడు ", "Pulka, bobbatlu, ice cream, paan and other outside orders now go to ")}
            <Link component={RouterLink} to="/outside-orders">
              {L("బయటి ఆర్డర్లు", "Outside orders")}
            </Link>
            {L(" లో నమోదు చేయండి.", ".")}
          </Alert>
        )}
        {field(L("ఎవరికి (వ్యక్తి / షాప్)", "Paid to (person / shop)"), personName, setPersonName)}
        {field(L("ఫోన్", "Phone"), mobile, setMobile, { type: "tel" })}
        {field(L("పరిమాణం", "Quantity"), qty, setQty)}
        {field(L("యూనిట్ (రోజులు / మంది / ట్రిప్పులు…)", "Unit (days / people / trips…)"), unit, setUnit)}
        {field(L("ధర", "Rate"), rate, setRate)}
        <Typography sx={{ alignSelf: "center" }}>
          {L("పరిమాణం × ధర", "Qty × rate")}: <b>{formatINR(subtotal)}</b>
        </Typography>
        {field(L("రవాణా ఛార్జీ", "Transport charges"), transport, setTransport)}
        {field(L("సెటప్ ఛార్జీ", "Setup charges"), setup, setSetup)}
        {field(L("ఇతర ఛార్జీలు", "Other charges"), other, setOther)}
        <TextField
          size="small"
          disabled={locked}
          label={L("మొత్తం", "Total")}
          value={autoTotal ? String(computedTotal || "") : totalText}
          onChange={(e) => {
            setAutoTotal(false);
            setTotalText(e.target.value);
          }}
          helperText={autoTotal ? L("తనంతట అదే లెక్కిస్తుంది — మార్చవచ్చు", "Worked out automatically — you may change it") : " "}
        />
        {id && numOr0(advance) > 0 ? (
          <Typography sx={{ alignSelf: "center" }}>
            {L("పాత అడ్వాన్స్ (చూడటానికి మాత్రమే)", "Old advance (read-only)")}: <b>{formatINR(numOr0(advance))}</b>
          </Typography>
        ) : (
          <Box />
        )}
        <TextField select size="small" disabled={locked} label={L("ఎలా చెల్లించారు", "Payment method")} value={method} onChange={(e) => setMethod(e.target.value)}>
          {ENTRY_PAYMENT_METHODS.map((m) => (
            <MenuItem key={m} value={m}>
              {m === "Credit" ? L("అప్పు (తర్వాత ఇస్తాం)", "Credit (pay later)") : m}
            </MenuItem>
          ))}
        </TextField>
        {field(L("బిల్ నంబర్", "Bill number"), billNumber, setBillNumber)}
        <TextField
          size="small"
          type="date"
          disabled={locked}
          label={L("తేదీ", "Date")}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
          <CostTargetPicker value={target} onChange={setTarget} bookings={bookings} disabled={locked} />
        </Box>
        <TextField
          multiline
          minRows={2}
          disabled={locked}
          label={L("గమనిక", "Notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          sx={{ gridColumn: { sm: "1 / -1" } }}
        />
      </Paper>
      {!id && profile && can.vendorDues(profile.role) && (
        <FormControlLabel
          sx={{ mt: 2, display: "flex" }}
          control={
            <Checkbox
              checked={paidNow && method !== "Credit"}
              disabled={method === "Credit" || !personName.trim()}
              onChange={(e) => setPaidNow(e.target.checked)}
            />
          }
          label={
            personName.trim()
              ? L("ఈ ఖర్చు మొత్తం ఇప్పుడే చెల్లించాం", "This expense is paid in full now")
              : L("ఇప్పుడే చెల్లించాం (ముందు \"ఎవరికి\" రాయండి)", "Paid now (fill in \"Paid to\" first)")
          }
        />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
        {L("చెల్లించింది / బాకీ / స్థితి server లెక్కిస్తుంది.", "Paid, balance and status are worked out by the server.")}
      </Typography>
      {!locked && (
        <Button variant="contained" size="large" disabled={!valid || busy} onClick={save}>
          {busy ? <CircularProgress size={22} /> : L("సేవ్ చేయి", "Save")}
        </Button>
      )}
    </Box>
  );
}
