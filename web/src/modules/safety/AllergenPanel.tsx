import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, IconButton, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useLang } from "../../i18n/LanguageContext";
import { useBranch } from "../../session/BranchContext";
import type { Allergen, FoodTags } from "../../data/foodTags";
import { allergenMatrix, errorText, saveBusinessSettings, setFoodTags, type AllergenMatrix } from "../../data/functions";
import { subscribeDishes, type Dish } from "../../data/dishRepository";
import { subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { formatDate } from "../../util/format";

type Food = "veg" | "nonveg" | "";

/**
 * The 8 allergen groups of FSSAI (Labelling & Display) Regulations 2020, reg. 5(14) / display rules for food service.
 * Added only when the owner presses the button — the CRM does not put them in by itself.
 */
const FSSAI_ALLERGENS: Allergen[] = [
  { id: "gluten", te: "గ్లూటెన్ ఉన్న ధాన్యాలు (గోధుమ, బార్లీ, ఓట్స్…)", en: "Cereals containing gluten (wheat, barley, oats…)" },
  { id: "crustacean", te: "క్రస్టేషియన్ (రొయ్యలు, పీతలు)", en: "Crustacean (prawns, crabs)" },
  { id: "milk", te: "పాలు, పాల ఉత్పత్తులు", en: "Milk and milk products" },
  { id: "egg", te: "గుడ్డు", en: "Egg" },
  { id: "fish", te: "చేప", en: "Fish" },
  { id: "nuts", te: "వేరుశనగ, గింజలు (జీడిపప్పు, బాదం…)", en: "Peanuts and tree nuts (cashew, almond…)" },
  { id: "soy", te: "సోయా", en: "Soybeans" },
  { id: "sulphite", te: "సల్ఫైట్ (10 mg/kg లేదా ఎక్కువ)", en: "Sulphite (10 mg/kg or more)" },
];

/** Owner: the allergen names (none are shipped — he writes them). */
function AllergenListEditor({ initial }: { initial: Allergen[] }) {
  const { L, lang } = useLang();
  const [rows, setRows] = useState<Allergen[]>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const storedList = JSON.stringify(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setRows(initial), [storedList]);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveBusinessSettings({ allergens: rows.filter((r) => r.te.trim() || r.en.trim()) });
      setMsg({ ok: true, text: L("సేవ్ అయింది.", "Saved.") });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, lang) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {L("అలర్జీల జాబితా", "Allergen list")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {L("మీ వంటకాల్లో గుర్తించాల్సిన అలర్జీలు మీరే రాయండి (ఉదా: పాలు, వేరుశనగ). CRM ఏదీ ముందే పెట్టదు.", "Write the allergens you want to track in your dishes (e.g. milk, peanuts). The CRM ships none.")}
      </Typography>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <TextField size="small" label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={r.te} onChange={(e) => setRows((c) => c.map((x, k) => (k === i ? { ...x, te: e.target.value } : x)))} />
          <TextField size="small" label="English" value={r.en} onChange={(e) => setRows((c) => c.map((x, k) => (k === i ? { ...x, en: e.target.value } : x)))} />
          <IconButton aria-label={L("తీసేయి", "Remove")} onClick={() => setRows((c) => c.filter((_, k) => k !== i))}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Button startIcon={<AddIcon />} onClick={() => setRows((c) => [...c, { id: "", te: "", en: "" }])}>
          {L("అలర్జీ చేర్చు", "Add allergen")}
        </Button>
        <Button
          variant="outlined"
          onClick={() => setRows((c) => [...c, ...FSSAI_ALLERGENS.filter((f) => !c.some((x) => x.id === f.id || x.en.trim().toLowerCase() === f.en.toLowerCase()))])}
        >
          {L("FSSAI 8 అలర్జీలు చేర్చు", "Add FSSAI's 8 allergens")}
        </Button>
        <Button variant="contained" disabled={busy} onClick={() => void save()}>
          {L("జాబితా సేవ్", "Save list")}
        </Button>
      </Box>
      {msg && <Alert severity={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
    </Paper>
  );
}

function TagRow({ kind, id, name, food, allergens }: { kind: "dish" | "grocery"; id: string; name: string; food: FoodTags; allergens: Allergen[] }) {
  const { L, lang } = useLang();
  const [type, setType] = useState<Food>(food.foodType);
  const [chosen, setChosen] = useState<string[]>(food.allergens);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset only when the stored tags of THIS row change (a new snapshot of the whole list must not wipe an edit in progress).
  const stored = `${food.tagged}|${food.foodType}|${food.allergens.join(",")}`;
  useEffect(() => {
    setType(food.foodType);
    setChosen(food.allergens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  const changed = !food.tagged || type !== food.foodType || chosen.slice().sort().join() !== food.allergens.slice().sort().join();
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // an allergen the owner has since removed from the list is dropped (the server accepts only listed ones)
      await setFoodTags({ kind, id, foodType: type, allergens: chosen.filter((x) => allergens.some((a) => a.id === x)) });
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  return (
    <TableRow>
      <TableCell sx={{ minWidth: 140 }}>
        {name}
        <Box>{food.tagged ? <Chip size="small" color="success" variant="outlined" label={L("గుర్తించారు", "Tagged")} /> : <Chip size="small" color="warning" label={L("గుర్తించలేదు", "Not tagged")} />}</Box>
      </TableCell>
      <TableCell>
        <ToggleButtonGroup size="small" exclusive value={type} onChange={(_, v) => v !== null && setType(v as Food)}>
          <ToggleButton value="veg">{L("శాకాహారం", "Veg")}</ToggleButton>
          <ToggleButton value="nonveg">{L("మాంసాహారం", "Non-veg")}</ToggleButton>
          <ToggleButton value="">{L("తెలియదు", "Not known")}</ToggleButton>
        </ToggleButtonGroup>
      </TableCell>
      <TableCell>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {allergens.map((a) => {
            const on = chosen.includes(a.id);
            return <Chip key={a.id} size="small" color={on ? "error" : "default"} variant={on ? "filled" : "outlined"} label={L(a.te, a.en)} onClick={() => setChosen((c) => (on ? c.filter((x) => x !== a.id) : [...c, a.id]))} />;
          })}
        </Box>
        {error && <Typography variant="caption" color="error">{error}</Typography>}
      </TableCell>
      <TableCell>
        <Button size="small" variant="contained" disabled={busy || !changed} onClick={() => void save()}>
          {food.tagged ? L("సేవ్", "Save") : L("గుర్తించు", "Tag")}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Owner / manager: tag dishes and grocery items — veg / non-veg and allergens. */
function Tagging({ allergens }: { allergens: Allergen[] }) {
  const { L } = useLang();
  const [what, setWhat] = useState<"dish" | "grocery">("dish");
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [groceries, setGroceries] = useState<GroceryItem[]>([]);
  const [search, setSearch] = useState("");
  const [onlyUntagged, setOnlyUntagged] = useState(true);
  useEffect(() => subscribeDishes(setDishes, () => setDishes([])), []);
  useEffect(() => subscribeGroceryItems(setGroceries, () => setGroceries([])), []);
  const rows = useMemo(() => {
    const all = (what === "dish" ? dishes : groceries).filter((x) => !x.cancelled).map((x) => ({ id: x.id, name: x.nameTe || x.nameEn || x.id, other: x.nameEn, food: x.food }));
    const q = search.trim().toLowerCase();
    return all.filter((x) => (!onlyUntagged || !x.food.tagged) && (!q || x.name.toLowerCase().includes(q) || x.other.toLowerCase().includes(q)));
  }, [what, dishes, groceries, search, onlyUntagged]);
  const untagged = (what === "dish" ? dishes : groceries).filter((x) => !x.cancelled && !x.food.tagged).length;
  return (
    <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {L("వంటకాలు, సరుకులకు గుర్తులు", "Tag dishes and grocery items")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {L("గుర్తించని వాటి అలర్జీలు పట్టికలో \"తెలియదు\" గానే వస్తాయి. ఒక వంటకం అలర్జీలు = దాని గుర్తులు + దాని సరుకులు + దాని బేస్‌ల గుర్తులు.", "Anything not tagged shows as \"not known\" in the matrix. A dish's allergens = its own tags + its grocery items' + its bases'.")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup size="small" exclusive value={what} onChange={(_, v) => v && setWhat(v)}>
          <ToggleButton value="dish">{L("వంటకాలు", "Dishes")}</ToggleButton>
          <ToggleButton value="grocery">{L("సరుకులు", "Grocery items")}</ToggleButton>
        </ToggleButtonGroup>
        <TextField size="small" label={L("వెతకండి", "Search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Chip label={`${L("గుర్తించనివి మాత్రమే", "Only not tagged")} (${untagged})`} color={onlyUntagged ? "primary" : "default"} onClick={() => setOnlyUntagged((v) => !v)} />
      </Box>
      {allergens.length === 0 && <Alert severity="info">{L("ముందు అలర్జీల జాబితా రాయండి — లేకపోతే శాకాహారం / మాంసాహారం మాత్రమే గుర్తించగలరు.", "Write the allergen list first — until then only veg / non-veg can be tagged.")}</Alert>}
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{L("పేరు", "Name")}</TableCell>
              <TableCell>{L("రకం", "Type")}</TableCell>
              <TableCell>{L("అలర్జీలు (నొక్కి ఎంచుకోండి)", "Allergens (tap to choose)")}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(0, 60).map((r) => (
              <TagRow key={`${what}-${r.id}`} kind={what} id={r.id} name={r.name} food={r.food} allergens={allergens} />
            ))}
          </TableBody>
        </Table>
      </Box>
      {rows.length > 60 && <Typography variant="caption" color="text.secondary">{L(`మొదటి 60 మాత్రమే చూపుతున్నాం (${rows.length} లో). వెతికి తగ్గించండి.`, `Showing the first 60 of ${rows.length}. Search to narrow.`)}</Typography>}
      {rows.length === 0 && <Typography variant="body2" color="text.secondary">{L("ఏమీ లేవు.", "Nothing here.")}</Typography>}
    </Paper>
  );
}

const typeLabel = (t: string, L: (te: string, en: string) => string) => (t === "veg" ? L("శాకాహారం", "Veg") : t === "nonveg" ? L("మాంసాహారం", "Non-veg") : L("తెలియదు", "Not known"));

/** Owner / manager: the allergen matrix of one event. */
function Matrix() {
  const { L, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingId, setBookingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [m, setM] = useState<AllergenMatrix | null>(null);
  useEffect(() => subscribeBookings(currentBranchId, setBookings, () => setBookings([])), [currentBranchId]);
  const choices = bookings.filter((b) => !b.cancelled).slice(0, 150);
  const show = async () => {
    setBusy(true);
    setError(null);
    setM(null);
    try {
      setM(await allergenMatrix({ bookingId }));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const problems = m ? m.rows.reduce((a, r) => a + r.problems.length, 0) + m.menuOnly.reduce((a, r) => a + r.problems.length, 0) : 0;
  return (
    <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {L("కార్యక్రమం అలర్జీ పట్టిక", "Allergen matrix of an event")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label={L("బుకింగ్", "Booking")} value={bookingId} onChange={(e) => setBookingId(e.target.value)} sx={{ minWidth: 280 }}>
          {choices.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.customerNameSnapshot} · {b.eventDate ? formatDate(b.eventDate, lang) : "—"} · {b.guestCount}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" disabled={!bookingId || busy} onClick={() => void show()}>
          {busy ? <CircularProgress size={18} color="inherit" /> : L("పట్టిక చూపించు", "Show matrix")}
        </Button>
        {m && (
          <Button onClick={() => window.print()}>{L("ప్రింట్", "Print")}</Button>
        )}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {m && (
        <>
          {m.vegOnlyBrand && <Alert severity="info">{L(`"${m.vegOnlyBrand}" శాకాహారం మాత్రమే బ్రాండ్ — మాంసాహారం ఉండకూడదు.`, `"${m.vegOnlyBrand}" is a veg-only brand — no non-veg allowed.`)}</Alert>}
          {problems > 0 ? <Alert severity="warning">{L(`${problems} విషయాలు చూడాలి (కింద ఎరుపు / పసుపు వరుసలు).`, `${problems} things need attention (rows below).`)}</Alert> : m.rows.length + m.menuOnly.length > 0 && <Alert severity="success">{L("అన్నీ గుర్తించారు, తేడాలు లేవు.", "Everything is tagged and nothing conflicts.")}</Alert>}
          {m.allergens.length === 0 && <Alert severity="info">{L("అలర్జీల జాబితా ఇంకా రాయలేదు — శాకాహారం / మాంసాహారం మాత్రమే చూపుతున్నాం.", "No allergen list yet — only veg / non-veg is shown.")}</Alert>}
          {m.rows.length + m.menuOnly.length === 0 ? (
            <Alert severity="info">{L("ఈ బుకింగ్‌కు వంటకాలు దొరకలేదు (కొటేషన్ / ప్యాకేజీ / మెనూ ఐటమ్స్ లేవు).", "No dishes found for this booking (no quotation / package / menu items).")}</Alert>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{L("వంటకం", "Dish")}</TableCell>
                    <TableCell>{L("రకం", "Type")}</TableCell>
                    {m.allergens.map((a) => (
                      <TableCell key={a.id} align="center">
                        {L(a.te, a.en)}
                      </TableCell>
                    ))}
                    <TableCell>{L("చూడాల్సినవి", "Needs attention")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {m.rows.map((r) => (
                    <TableRow key={r.dishId} sx={r.problems.some((p) => p.code === "mislabelled" || p.code === "vegOnlyBrand") ? { bgcolor: "error.50" } : undefined}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <Chip size="small" color={r.foodType === "veg" ? "success" : r.foodType === "nonveg" ? "error" : "warning"} label={typeLabel(r.foodType, L)} />
                      </TableCell>
                      {m.allergens.map((a) => (
                        <TableCell key={a.id} align="center">
                          {r.allergens[a.id] ? (
                            <Tooltip title={r.allergens[a.id].join(", ")}>
                              <Chip size="small" color="error" label="✓" />
                            </Tooltip>
                          ) : r.untaggedParts.length || r.problems.some((p) => p.code === "untagged") ? (
                            "?"
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        {r.problems.map((p) => (
                          <Typography key={p.code} variant="caption" color={p.code === "mislabelled" || p.code === "vegOnlyBrand" ? "error" : "warning.main"} sx={{ display: "block" }}>
                            {L(p.te, p.en)}
                          </Typography>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {m.menuOnly.map((r) => (
                    <TableRow key={`menu-${r.name}`}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <Chip size="small" color={r.foodType === "veg" ? "success" : "error"} label={typeLabel(r.foodType, L)} />
                      </TableCell>
                      {m.allergens.map((a) => (
                        <TableCell key={a.id} align="center">
                          ?
                        </TableCell>
                      ))}
                      <TableCell>
                        {r.problems.map((p) => (
                          <Typography key={p.code} variant="caption" color={p.code === "vegOnlyBrand" ? "error" : "warning.main"} sx={{ display: "block" }}>
                            {L(p.te, p.en)}
                          </Typography>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            {L("✓ = ఉంది (దానిపై ఉంచితే ఎక్కడి నుంచి వచ్చిందో కనిపిస్తుంది) · — = లేదు · ? = గుర్తులు పూర్తిగా లేవు, తెలియదు", "✓ = present (hover to see where from) · — = not present · ? = not fully tagged, not known")}
          </Typography>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, display: "grid", gap: 0.5 }}>
            <Typography variant="subtitle2">{L("శాకాహారం, మాంసాహారం వేరు వేరు వంటశాలల్లో", "Veg and non-veg cooked apart")}</Typography>
            <Typography variant="body2">
              {L("శాకాహారం", "Veg")} ({m.kitchenSplit.veg.dishes.length}): {m.kitchenSplit.veg.dishes.join(", ") || "—"} → {m.kitchenSplit.veg.kitchens.join(", ") || "—"}
            </Typography>
            <Typography variant="body2">
              {L("మాంసాహారం", "Non-veg")} ({m.kitchenSplit.nonveg.dishes.length}): {m.kitchenSplit.nonveg.dishes.join(", ") || "—"} → {m.kitchenSplit.nonveg.kitchens.join(", ") || "—"}
            </Typography>
            {m.kitchenSplit.unknown.length > 0 && (
              <Typography variant="body2" color="warning.main">
                {L("గుర్తులు తెలియనివి (ముందు గుర్తించండి)", "Not known yet (tag these first)")}: {m.kitchenSplit.unknown.join(", ")}
              </Typography>
            )}
            {m.kitchenSplit.warnings.map((w, i) => (
              <Alert key={i} severity="warning">
                {L(w.te, w.en)}
              </Alert>
            ))}
          </Box>
          {m.customerAllergyNote && (
            <Alert severity="warning">
              {L("కస్టమర్ అలెర్జీ నోట్", "Customer's allergy note")}: {m.customerAllergyNote}
            </Alert>
          )}
          {m.specialMeals.length > 0 && (
            <Alert severity="warning">
              {L("అలర్జీ ప్రత్యేక భోజనాలు", "Allergy special meals")}: {m.specialMeals.map((s) => `${s.session ? `${s.session}: ` : ""}${s.count}${s.note ? ` (${s.note})` : ""}`).join(" · ")}
            </Alert>
          )}
        </>
      )}
    </Paper>
  );
}

/** Module 5h — allergen matrix and veg / non-veg separation (spec §44). */
export function AllergenPanel({ allergens, isOwner }: { allergens: Allergen[]; isOwner: boolean }) {
  return (
    <Box sx={{ display: "grid", gap: 2, maxWidth: 1100 }}>
      <Matrix />
      <Tagging allergens={allergens} />
      {isOwner && <AllergenListEditor initial={allergens} />}
    </Box>
  );
}
