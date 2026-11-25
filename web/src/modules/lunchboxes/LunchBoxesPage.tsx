import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { subscribeCustomers, type Customer } from "../../data/customerRepository";
import { subscribeDishes, type Dish } from "../../data/dishRepository";
import { dueOn, lunchBoxQuery, subscribeLunchBoxOrders, type LunchBoxOrder } from "../../data/lunchBoxRepository";
import { useBusinessSettings } from "../../data/settingsRepository";
import { errorText, invoiceLunchBoxes, LUNCH_BOX_DAYS, markLunchBoxDelivered, saveLunchBoxOrder, type LunchBoxDay } from "../../data/functions";
import { refreshFromServer } from "../../data/refresh";
import { CancelButton } from "../../components/CancelControls";
import { ErrorBox, parseMoney, ScreenTitle } from "../../components/ui";
import { formatMoney } from "../../util/format";
import { formatDay, istDay, istMonth } from "../../util/dates";
import { tokens } from "../../theme/tokens";

const DAY_LABEL: Record<LunchBoxDay, { te: string; en: string }> = {
  mon: { te: "సోమ", en: "Mon" },
  tue: { te: "మంగళ", en: "Tue" },
  wed: { te: "బుధ", en: "Wed" },
  thu: { te: "గురు", en: "Thu" },
  fri: { te: "శుక్ర", en: "Fri" },
  sat: { te: "శని", en: "Sat" },
};
/** QA fix 10: full day names for screen readers (the chips show the short names). */
const DAY_FULL: Record<LunchBoxDay, { te: string; en: string }> = {
  mon: { te: "సోమవారం", en: "Monday" },
  tue: { te: "మంగళవారం", en: "Tuesday" },
  wed: { te: "బుధవారం", en: "Wednesday" },
  thu: { te: "గురువారం", en: "Thursday" },
  fri: { te: "శుక్రవారం", en: "Friday" },
  sat: { te: "శనివారం", en: "Saturday" },
};
const STATUS_LABEL = {
  active: { te: "నడుస్తోంది", en: "Active" },
  paused: { te: "ఆపాం", en: "Paused" },
  cancelled: { te: "రద్దు", en: "Cancelled" },
} as const;

interface Form {
  id?: string;
  customerId: string;
  mode: "once" | "repeat";
  date: string;
  days: LunchBoxDay[];
  startDate: string;
  endDate: string;
  count: string;
  menuOptionIds: string[];
  deliveryAddress: string;
  deliveryTime: string;
  pricePerBox: string;
  status: "active" | "paused";
}

