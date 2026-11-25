import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, MenuItem, Paper, Switch, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloseIcon from "@mui/icons-material/Close";
import { useLang } from "../../i18n/LanguageContext";
import {
  BAND_LABEL,
  CATEGORY_LABEL,
  COMBO_KEYS,
  DISH_CATEGORIES,
  DISH_ROLES,
  DISH_UNITS,
  ROLE_LABEL,
  SERVICE_STYLES,
  SIZE_BANDS,
  STYLE_LABEL,
  comboLabel,
  learnBadge,
  roleOfCategory,
  saveDish,
  startRuleProblems,
  subRecipeLoop,
  subscribeDish,
  subscribeDishes,
  type Dish,
  type DishCategory,
  type DishRole,
  type ServiceStyle,
  type SizeBand,
  type StartRule,
  type TypedLine,
} from "../../data/dishRepository";
import { subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";
import { subscribeMenuPackages, type MenuPackage } from "../../data/menuPackageRepository";
import { errorText } from "../../data/functions";
import { DataTable } from "../../components/DataTable";
import { CancelButton } from "../../components/CancelControls";
import { LearnChip, qtyText } from "../kitchen/PlanViews";
import { RecipeVersionsPanel } from "./RecipeVersionsPanel";

let k = 1;
interface TypedRow extends TypedLine {
  key: number;
  text: string;
}
interface VariantRow {
  key: number;
  id: string;
  nameTe: string;
  nameEn: string;
  pieces: string;
  typed: TypedRow[];
}
interface RuleRow {
  key: number;
  style: string;
  comboKey: string;
  band: string;
  kind: "per100" | "pct";
  value: string;
}

const toTypedRows = (t: TypedLine[]): TypedRow[] => t.map((x) => ({ ...x, key: k++, text: String(x.perUnit) }));
const fromTypedRows = (t: TypedRow[]): TypedLine[] =>
  t.filter((x) => x.groceryItemId && Number(x.text) >= 0 && x.text.trim() !== "").map((x) => ({ groceryItemId: x.groceryItemId, perUnit: Number(x.text) }));

function TypedRecipeEditor({ rows, onChange, master, unit }: { rows: TypedRow[]; onChange: (r: TypedRow[]) => void; master: GroceryItem[]; unit: string }) {
  const { L, lang } = useLang();
  return (
    <Box>
      {rows.map((r) => {
        const m = master.find((x) => x.id === r.groceryItemId);
        return (
          <Box key={r.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: "2fr 1fr auto", alignItems: "center", mt: 0.75 }}>
            <Autocomplete
              options={master}
              value={m ?? null}
              onChange={(_e, v) => onChange(rows.map((x) => (x.key === r.key ? { ...x, groceryItemId: v?.id ?? "" } : x)))}
              getOptionLabel={(x) => (lang === "te" ? `${x.nameTe} · ${x.nameEn}` : `${x.nameEn} · ${x.nameTe}`)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} size="small" label={L("సరుకు", "Item")} />}
            />
            <TextField
              size="small"
              label={L(`1 ${unit} కి ${m?.unit ?? ""}`, `${m?.unit ?? ""} per 1 ${unit}`)}
              value={r.text}
              onChange={(e) => onChange(rows.map((x) => (x.key === r.key ? { ...x, text: e.target.value } : x)))}
            />
            <IconButton size="small" aria-label={L("తీసేయి", "Remove")} onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      })}
      <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...rows, { key: k++, groceryItemId: "", perUnit: 0, text: "" }])}>
        {L("సరుకు", "Item")}
      </Button>
    </Box>
  );
}

