import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { collection, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import type { Role } from "../../auth/roles";
import { isClosed, sessionName, subscribeBookings, type Booking } from "../../data/bookingRepository";
import { subscribeDishes, type Dish } from "../../data/dishRepository";
import { subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";
import { errorText, eventPlan, saveCookLog, type PlanDish, type PlanIngredient, type PlanPart } from "../../data/functions";
import { RefreshButton } from "../../components/RefreshButton";
import { DataTable } from "../../components/DataTable";
import { IngredientsTable, LearnChip, PartFacts, PlanDishBlock, copyText, planText, qtyText } from "../kitchen/PlanViews";
import { learnBadge } from "../../data/dishRepository";

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper sx={{ p: 2.5, mt: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

const dayKey = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

/** Grocery names for ingredient lines: from the plan's ingredient list, else the grocery master. */
function useGroceryNames(ingredients: PlanIngredient[]) {
  const [master, setMaster] = useState<GroceryItem[]>([]);
  useEffect(() => subscribeGroceryItems(setMaster, () => setMaster([])), []);
  return useMemo(() => {
    const m = new Map<string, { te: string; en: string; unit: string }>();
    for (const g of master) m.set(g.id, { te: g.nameTe, en: g.nameEn || g.nameRoman, unit: g.unit });
    for (const i of ingredients) m.set(i.groceryItemId, { te: i.nameTe, en: i.nameEn, unit: i.unit });
    return m;
  }, [master, ingredients]);
}

// ---------------------------------------------------------------- Event plan (eventPlan)

export function EventPlanCard({ booking }: { booking: Booking }) {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const [data, setData] = useState<{ parts: PlanPart[]; ingredients: PlanIngredient[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const names = useGroceryNames(data?.ingredients ?? []);
  const reloadKey = JSON.stringify([booking.guestCount, booking.guestCountConfirmed, booking.guestCountActual, booking.serviceStyle, booking.packageId, booking.sessions, booking.eventTypeCode]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await eventPlan({ bookingId: booking.id });
      setData({ parts: r.parts, ingredients: r.ingredients });
    } catch (e) {
      setError(errorText(e, lang));
      setData({ parts: [], ingredients: [] });
    }
  }, [booking.id, lang]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const allDishes = data?.parts.flatMap((p) => p.dishes) ?? [];
  const copy = async () => {
    if (!data) return;
    const title = L(`వంట plan — ${booking.customerNameSnapshot}`, `Cooking plan — ${booking.customerNameSnapshot}`);
    const ok = await copyText(planText(title, allDishes.map((d) => ({ name: lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe, qty: d.qty, unit: d.unit })), data.ingredients, lang));
    setCopied(ok);
  };

  return (
    <Card
      title={L("వంట plan (ఈ event)", "Cooking plan (this event)")}
      action={
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <RefreshButton onRefresh={load} />
          {allDishes.length > 0 && (
            <Button size="small" variant="outlined" onClick={copy}>
              {copied ? <><CheckIcon fontSize="small" sx={{ mr: 0.5 }} />{L("Copy అయింది", "Copied")}</> : L("WhatsApp కి copy", "Copy for WhatsApp")}
            </Button>
          )}
          {booking.eventDate && (
            <Button size="small" onClick={() => navigate(`/day-plan?date=${dayKey(booking.eventDate)}`)}>
              {L("ఆ రోజు plan", "Day plan")}
            </Button>
          )}
        </Box>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {data === null ? (
        <CircularProgress size={24} />
      ) : (
        <>
          {!booking.serviceStyle && booking.sessions.every((s) => !s.serviceStyle) && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {L("బుకింగ్ లో బంతి భోజనమా / బఫేనా ఎంచుకోండి — plan దాన్ని బట్టి మారుతుంది.", "Choose banthi or buffet on the booking — the plan depends on it.")}
            </Alert>
          )}
          {allDishes.length === 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {L(
                "ఈ మెనూలో వంటకాలు జత చేయలేదు. \"మెనూ ప్యాకేజీలు\" పేజీలో ప్రతి ఐటమ్ కి వంటకం జత చేయండి (ఒక్కసారి చాలు), లేదా కొటేషన్ save చేయండి.",
                "No dishes are linked to this menu yet. Link each menu item to a dish on the Menu packages page (once), or save a quotation.",
              )}
            </Alert>
          )}
          {data.parts.map((p) => (
            <Box key={p.sessionId || "-"} sx={{ mb: 2 }}>
              {(p.labelTe || p.labelEn) && <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{L(p.labelTe || p.labelEn, p.labelEn || p.labelTe)}</Typography>}
              <PartFacts guests={p.guests} band={p.band} serviceStyle={p.serviceStyle} comboKey={p.comboKey} kidsCount={p.kidsCount} specialMeals={p.specialMeals} kind={p.kind} />
              {p.dishes.map((d) => (
                <PlanDishBlock key={d.key} d={d} names={names} />
              ))}
            </Box>
          ))}
          {(() => {
            // Module 2e: bases to prepare first, added up over all dishes
            const m = new Map<string, { te: string; en: string; unit: string; qty: number }>();
            for (const p of data.parts)
              for (const d of p.dishes)
                for (const b of d.bases ?? []) {
                  const cur = m.get(b.dishId) ?? { te: b.nameTe, en: b.nameEn, unit: b.unit, qty: 0 };
                  cur.qty += b.qty;
                  m.set(b.dishId, cur);
                }
            if (m.size === 0) return null;
            return (
              <Alert severity="info" sx={{ mb: 1 }}>
                <b>{L("ముందుగా తయారు చేయాల్సిన బేస్‌లు", "Bases to prepare first")}:</b>{" "}
                {[...m.values()].map((b) => `${L(b.te || b.en, b.en || b.te)} ${Math.round(b.qty * 100) / 100} ${b.unit}`).join(" · ")}
              </Alert>
            );
          })()}
          {data.ingredients.length > 0 && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1, mb: 1 }}>
                {L("సరుకులు: కావాలి / నిల్వ / కొనాలి", "Groceries: needed / in stock / to buy")}
              </Typography>
              <IngredientsTable rows={data.ingredients} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Cook log (saveCookLog v2)

interface IngRow {
  key: number;
  groceryItemId: string;
  used: string;
}
interface ShareRow {
  key: number;
  bookingId: string;
  sessionId: string;
  guests: string;
}
interface DishRow {
  key: number;
  dishId: string;
  variantId: string;
  cooked: string;
  leftover: string;
  ingredients: IngRow[];
  shared: ShareRow[];
  open: boolean;
}

let rowKey = 1;
const num = (t: string) => {
  const n = Number(t.replace(/,/g, ""));
  return t.trim() === "" || !Number.isFinite(n) ? NaN : n;
};

interface SavedLine {
  id: string;
  dishId: string;
  variantId: string;
  sessionId: string;
  cooked: number;
  leftover: number;
  guests: number;
  unit: string;
  shared: boolean;
}

/** After the event: what was cooked, what was left, ingredients used, and batches shared with other events. */
export function CookLogCard({ booking, role }: { booking: Booking; role: Role }) {
  const { L, T, lang } = useLang();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [master, setMaster] = useState<GroceryItem[]>([]);
  const [sameDay, setSameDay] = useState<Booking[]>([]);
  const [saved, setSaved] = useState<SavedLine[]>([]);
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [actual, setActual] = useState("");
  const [rows, setRows] = useState<DishRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = isClosed(booking) || booking.cancelled;
  const day = dayKey(booking.eventDate);
  const happened = booking.status === "InProgress" || booking.status === "Completed" || (booking.eventDate !== null && booking.eventDate.getTime() <= Date.now());

  useEffect(() => subscribeDishes((d) => setDishes(d.filter((x) => !x.cancelled)), () => setDishes([])), []);
  useEffect(() => subscribeGroceryItems((g) => setMaster(g.filter((x) => !x.cancelled)), () => setMaster([])), []);
  useEffect(
    () =>
      role === "staff"
        ? undefined
        : subscribeBookings(booking.branchId || null, (bs) => setSameDay(bs.filter((b) => b.id !== booking.id && !b.cancelled && (dayKey(b.eventDate) === day || b.sessions.some((s) => dayKey(s.date) === day)))), () => setSameDay([])),
    [booking.id, booking.branchId, day, role],
  );
  useEffect(
    () =>
      onSnapshot(
        collection(db, "bookings", booking.id, "cookLog"),
        (snap) =>
          setSaved(
            snap.docs.map((d) => {
              const x = d.data() as DocumentData;
              return {
                id: d.id,
                dishId: String(x.dishId ?? ""),
                variantId: String(x.variantId ?? ""),
                sessionId: String(x.sessionId ?? ""),
                cooked: Number(x.cooked ?? 0),
                leftover: Number(x.leftover ?? 0),
                guests: Number(x.guests ?? 0),
                unit: String(x.unit ?? ""),
                shared: !!x.shared || !!x.sharedBatch,
              };
            }),
          ),
        () => setSaved([]),
      ),
    [booking.id],
  );

  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const dishName = (id: string) => {
    const d = dishById.get(id);
    return d ? (lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe) : id;
  };
  const session = booking.sessions.find((s) => s.id === sessionId);
  const plannedGuests = session ? session.guestCountActual || session.guestCountConfirmed || session.guests : booking.guestCountActual || booking.guestCountConfirmed || booking.guestCount;
  const thisGuests = Number.isInteger(num(actual)) && num(actual) >= 1 ? num(actual) : plannedGuests;

  // Start the form with the planned dishes of this event / session.
  const startForm = async () => {
    setOpen(true);
    setError(null);
    setNotice(null);
    setActual("");
    try {
      const r = await eventPlan({ bookingId: booking.id, ...(sessionId ? { sessionId } : {}) });
      const planned: PlanDish[] = r.dishes.filter((d) => !sessionId || d.sessionId === sessionId);
      setRows(
        planned.map((d) => ({ key: rowKey++, dishId: d.dishId, variantId: d.variantId, cooked: d.qty !== null ? String(d.qty) : "", leftover: "", ingredients: [], shared: [], open: false })),
      );
    } catch {
      setRows([]);
    }
  };

  const patch = (k: number, p: Partial<DishRow>) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...p } : r)));

  const problems: string[] = [];
  const keys = new Set<string>();
  for (const r of rows) {
    const c = num(r.cooked);
    const lo = num(r.leftover === "" ? "0" : r.leftover);
    const n = dishName(r.dishId) || "?";
    if (!r.dishId) problems.push(L("వంటకం ఎంచుకోండి.", "Pick a dish."));
    if (!(c > 0)) problems.push(L(`${n}: ఎంత వండారో రాయండి.`, `${n}: enter how much was cooked.`));
    if (lo < 0 || lo > c) problems.push(L(`${n}: మిగిలింది వండిన దానికంటే ఎక్కువ ఉండకూడదు.`, `${n}: leftover can't be more than cooked.`));
    const k = `${r.dishId}|${r.variantId}`;
    if (keys.has(k)) problems.push(L(`${n} రెండుసార్లు ఉంది.`, `${n} is listed twice.`));
    keys.add(k);
    for (const sh of r.shared) if (!sh.bookingId || !(num(sh.guests) >= 1)) problems.push(L(`${n}: పంచుకున్న event, అతిథులు ఇవ్వండి.`, `${n}: give the shared event and its guests.`));
  }
  if (booking.sessions.length > 0 && !sessionId) problems.push(L("ఏ భోజనానికో ఎంచుకోండి.", "Pick the meal session."));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const a = num(actual);
      const res = await saveCookLog({
        bookingId: booking.id,
        ...(sessionId ? { sessionId } : {}),
        ...(Number.isInteger(a) && a >= 1 ? { guestCountActual: a } : {}),
        entries: rows.map((r) => ({
          dishId: r.dishId,
          ...(r.variantId ? { variantId: r.variantId } : {}),
          cooked: num(r.cooked),
          leftover: r.leftover.trim() === "" ? 0 : num(r.leftover),
          ingredients: r.ingredients.filter((g) => g.groceryItemId && num(g.used) >= 0).map((g) => ({ groceryItemId: g.groceryItemId, used: num(g.used) })),
          ...(r.shared.length
            ? { sharedWith: r.shared.map((s) => ({ bookingId: s.bookingId, ...(s.sessionId ? { sessionId: s.sessionId } : {}), guests: num(s.guests) })) }
            : {}),
        })),
      });
      setNotice(L(`నమోదు అయింది — ${res.updatedDishes.length} వంటకాలు నేర్చుకున్నాయి.`, `Saved — ${res.updatedDishes.length} dishes updated.`));
      setOpen(false);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  if (!happened && saved.length === 0) return null;

  return (
    <Card
      title={L("వంట నమోదు (event అయ్యాక)", "Cook log (after the event)")}
      action={
        !locked && !open ? (
          <Button size="small" variant="contained" onClick={startForm} disabled={booking.sessions.length > 0 && !sessionId}>
            {saved.length ? L("మళ్ళీ నమోదు / సరిచేయి", "Log again / correct") : L("ఎంత వండాం, ఎంత మిగిలింది", "What we cooked and what was left")}
          </Button>
        ) : undefined
      }
    >
      {notice && (
        <Alert severity="success" sx={{ mb: 1 }}>
          {notice}
        </Alert>
      )}
      {booking.sessions.length > 0 && !open && !locked && (
        <TextField select size="small" label={L("ఏ భోజనం", "Which meal")} value={sessionId} onChange={(e) => setSessionId(e.target.value)} sx={{ minWidth: 200, mb: 1 }}>
          {booking.sessions
            .filter((s) => s.status !== "cancelled")
            .map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {sessionName(s, lang)}
              </MenuItem>
            ))}
        </TextField>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {L(
          "ప్రతి event తర్వాత ఇది నమోదు చేస్తే CRM మీ వంట నేర్చుకుంటుంది — 5 events తర్వాత \"నేర్చుకున్నది ✓\".",
          "Log this after every event and the CRM learns your cooking — after 5 events a dish is \"Learned ✓\".",
        )}
      </Typography>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            size="small"
            type="number"
            label={L(`నిజంగా వచ్చినవారు (ఐచ్ఛికం — ఇప్పుడు ${plannedGuests})`, `Actual guests (optional — now ${plannedGuests})`)}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            sx={{ maxWidth: 320 }}
          />
          {rows.map((r) => {
            const d = dishById.get(r.dishId);
            const c = num(r.cooked);
            const lo = r.leftover.trim() === "" ? 0 : num(r.leftover);
            const others = r.shared.reduce((a, s) => a + (num(s.guests) >= 1 ? num(s.guests) : 0), 0);
            const total = thisGuests + others;
            const shareOf = (g: number) => (c > 0 && total > 0 ? Math.round(((c * g) / total) * 100) / 100 : 0);
            const leftOf = (g: number) => (lo > 0 && total > 0 ? Math.round(((lo * g) / total) * 100) / 100 : 0);
            return (
              <Paper key={r.key} variant="outlined" sx={{ p: 1.5 }}>
                <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr 1fr auto" }, alignItems: "center" }}>
                  <Autocomplete
                    sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}
                    options={dishes}
                    value={d ?? null}
                    onChange={(_e, v) => patch(r.key, { dishId: v?.id ?? "", variantId: "" })}
                    getOptionLabel={(x) => (lang === "te" ? x.nameTe || x.nameEn : x.nameEn || x.nameTe)}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderInput={(p) => <TextField {...p} size="small" label={L("వంటకం", "Dish")} />}
                  />
                  {d && d.variants.length > 0 ? (
                    <TextField select size="small" label={L("రకం", "Variant")} value={r.variantId} onChange={(e) => patch(r.key, { variantId: e.target.value })}>
                      <MenuItem value="">{L("సాధారణం", "Plain")}</MenuItem>
                      {d.variants.map((v) => (
                        <MenuItem key={v.id} value={v.id}>
                          {lang === "te" ? v.nameTe || v.nameEn : v.nameEn || v.nameTe}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Box sx={{ display: { xs: "none", md: "block" } }} />
                  )}
                  <TextField size="small" label={L(`వండింది (${d?.unit ?? ""})`, `Cooked (${d?.unit ?? ""})`)} value={r.cooked} onChange={(e) => patch(r.key, { cooked: e.target.value })} />
                  <TextField size="small" label={L(`మిగిలింది (${d?.unit ?? ""})`, `Left over (${d?.unit ?? ""})`)} value={r.leftover} onChange={(e) => patch(r.key, { leftover: e.target.value })} />
                  <IconButton aria-label={L("తీసేయి", "Remove")} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    <CloseIcon />
                  </IconButton>
                </Box>
                {d && (
                  <Box sx={{ mt: 0.5 }}>
                    <LearnChip {...learnBadge(d.learned?.eventsUsed ?? 0)} />
                  </Box>
                )}
                <Button size="small" sx={{ mt: 0.5 }} onClick={() => patch(r.key, { open: !r.open })}>
                  {r.open ? L("తక్కువ చూపించు", "Show less") : L(`వాడిన సరుకులు (${r.ingredients.length}) · పంచుకున్న events (${r.shared.length})`, `Ingredients used (${r.ingredients.length}) · shared with (${r.shared.length})`)}
                </Button>
                <Collapse in={r.open}>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>
                    {L("వాడిన సరుకులు", "Ingredients used")}
                  </Typography>
                  {r.ingredients.map((g) => {
                    const m = master.find((x) => x.id === g.groceryItemId);
                    return (
                      <Box key={g.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: "2fr 1fr auto", alignItems: "center", mt: 0.75 }}>
                        <Autocomplete
                          options={master}
                          value={m ?? null}
                          onChange={(_e, v) => patch(r.key, { ingredients: r.ingredients.map((x) => (x.key === g.key ? { ...x, groceryItemId: v?.id ?? "" } : x)) })}
                          getOptionLabel={(x) => (lang === "te" ? `${x.nameTe} · ${x.nameEn}` : `${x.nameEn} · ${x.nameTe}`)}
                          isOptionEqualToValue={(a, b) => a.id === b.id}
                          renderInput={(p) => <TextField {...p} size="small" label={L("సరుకు", "Item")} />}
                        />
                        <TextField
                          size="small"
                          label={L(`వాడింది (${m?.unit ?? ""})`, `Used (${m?.unit ?? ""})`)}
                          value={g.used}
                          onChange={(e) => patch(r.key, { ingredients: r.ingredients.map((x) => (x.key === g.key ? { ...x, used: e.target.value } : x)) })}
                        />
                        <IconButton size="small" aria-label={L("తీసేయి", "Remove")} onClick={() => patch(r.key, { ingredients: r.ingredients.filter((x) => x.key !== g.key) })}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                  <Button size="small" startIcon={<AddIcon />} onClick={() => patch(r.key, { ingredients: [...r.ingredients, { key: rowKey++, groceryItemId: "", used: "" }] })}>
                    {L("సరుకు", "Item")}
                  </Button>

                  <Typography variant="subtitle2" sx={{ mt: 1.5 }}>
                    {L("ఈ వంట ఇంకా ఏ events కి", "This batch also went to")}
                  </Typography>
                  {r.shared.map((sh) => {
                    const ob = sameDay.find((b) => b.id === sh.bookingId);
                    return (
                      <Box key={sh.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr auto" }, alignItems: "center", mt: 0.75 }}>
                        <TextField
                          select
                          size="small"
                          label={L("Event", "Event")}
                          value={sh.bookingId}
                          onChange={(e) => {
                            const b = sameDay.find((x) => x.id === e.target.value);
                            patch(r.key, { shared: r.shared.map((x) => (x.key === sh.key ? { ...x, bookingId: e.target.value, sessionId: "", guests: b ? String(b.guestCountActual || b.guestCountConfirmed || b.guestCount) : "" } : x)) });
                          }}
                        >
                          {sameDay.length === 0 && (
                            <MenuItem value="" disabled>
                              {L("అదే రోజు ఇంకో event లేదు", "No other event that day")}
                            </MenuItem>
                          )}
                          {sameDay.map((b) => (
                            <MenuItem key={b.id} value={b.id}>
                              {b.customerNameSnapshot || b.venue || b.id}
                            </MenuItem>
                          ))}
                        </TextField>
                        {ob && ob.sessions.length > 0 ? (
                          <TextField
                            select
                            size="small"
                            label={L("భోజనం", "Meal")}
                            value={sh.sessionId}
                            onChange={(e) => {
                              const s = ob.sessions.find((x) => x.id === e.target.value);
                              patch(r.key, { shared: r.shared.map((x) => (x.key === sh.key ? { ...x, sessionId: e.target.value, guests: s ? String(s.guestCountActual || s.guestCountConfirmed || s.guests) : x.guests } : x)) });
                            }}
                          >
                            {ob.sessions.map((s) => (
                              <MenuItem key={s.id} value={s.id}>
                                {sessionName(s, lang)}
                              </MenuItem>
                            ))}
                          </TextField>
                        ) : (
                          <Box sx={{ display: { xs: "none", md: "block" } }} />
                        )}
                        <TextField
                          size="small"
                          label={L("అతిథులు", "Guests")}
                          value={sh.guests}
                          onChange={(e) => patch(r.key, { shared: r.shared.map((x) => (x.key === sh.key ? { ...x, guests: e.target.value } : x)) })}
                        />
                        <IconButton size="small" aria-label={L("తీసేయి", "Remove")} onClick={() => patch(r.key, { shared: r.shared.filter((x) => x.key !== sh.key) })}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                  <Button size="small" startIcon={<AddIcon />} onClick={() => patch(r.key, { shared: [...r.shared, { key: rowKey++, bookingId: "", sessionId: "", guests: "" }] })}>
                    {L("ఇంకో event", "Another event")}
                  </Button>
                  {r.shared.length > 0 && c > 0 && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {L("అతిథుల బట్టి పంపకం (చూపించడానికి — server ఇలాగే పంచుతుంది):", "Split by guests (preview — the server splits the same way):")}
                      </Typography>
                      <Typography variant="body2">
                        {L("ఈ event", "This event")} ({thisGuests}): {qtyText(shareOf(thisGuests))} {d?.unit} · {L("మిగిలింది", "left")} {qtyText(leftOf(thisGuests))}
                      </Typography>
                      {r.shared.map((sh) => {
                        const g = num(sh.guests) >= 1 ? num(sh.guests) : 0;
                        const ob = sameDay.find((b) => b.id === sh.bookingId);
                        return (
                          <Typography key={sh.key} variant="body2">
                            {ob?.customerNameSnapshot || "—"} ({g}): {qtyText(shareOf(g))} {d?.unit} · {L("మిగిలింది", "left")} {qtyText(leftOf(g))}
                          </Typography>
                        );
                      })}
                    </Alert>
                  )}
                </Collapse>
              </Paper>
            );
          })}
          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setRows((rs) => [...rs, { key: rowKey++, dishId: "", variantId: "", cooked: "", leftover: "", ingredients: [], shared: [], open: false }])}>
              {L("వంటకం", "Dish")}
            </Button>
          </Box>
          {rows.length > 0 && problems.length > 0 && (
            <Typography variant="body2" color="error">
              {problems[0]}
            </Typography>
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" onClick={save} disabled={busy || rows.length === 0 || problems.length > 0}>
              {busy ? <CircularProgress size={20} /> : L("నమోదు చేయి", "Save log")}
            </Button>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              {L("వద్దు", "Cancel")}
            </Button>
          </Box>
        </Box>
      </Collapse>

      {saved.length > 0 && (
        <DataTable
          rows={saved}
          rowKey={(x) => x.id}
          columns={[
            {
              label: L("వంటకం", "Dish"),
              render: (x) => {
                const dd = dishById.get(x.dishId);
                const v = dd?.variants.find((y) => y.id === x.variantId);
                const s = booking.sessions.find((y) => y.id === x.sessionId);
                return `${dishName(x.dishId)}${v ? ` · ${lang === "te" ? v.nameTe || v.nameEn : v.nameEn || v.nameTe}` : ""}${s ? ` · ${sessionName(s, lang)}` : ""}`;
              },
            },
            { label: L("వండింది", "Cooked"), align: "right", render: (x) => `${qtyText(x.cooked)} ${x.unit}` },
            { label: L("మిగిలింది", "Left"), align: "right", render: (x) => `${qtyText(x.leftover)} ${x.unit}` },
            { label: L("అతిథులు", "Guests"), align: "right", hideOnMobile: true, render: (x) => x.guests || "—" },
            {
              label: L("నేర్చుకోవడం", "Learning"),
              render: (x) => {
                const dd = dishById.get(x.dishId);
                return dd ? <LearnChip {...learnBadge(dd.learned?.eventsUsed ?? 0)} /> : null;
              },
            },
          ]}
        />
      )}
      {saved.length === 0 && !open && (
        <Typography variant="body2" color="text.secondary">
          {T({ te: "ఇంకా నమోదు చేయలేదు.", en: "Nothing logged yet." })}
        </Typography>
      )}
    </Card>
  );
}