/** R10-12 lunch boxes: orders (saveLunchBoxOrder), delivery ticks (markLunchBoxDelivered), monthly bill (invoiceLunchBoxes). */
export function LunchBoxesPage() {
  const { L, T, lang } = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const { settings } = useBusinessSettings();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const role = profile?.role ?? "staff";
  const canManage = role === "admin" || role === "manager";
  const branch = role === "admin" ? currentBranchId : profile?.branchId ?? null;
  const [orders, setOrders] = useState<LunchBoxOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [day, setDay] = useState(istDay());
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ticking, setTicking] = useState<string | null>(null);
  const [billMonth, setBillMonth] = useState(istMonth());
  const [billCustomer, setBillCustomer] = useState("");
  const [billing, setBilling] = useState(false);
  const [billMsg, setBillMsg] = useState<{ text: string; invoiceId: string } | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => subscribeLunchBoxOrders(role, branch, setOrders, (e) => setError(e.message)), [role, branch]);
  useEffect(() => (canManage ? subscribeCustomers((c) => setCustomers(c.filter((x) => !x.cancelled))) : undefined), [canManage]);
  useEffect(() => subscribeDishes((d) => setDishes(d.filter((x) => !x.cancelled && !x.isSubRecipe)), () => setDishes([])), []);

  const live = orders.filter((o) => !o.cancelled && o.status !== "cancelled");
  const dueToday = live.filter((o) => dueOn(o, day));
  const dishName = (id: string) => {
    const d = dishes.find((x) => x.id === id);
    return d ? L(d.nameTe || d.nameEn, d.nameEn || d.nameTe) : id;
  };
  const billCustomers = useMemo(() => [...new Map(orders.map((o) => [o.customerId, o.customerName])).entries()], [orders]);

  const openNew = () => {
    setFormError(null);
    setForm({
      customerId: "",
      mode: "repeat",
      date: istDay(),
      days: ["mon", "tue", "wed", "thu", "fri", "sat"],
      startDate: istDay(),
      endDate: "",
      count: "10",
      menuOptionIds: [],
      deliveryAddress: "",
      deliveryTime: "12:30",
      pricePerBox: "",
      status: "active",
    });
  };
  const openEdit = (o: LunchBoxOrder) => {
    setFormError(null);
    setForm({
      id: o.id,
      customerId: o.customerId,
      mode: o.date ? "once" : "repeat",
      date: o.date || istDay(),
      days: o.days.filter((d): d is LunchBoxDay => (LUNCH_BOX_DAYS as readonly string[]).includes(d)),
      startDate: o.startDate || istDay(),
      endDate: o.endDate,
      count: String(o.count),
      menuOptionIds: o.menuOptionIds,
      deliveryAddress: o.deliveryAddress,
      deliveryTime: o.deliveryTime,
      pricePerBox: String(o.pricePerBox),
      status: o.status === "paused" ? "paused" : "active",
    });
  };

  async function save() {
    if (!form) return;
    const count = parseInt(form.count, 10);
    const price = form.pricePerBox.trim() === "" ? null : parseMoney(form.pricePerBox);
    if (!form.customerId) return setFormError(L("కస్టమర్ ఎంచుకోండి.", "Choose the customer."));
    if (!Number.isInteger(count) || count < 1) return setFormError(L("బాక్సుల సంఖ్య 1 లేదా ఎక్కువ.", "Boxes must be 1 or more."));
    if (form.mode === "repeat" && form.days.length === 0) return setFormError(L("వారంలో రోజులు ఎంచుకోండి (సోమ–శని).", "Pick the weekdays (Mon–Sat)."));
    if (form.mode === "repeat" && form.endDate && form.endDate < form.startDate) return setFormError(L("ముగింపు తేదీ మొదలు తర్వాత ఉండాలి.", "End date must be after the start."));
    if (price !== null && !Number.isFinite(price)) return setFormError(L("బాక్స్ ధర సరిగా లేదు.", "Box price is not valid."));
    if (!/^\d{2}:\d{2}$/.test(form.deliveryTime)) return setFormError(L("డెలివరీ సమయం HH:MM.", "Delivery time must be HH:MM."));
    if (role === "admin" && !currentBranchId && !form.id) return setFormError(L("ముందు పైన శాఖ (branch) ఎంచుకోండి.", "Select a branch first."));
    setSaving(true);
    setFormError(null);
    try {
      await saveLunchBoxOrder({
        ...(form.id ? { id: form.id } : {}),
        customerId: form.customerId,
        ...(form.mode === "once" ? { date: form.date } : { days: form.days, startDate: form.startDate, ...(form.endDate ? { endDate: form.endDate } : {}) }),
        count,
        menuOptionIds: form.menuOptionIds,
        deliveryAddress: form.deliveryAddress.trim(),
        deliveryTime: form.deliveryTime,
        ...(price !== null ? { pricePerBox: price } : {}),
        status: form.status,
        ...(branch ? { branchId: branch } : {}),
      });
      setForm(null);
    } catch (e) {
      setFormError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  async function tick(o: LunchBoxOrder, delivered: boolean) {
    setTicking(o.id);
    setError(null);
    try {
      await markLunchBoxDelivered({ orderId: o.id, date: day, ...(delivered ? {} : { count: 0 }) });
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setTicking(null);
    }
  }

  async function bill() {
    if (!billCustomer) return;
    setBilling(true);
    setError(null);
    setBillMsg(null);
    try {
      const r = await invoiceLunchBoxes({ customerId: billCustomer, month: billMonth });
      setBillMsg({ text: `${T(r.text)} · ${r.invoiceNumber} · ${r.lines.reduce((a, l) => a + l.boxes, 0)} ${L("బాక్సులు", "boxes")}`, invoiceId: r.invoiceId });
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBilling(false);
    }
  }

  const schedule = (o: LunchBoxOrder) =>
    o.date
      ? formatDay(o.date, lang)
      : `${o.days.map((d) => (DAY_LABEL[d as LunchBoxDay] ? T(DAY_LABEL[d as LunchBoxDay]) : d)).join(", ")} · ${formatDay(o.startDate, lang)}${o.endDate ? ` – ${formatDay(o.endDate, lang)}` : ""}`;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("లంచ్ బాక్సులు", "Lunch boxes")}
        subtitle={L(`ఆఫీసులు / వ్యక్తులకి రోజూ భోజనం — బాక్స్ ధర ${formatMoney(settings.lunchBoxPrice)} (Settings)`, `Daily meals for offices / people — box price ${formatMoney(settings.lunchBoxPrice)} (Settings)`)}
        onRefresh={() => refreshFromServer(lunchBoxQuery(role, branch))}
        action={
          canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
              {L("కొత్త order", "New order")}
            </Button>
          )
        }
      />
      <ErrorBox message={error} />

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
          <Typography variant="h6" component="h2">
            {L("డెలివరీ", "Deliveries")}
          </Typography>
          <TextField type="date" size="small" label={L("రోజు", "Day")} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        {dueToday.length === 0 ? (
          <Typography color="text.secondary">{L("ఈ రోజు లంచ్ బాక్సులు లేవు.", "No lunch boxes on this day.")}</Typography>
        ) : (
          dueToday.map((o) => {
            const delivered = o.deliveries[day];
            return (
              <Box key={o.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", borderBottom: `1px solid ${tokens.color.border}`, py: 0.75 }}>
                <FormControlLabel
                  control={<Checkbox checked={(delivered ?? 0) > 0} disabled={ticking === o.id || day > istDay()} onChange={(e) => tick(o, e.target.checked)} />}
                  label={
                    <span>
                      <b>{o.customerName}</b> · {o.count} {L("బాక్సులు", "boxes")} · {o.deliveryTime}
                      {o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                    </span>
                  }
                />
                {delivered !== undefined && <Chip size="small" color={delivered > 0 ? "success" : "default"} label={delivered > 0 ? L(`${delivered} ఇచ్చాం`, `${delivered} delivered`) : L("ఇవ్వలేదు", "Not delivered")} />}
                {ticking === o.id && <CircularProgress size={18} />}
              </Box>
            );
          })
        )}
        <Typography variant="caption" color="text.secondary">
          {day > istDay() ? L("ముందు రోజుల delivery tick చేయలేము.", "Future days cannot be ticked.") : L("Tick చేసిన బాక్సులకే bill వేస్తాం.", "Only ticked deliveries are billed.")}
        </Typography>
      </Paper>

      {canManage && (
        <Paper sx={{ p: 2.5, mb: 2, display: "grid", gap: 1.5 }}>
          <Typography variant="h6" component="h2">
            {L("నెల bill", "Monthly invoice")}
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
            <TextField select size="small" label={L("కస్టమర్", "Customer")} value={billCustomer} onChange={(e) => setBillCustomer(e.target.value)} sx={{ minWidth: 220 }}>
              {billCustomers.map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <TextField type="month" size="small" label={L("నెల", "Month")} value={billMonth} onChange={(e) => setBillMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <Button variant="contained" onClick={bill} disabled={billing || !billCustomer}>
              {billing ? <CircularProgress size={20} color="inherit" /> : L("Bill తయారు చేయి", "Make invoice")}
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {L("డబ్బు రాకముందు మళ్ళీ చేస్తే అదే bill కొత్త లెక్కతో మారుతుంది.", "Running it again before any payment rebuilds the same invoice.")}
          </Typography>
          {billMsg && (
            <Alert
              severity="success"
              action={
                <Button color="inherit" size="small" onClick={() => navigate(`/invoices/${billMsg.invoiceId}`)}>
                  {L("Bill చూడు", "Open")}
                </Button>
              }
            >
              {billMsg.text}
            </Alert>
          )}
        </Paper>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Typography variant="h6" component="h2">
          {L(`Orders (${live.length})`, `Orders (${live.length})`)}
        </Typography>
        <FormControlLabel control={<Checkbox checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />} label={L("రద్దైనవి చూపించు", "Show cancelled")} />
      </Box>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {(showCancelled ? orders : live).map((o) => (
          <Paper key={o.id} sx={{ p: 2, opacity: o.cancelled || o.status !== "active" ? 0.7 : 1 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>
                  {o.customerName} · {o.count} {L("బాక్సులు", "boxes")} × {formatMoney(o.pricePerBox)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {schedule(o)} · {o.deliveryTime}
                  {o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                </Typography>
                {o.menuOptionIds.length > 0 && <Typography variant="body2">{o.menuOptionIds.map(dishName).join(", ")}</Typography>}
              </Box>
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                <Chip size="small" color={o.status === "active" && !o.cancelled ? "success" : "default"} label={o.cancelled ? T(STATUS_LABEL.cancelled) : T(STATUS_LABEL[o.status])} />
                {canManage && !o.cancelled && o.status !== "cancelled" && (
                  <>
                    <Button size="small" onClick={() => openEdit(o)}>
                      {L("మార్చు", "Edit")}
                    </Button>
                    <CancelButton collection="lunchBoxOrders" id={o.id} what={o.customerName} />
                  </>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
        {live.length === 0 && !showCancelled && (
          <Typography color="text.secondary">{L("ఇంకా lunch box orders లేవు (జనవరి 2027 నుండి అమ్మకాలు).", "No lunch box orders yet (sales from January 2027).")}</Typography>
        )}
      </Box>

      <Dialog open={!!form} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? L("Order మార్చు", "Edit order") : L("కొత్త lunch box order", "New lunch box order")}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <Autocomplete
              options={customers}
              value={customers.find((c) => c.id === form.customerId) ?? null}
              onChange={(_, c) => setForm({ ...form, customerId: c?.id ?? "", deliveryAddress: form.deliveryAddress || c?.address || "" })}
              getOptionLabel={(c) => `${c.name}${c.phone ? ` · ${c.phone}` : ""}`}
              renderInput={(p) => <TextField {...p} label={L("కస్టమర్ (కంపెనీ / వ్యక్తి)", "Customer (company / person)")} />}
            />
            <RadioGroup row value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Form["mode"] })}>
              <FormControlLabel value="repeat" control={<Radio />} label={L("ప్రతి వారం (రోజులు)", "Every week (days)")} />
              <FormControlLabel value="once" control={<Radio />} label={L("ఒక్క రోజు", "One day")} />
            </RadioGroup>
            {form.mode === "once" ? (
              <TextField type="date" label={L("తేదీ", "Date")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            ) : (
              <>
                <Box role="group" aria-label={L("వారంలో రోజులు", "Weekdays")} sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {LUNCH_BOX_DAYS.map((d) => {
                    const on = form.days.includes(d);
                    return (
                      <Chip
                        key={d}
                        clickable
                        color={on ? "primary" : "default"}
                        variant={on ? "filled" : "outlined"}
                        label={T(DAY_LABEL[d])}
                        aria-pressed={on}
                        aria-label={T(DAY_FULL[d])}
                        role="button"
                        onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== d) : [...form.days, d] })}
                      />
                    );
                  })}
                </Box>
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
                  <TextField type="date" label={L("మొదలు", "Start")} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField type="date" label={L("ముగింపు (ఐచ్ఛికం)", "End (optional)")} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                </Box>
              </>
            )}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <TextField label={L("బాక్సులు", "Boxes")} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
              <TextField type="time" label={L("డెలివరీ సమయం", "Delivery time")} value={form.deliveryTime} onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField
                label={L("బాక్స్ ధర ₹", "Box price ₹")}
                value={form.pricePerBox}
                placeholder={String(settings.lunchBoxPrice)}
                onChange={(e) => setForm({ ...form, pricePerBox: e.target.value })}
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
              />
            </Box>
            <TextField label={L("డెలివరీ చిరునామా", "Delivery address")} value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} multiline />
            <Autocomplete
              multiple
              options={dishes.map((d) => d.id)}
              value={form.menuOptionIds}
              onChange={(_, v) => setForm({ ...form, menuOptionIds: v })}
              getOptionLabel={dishName}
              renderInput={(p) => <TextField {...p} label={L("బాక్స్‌లో వంటకాలు", "Dishes in the box")} />}
            />
            <TextField select label={L("స్థితి", "Status")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}>
              <MenuItem value="active">{T(STATUS_LABEL.active)}</MenuItem>
              <MenuItem value="paused">{T(STATUS_LABEL.paused)}</MenuItem>
            </TextField>
            <ErrorBox message={formError} />
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)} disabled={saving}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? L("Save అవుతోంది…", "Saving…") : L("Save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