/** Round 8 dish page: owner fields, variants, typed starting recipe, starting rules; learned numbers read-only. */
export function DishPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { L, T, lang } = useLang();
  const [dish, setDish] = useState<Dish | null | undefined>(isNew ? null : undefined);
  const [master, setMaster] = useState<GroceryItem[]>([]);
  const [menus, setMenus] = useState<MenuPackage[]>([]);
  const [nameTe, setNameTe] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [unit, setUnit] = useState("kg");
  const [category, setCategory] = useState<DishCategory>("curry");
  const [role, setRole] = useState<DishRole>("side");
  const [roleTouched, setRoleTouched] = useState(false);
  const [base, setBase] = useState("");
  const [typed, setTyped] = useState<TypedRow[]>([]);
  // Module 2e: bases (gravy, masala …)
  const [isSub, setIsSub] = useState(false);
  const [subs, setSubs] = useState<{ key: number; dishId: string; text: string }[]>([]);
  const [allDishes, setAllDishes] = useState<Dish[]>([]);
  useEffect(() => subscribeDishes((d) => setAllDishes(d.filter((x) => !x.cancelled)), () => setAllDishes([])), []);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => subscribeGroceryItems((g) => setMaster(g.filter((x) => !x.cancelled)), () => setMaster([])), []);
  useEffect(() => subscribeMenuPackages(setMenus, () => setMenus([])), []);
  useEffect(() => (isNew || !id ? undefined : subscribeDish(id, setDish, (e) => setError(e.message))), [id, isNew]);

  // Fill the form once from the stored dish (live `learned` keeps updating below).
  useEffect(() => {
    if (!dish || loadedOnce) return;
    setLoadedOnce(true);
    setNameTe(dish.nameTe);
    setNameEn(dish.nameEn);
    setUnit(dish.unit);
    setCategory(dish.category);
    setRole(dish.role);
    setRoleTouched(true);
    setBase(dish.basePer100 !== null ? String(dish.basePer100) : "");
    setTyped(toTypedRows(dish.typedRecipe));
    setIsSub(dish.isSubRecipe);
    setSubs(dish.subRecipes.map((l) => ({ key: k++, dishId: l.dishId, text: String(l.perUnit) })));
    setVariants(dish.variants.map((v) => ({ key: k++, id: v.id, nameTe: v.nameTe, nameEn: v.nameEn, pieces: v.piecesPerPlate ? String(v.piecesPerPlate) : "", typed: toTypedRows(v.typedRecipe) })));
    setRules(
      dish.startRules.map((r) => ({
        key: k++,
        style: r.style ?? "",
        comboKey: r.comboKey ?? "",
        band: r.band ?? "",
        kind: typeof r.factorPct === "number" ? "pct" : "per100",
        value: String(typeof r.factorPct === "number" ? r.factorPct : r.per100 ?? ""),
      })),
    );
  }, [dish, loadedOnce]);

  const startRules: StartRule[] = rules.map((r) => {
    const o: StartRule = {};
    if (r.style) o.style = r.style;
    if (r.comboKey) o.comboKey = r.comboKey;
    if (r.band) o.band = r.band;
    const v = Number(r.value);
    if (r.value.trim() !== "" && Number.isFinite(v)) {
      if (r.kind === "pct") o.factorPct = v;
      else o.per100 = v;
    }
    return o;
  });
  const ruleErrors = startRuleProblems(startRules, L);
  const baseNum = base.trim() === "" ? null : Number(base);
  const problems = [
    ...(!nameTe.trim() && !nameEn.trim() ? [L("పేరు రాయండి.", "Enter a name.")] : []),
    ...(baseNum !== null && !(baseNum >= 0) ? [L("100 మందికి అంచనా 0 లేదా ఎక్కువ.", "Per-100 guess must be 0 or more.")] : []),
    ...variants.filter((v) => !v.nameTe.trim() && !v.nameEn.trim()).map(() => L("ప్రతి రకానికి పేరు రాయండి.", "Name every variant.")),
    ...ruleErrors,
  ];

  const linkedMenus = useMemo(() => {
    if (!id || isNew) return [];
    const out: { pkg: string; option: string }[] = [];
    for (const m of menus)
      for (const g of m.groups)
        for (const o of g) if (o.dishId === id) out.push({ pkg: lang === "te" ? m.nameTe || m.nameEn : m.nameEn || m.nameTe, option: lang === "te" ? o.te || o.en : o.en || o.te });
    return out;
  }, [menus, id, isNew, lang]);

  const subLines = subs.filter((x) => x.dishId && x.text.trim() !== "" && Number(x.text) > 0).map((x) => ({ dishId: x.dishId, perUnit: Number(x.text) }));
  const dishLabel = (d: Dish | undefined) => (d ? (lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe) : "");
  const baseChoices = allDishes.filter((d) => d.isSubRecipe && d.id !== id);

  const save = async () => {
    const loop = subRecipeLoop(isNew ? "" : id ?? "", subLines, allDishes);
    if (loop) {
      const name = dishLabel(allDishes.find((d) => d.id === loop));
      setError(L(`"${name}" లో ఈ వంటకమే ఉంది. ఒకదానిలో ఒకటి పెట్టలేము.`, `"${name}" already contains this dish. Two recipes cannot contain each other.`));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const savedId = await saveDish({
        ...(isNew ? {} : { id }),
        nameTe: nameTe.trim(),
        nameEn: nameEn.trim(),
        unit,
        category,
        role,
        basePer100: baseNum,
        typedRecipe: fromTypedRows(typed),
        isSubRecipe: isSub,
        subRecipes: subLines,
        variants: variants.map((v) => ({
          id: v.id,
          nameTe: v.nameTe.trim(),
          nameEn: v.nameEn.trim(),
          piecesPerPlate: v.pieces.trim() && Number(v.pieces) > 0 ? Number(v.pieces) : null,
          typedRecipe: fromTypedRows(v.typed),
        })),
        startRules,
      });
      if (isNew) navigate(`/dishes/${savedId}`, { replace: true });
      else setNotice(L("సేవ్ అయింది.", "Saved."));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  if (dish === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const learned = dish?.learned ?? null;
  const badge = learnBadge(learned?.eventsUsed ?? 0);
  const gname = (gid: string) => {
    const g = master.find((x) => x.id === gid);
    return g ? (lang === "te" ? g.nameTe || g.nameEn : g.nameEn || g.nameTe) : gid;
  };
  const gunit = (gid: string) => master.find((x) => x.id === gid)?.unit ?? "";
  const pctText = (f: number) => `${f >= 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}%`;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/dishes")} sx={{ mb: 1 }}>
        {L("వంటకాలు", "Dishes")}
      </Button>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {isNew ? L("కొత్త వంటకం", "New dish") : nameTe || nameEn}
        </Typography>
        {!isNew && dish && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <LearnChip {...badge} />
            {!dish.cancelled && <CancelButton variant="button" collection="dishes" id={dish.id} what={dish.nameTe || dish.nameEn} onDone={() => navigate("/dishes")} />}
          </Box>
        )}
      </Box>
      {!isNew && !dish && <Alert severity="warning">{L("వంటకం దొరకలేదు.", "Dish not found.")}</Alert>}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      {!isNew && dish && <RecipeVersionsPanel dishId={dish.id} master={master} />}

      {/* ---------------- learned (read-only) ---------------- */}
      {!isNew && dish && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("CRM నేర్చుకున్నది (మార్చలేరు)", "What the CRM learned (read-only)")}
          </Typography>
          {!learned || learned.eventsUsed === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {L(
                "ఇంకా events నుండి నేర్చుకోలేదు. బుకింగ్ పేజీలో \"వంట నమోదు\" చేస్తే ఇక్కడ లెక్కలు వస్తాయి. అప్పటి వరకు కింద మీ అంచనా / నియమాలు వాడతాం.",
                "Nothing learned from events yet. Log cooking on the booking page and numbers appear here. Until then your guess / rules below are used.",
              )}
            </Typography>
          ) : (
            <>
              <Typography sx={{ mb: 1 }}>
                {L("100 మందికి సగటు", "Average per 100")}: <b>{qtyText(learned.per100)} {dish.unit}</b> · {L(`${learned.eventsUsed} events`, `${learned.eventsUsed} events`)}
              </Typography>
              <DataTable
                rows={[...SIZE_BANDS]}
                rowKey={(b) => b}
                columns={[
                  { label: L("Event సైజు", "Event size"), render: (b) => T(BAND_LABEL[b]) },
                  {
                    label: L("100 మందికి", "Per 100"),
                    align: "right",
                    render: (b) => (learned.byBand[b]?.per100 !== null && learned.byBand[b]?.per100 !== undefined ? `${qtyText(learned.byBand[b]?.per100)} ${dish.unit}` : "—"),
                  },
                  { label: L("events", "Events"), align: "right", render: (b) => learned.byBand[b]?.events ?? 0 },
                ]}
              />
              {[learned.factors.style, learned.factors.combo, learned.factors.band].some((m) => Object.values(m).some((f) => Math.abs(f - 1) >= 0.005)) && (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
                  {Object.entries(learned.factors.style).filter(([, f]) => Math.abs(f - 1) >= 0.005).map(([s, f]) => (
                    <Chip key={`s${s}`} size="small" label={`${STYLE_LABEL[s as ServiceStyle] ? T(STYLE_LABEL[s as ServiceStyle]) : s}: ${pctText(f)}`} />
                  ))}
                  {Object.entries(learned.factors.combo).filter(([, f]) => Math.abs(f - 1) >= 0.005).map(([c, f]) => (
                    <Chip key={`c${c}`} size="small" label={`${comboLabel(c, lang)}: ${pctText(f)}`} />
                  ))}
                  {Object.entries(learned.factors.band).filter(([, f]) => Math.abs(f - 1) >= 0.005).map(([b, f]) => (
                    <Chip key={`b${b}`} size="small" label={`${BAND_LABEL[b as SizeBand] ? T(BAND_LABEL[b as SizeBand]) : b}: ${pctText(f)}`} />
                  ))}
                </Box>
              )}
              {dish.recipe.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2">{L(`1 ${dish.unit} వండటానికి సరుకులు (నేర్చుకున్నవి)`, `Ingredients per 1 ${dish.unit} (learned)`)}</Typography>
                  {dish.recipe.map((r) => (
                    <Typography key={r.groceryItemId} variant="body2">
                      {gname(r.groceryItemId)}: {qtyText(r.perUnit)} {gunit(r.groceryItemId)} ({L(`${r.eventsUsed} events`, `${r.eventsUsed} events`)})
                    </Typography>
                  ))}
                </Box>
              )}
            </>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {linkedMenus.length
              ? `${L("మెనూల్లో", "In menus")}: ${linkedMenus.map((m) => `${m.pkg} (${m.option})`).join(", ")}`
              : L("ఏ మెనూకీ జత చేయలేదు — \"మెనూ ప్యాకేజీలు\" పేజీలో ఐటమ్ పక్కన 🔗 నొక్కి జత చేయండి.", "Not linked to any menu yet — use 🔗 next to an item on the Menu packages page.")}
          </Typography>
        </Paper>
      )}

      {/* ---------------- owner fields ---------------- */}
      <Paper sx={{ p: 2, mb: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField size="small" label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={nameTe} onChange={(e) => setNameTe(e.target.value)} />
        <TextField size="small" label={L("పేరు (English)", "Name (English)")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <TextField
          select
          size="small"
          label={L("రకం", "Category")}
          value={category}
          onChange={(e) => {
            const c = e.target.value as DishCategory;
            setCategory(c);
            if (!roleTouched) setRole(roleOfCategory(c));
          }}
        >
          {DISH_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {T(CATEGORY_LABEL[c])}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={L("మెనూలో పాత్ర", "Role on the menu")}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as DishRole);
            setRoleTouched(true);
          }}
          helperText={L("పులిహోర, బిర్యానీ, పులావ్ = రుచి అన్నం", "Pulihora, biryani, pulao = flavoured rice")}
        >
          {DISH_ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {T(ROLE_LABEL[r])}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={L("యూనిట్", "Unit")} value={unit} onChange={(e) => setUnit(e.target.value)}>
          {DISH_UNITS.map((u) => (
            <MenuItem key={u} value={u}>
              {u}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label={L(`100 మందికి మీ మొదటి అంచనా (${unit})`, `Your first guess per 100 guests (${unit})`)}
          value={base}
          onChange={(e) => setBase(e.target.value)}
          helperText={L("events నుండి నేర్చుకునే వరకు ఇదే వాడతాం", "Used until the CRM learns from events")}
        />
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {L("రకాలు (ఉదా: పుల్కా – చిన్నవి 3, పెద్దవి 2)", "Variants (e.g. pulka – small 3, big 2)")}
        </Typography>
        {variants.map((v) => (
          <Paper key={v.key} variant="outlined" sx={{ p: 1.5, mt: 1 }}>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "2fr 2fr 1fr auto" }, alignItems: "center" }}>
              <TextField size="small" label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={v.nameTe} onChange={(e) => setVariants((vs) => vs.map((x) => (x.key === v.key ? { ...x, nameTe: e.target.value } : x)))} />
              <TextField size="small" label={L("పేరు (English)", "Name (English)")} value={v.nameEn} onChange={(e) => setVariants((vs) => vs.map((x) => (x.key === v.key ? { ...x, nameEn: e.target.value } : x)))} />
              <TextField
                size="small"
                label={L("ఒక్కొక్కరికి ఎన్ని", "Pieces per plate")}
                value={v.pieces}
                onChange={(e) => setVariants((vs) => vs.map((x) => (x.key === v.key ? { ...x, pieces: e.target.value } : x)))}
              />
              <IconButton aria-label={L("తీసేయి", "Remove")} onClick={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}>
                <CloseIcon />
              </IconButton>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {L("ఈ రకానికి వేరే సరుకుల లెక్క (ఐచ్ఛికం)", "Separate starting recipe for this variant (optional)")}
            </Typography>
            <TypedRecipeEditor rows={v.typed} onChange={(t) => setVariants((vs) => vs.map((x) => (x.key === v.key ? { ...x, typed: t } : x)))} master={master} unit={unit} />
          </Paper>
        ))}
        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ mt: 1 }}
          onClick={() => setVariants((vs) => [...vs, { key: k++, id: `v${Date.now().toString(36)}`, nameTe: "", nameEn: "", pieces: "", typed: [] }])}
        >
          {L("రకం", "Variant")}
        </Button>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {L(`మొదటి సరుకుల లెక్క — 1 ${unit} వండటానికి`, `Starting recipe — for 1 ${unit} of the dish`)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {L("3 events నమోదు అయ్యే వరకు ఇది కలిపి వాడతాం; తర్వాత మీ నిజమైన వాడకం నుండి నేర్చుకుంటాం.", "Blended in until 3 events are logged; after that the CRM uses what you really used.")}
        </Typography>
        <TypedRecipeEditor rows={typed} onChange={setTyped} master={master} unit={unit} />
      </Paper>

      {/* ---------------- Module 2e: bases ---------------- */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {L("బేస్ తయారీలు (గ్రేవీ, మసాలా…)", "Base preparations (gravy, masala…)")}
        </Typography>
        <FormControlLabel
          control={<Switch checked={isSub} onChange={(e) => setIsSub(e.target.checked)} />}
          label={L("ఈ వంటకమే ఒక బేస్ (వేరే వంటకాల లోపల వాడతాం)", "This dish is itself a base (used inside other dishes)")}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {L(
            `1 ${unit} వండటానికి ఏ బేస్ ఎంత కావాలో రాయండి. బేస్ లోని సరుకులు కొనాల్సిన జాబితాలో, ప్లేటు ఖర్చులో వాటంతట అవే కలుస్తాయి.`,
            `Enter how much of each base goes into 1 ${unit} of this dish. The groceries inside the base are added to the buying list and the plate cost automatically.`,
          )}
        </Typography>
        {subs.map((r) => {
          const b = allDishes.find((d) => d.id === r.dishId);
          return (
            <Box key={r.key} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1, flexWrap: "wrap" }}>
              <Autocomplete
                size="small"
                sx={{ minWidth: 240, flex: 1 }}
                options={baseChoices.filter((d) => d.id === r.dishId || !subs.some((x) => x.dishId === d.id))}
                getOptionLabel={(d) => dishLabel(d)}
                isOptionEqualToValue={(a, c) => a.id === c.id}
                value={b ?? null}
                onChange={(_e, v) => setSubs((ss) => ss.map((x) => (x.key === r.key ? { ...x, dishId: v?.id ?? "" } : x)))}
                renderInput={(p) => <TextField {...p} label={L("బేస్", "Base")} />}
              />
              <TextField
                size="small"
                sx={{ width: 170 }}
                label={L(`ఎంత (${b?.unit ?? "kg"}) / 1 ${unit}`, `How much (${b?.unit ?? "kg"}) per 1 ${unit}`)}
                value={r.text}
                onChange={(e) => setSubs((ss) => ss.map((x) => (x.key === r.key ? { ...x, text: e.target.value } : x)))}
              />
              <IconButton size="small" aria-label={L("తీసేయి", "Remove")} onClick={() => setSubs((ss) => ss.filter((x) => x.key !== r.key))}>
                <CloseIcon />
              </IconButton>
            </Box>
          );
        })}
        {baseChoices.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {L("ఇంకా బేస్‌లు లేవు. గ్రేవీ లాంటి దాన్ని కొత్త వంటకంగా చేర్చి, పై స్విచ్ ఆన్ చేయండి.", "No bases yet. Add something like a gravy as a new dish and turn on the switch above.")}
          </Typography>
        ) : (
          <Button size="small" startIcon={<AddIcon />} disabled={subs.length >= 20} onClick={() => setSubs((ss) => [...ss, { key: k++, dishId: "", text: "" }])}>
            {L("బేస్ చేర్చు", "Add a base")}
          </Button>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {L("మొదటి నియమాలు (ఐచ్ఛికం)", "Starting rules (optional)")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {L(
            "\"100 మందికి\" నియమం: వడ్డన రకం / మెనూ కలయిక (సైజు ఐచ్ఛికం) కి మీ పరిమాణం. \"±%\" నియమం: ఒక్క విషయం మాత్రమే (ఉదా: బఫే +10%, లేదా పుల్కా ఉంటే −15%). 2 events వచ్చాక నిజమైన లెక్క దీన్ని మారుస్తుంది.",
            "\"Per 100\" rule: your amount for a service style / menu combination (size optional). \"±%\" rule: exactly one thing (e.g. buffet +10%, or with pulka −15%). After 2 events the real numbers take over.",
          )}
        </Typography>
        {rules.map((r) => (
          <Box key={r.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "1.2fr 1.6fr 1.2fr 1fr 1fr auto" }, alignItems: "center", mt: 1 }}>
            <TextField select size="small" label={L("వడ్డన", "Style")} value={r.style} onChange={(e) => setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, style: e.target.value } : x)))}>
              <MenuItem value="">{L("ఏదైనా", "Any")}</MenuItem>
              {SERVICE_STYLES.map((s) => (
                <MenuItem key={s} value={s}>
                  {T(STYLE_LABEL[s])}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={L("మెనూ కలయిక", "Menu combination")} value={r.comboKey} onChange={(e) => setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, comboKey: e.target.value } : x)))}>
              <MenuItem value="">{L("ఏదైనా", "Any")}</MenuItem>
              {COMBO_KEYS.map((c) => (
                <MenuItem key={c} value={c}>
                  {comboLabel(c, lang)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={L("సైజు", "Size")} value={r.band} onChange={(e) => setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, band: e.target.value } : x)))}>
              <MenuItem value="">{L("ఏదైనా", "Any")}</MenuItem>
              {SIZE_BANDS.map((b) => (
                <MenuItem key={b} value={b}>
                  {T(BAND_LABEL[b])}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label={L("రకం", "Kind")} value={r.kind} onChange={(e) => setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, kind: e.target.value as RuleRow["kind"] } : x)))}>
              <MenuItem value="per100">{L(`100 మందికి (${unit})`, `Per 100 (${unit})`)}</MenuItem>
              <MenuItem value="pct">±%</MenuItem>
            </TextField>
            <TextField size="small" label={r.kind === "pct" ? L("% (ఉదా −15)", "% (e.g. −15)") : unit} value={r.value} onChange={(e) => setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)))} />
            <IconButton aria-label={L("తీసేయి", "Remove")} onClick={() => setRules((rs) => rs.filter((x) => x.key !== r.key))}>
              <CloseIcon />
            </IconButton>
          </Box>
        ))}
        <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1 }} onClick={() => setRules((rs) => [...rs, { key: k++, style: "", comboKey: "", band: "", kind: "per100", value: "" }])}>
          {L("నియమం", "Rule")}
        </Button>
      </Paper>

      {problems.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {problems.join(" ")}
        </Alert>
      )}
      {!(dish?.cancelled) && (
        <Button variant="contained" size="large" onClick={save} disabled={busy || problems.length > 0}>
          {busy ? <CircularProgress size={22} /> : L("సేవ్ చేయి", "Save")}
        </Button>
      )}
    </Box>
  );
}
