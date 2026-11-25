import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useBranch } from "../../session/BranchContext";
import {
  GROCERY_MODULES,
  GROCERY_UNITS,
  groceryNames,
  hasPer100,
  isFixedUnit,
  linkGroceryItem,
  loadGrocerySeed,
  matchesGrocery,
  nameKey,
  saveGroceryItem,
  SEED_GROCERY_COUNT,
  subscribeGroceryItems,
  type GroceryItem,
  type GroceryUnit,
  subscribePackHistory,
  type PackHistoryEntry,
} from "../../data/groceryRepository";
import { subscribeInventory, type InventoryItem } from "../../data/inventoryRepository";
import { subscribeActiveBranches, type Branch } from "../../data/branchRepository";
import { DataTable } from "../../components/DataTable";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { allOf, branchQuery, refreshFromServer } from "../../data/refresh";
import { tokens } from "../../theme/tokens";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";

interface Form {
  id?: string;
  nameTe: string;
  nameEn: string;
  nameRoman: string;
  module: string;
  group: string;
  unit: GroceryUnit;
  per100: string;
  inventoryItemId: string;
  /** Module 2a: pack sizes as typed (unit name + quantity text) and other names, comma separated */
  packs: { unit: string; qty: string }[];
  aliases: string;
  /** Module 2c: usable % as typed ("" = no loss) */
  yieldPct: string;
}

const EMPTY_FORM: Form = {
  nameTe: "",
  nameEn: "",
  nameRoman: "",
  module: GROCERY_MODULES[0]?.id ?? "Kirana",
  group: "",
  unit: "kg",
  per100: "",
  inventoryItemId: "",
  packs: [],
  aliases: "",
  yieldPct: "",
};

function toForm(i: GroceryItem): Form {
  return {
    id: i.id,
    nameTe: i.nameTe,
    nameEn: i.nameEn,
    nameRoman: i.nameRoman,
    module: i.module || EMPTY_FORM.module,
    group: i.group,
    unit: (GROCERY_UNITS as readonly string[]).includes(i.unit) ? (i.unit as GroceryUnit) : "kg",
    per100: i.per100 === null ? "" : String(i.per100),
    inventoryItemId: i.inventoryItemId,
    packs: i.packs.map((p) => ({ unit: p.unit, qty: String(p.qty) })),
    aliases: i.aliases.join(", "),
    yieldPct: i.yieldPct === null ? "" : String(i.yieldPct),
  };
}

/**
 * Admin: "సరుకుల జాబితా" — the grocery master (≈370 items in 7 modules from the purchase catalog).
 * Filter by module / group, search in Telugu, English or Roman spelling, fill the quantity for 100
 * guests, link each item to its stock item (event stock deduction, contract Round 6 A), and load or
 * refresh the master list from data/seed/grocery-items.json without touching owner-edited items.
 */
/** Module 2h: how this item's pack sizes changed over time (newest first). Owner / manager only; empty for others. */
function PackHistory({ itemId }: { itemId: string }) {
  const { L, lang } = useLang();
  const [rows, setRows] = useState<PackHistoryEntry[]>([]);
  useEffect(() => subscribePackHistory(itemId, setRows, () => setRows([])), [itemId]);
  if (rows.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2">{L("ప్యాక్ కొలతల చరిత్ర", "Pack size history")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {L("పాత కొనుగోళ్లు అప్పటి కొలతతోనే ఉంటాయి; మార్పు కొత్త కొనుగోళ్లకే వర్తిస్తుంది.", "Old purchases keep the size they were made with; a change applies to new purchases only.")}
      </Typography>
      {rows.slice(0, 10).map((r) => (
        <Typography key={r.id} variant="body2">
          {r.from ? r.from.toLocaleDateString(dateLocale(lang)) : "—"}: {r.packs.length ? r.packs.map((p) => `1 ${p.unit} = ${p.qty} ${r.unit}`).join(", ") : L("ప్యాక్ కొలతలు తీసేశారు", "pack sizes removed")}
        </Typography>
      ))}
    </Box>
  );
}

export function GroceryLinksPage() {
  const { L, T, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [items, setItems] = useState<GroceryItem[] | null>(null);
  const [stock, setStock] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [group, setGroup] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  useEffect(() => subscribeGroceryItems(setItems, (e) => setError(e.message)), []);
  useEffect(() => subscribeInventory(currentBranchId, setStock), [currentBranchId]);
  useEffect(() => subscribeActiveBranches(setBranches), []);

  const everything = useMemo(() => items ?? [], [items]);
  // Archived items (R7-3) are left out of counts and lists unless "show cancelled" is on.
  const all = useMemo(() => (items ?? []).filter((i) => !i.cancelled), [items]);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "";
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  /** Module 2a: other live items that already carry one of the names typed in the open form (warning only). */
  const formDuplicates = useMemo(() => {
    if (!form) return [];
    const mine = new Set([form.nameTe, form.nameEn, form.nameRoman, ...form.aliases.split(",")].map(nameKey).filter(Boolean));
    if (mine.size === 0) return [];
    return everything.filter((i) => i.id !== form.id && !i.cancelled && groceryNames(i).some((n) => mine.has(nameKey(n)))).slice(0, 5);
  }, [form, everything]);
  const moduleLabel = (id: string) => {
    const m = GROCERY_MODULES.find((x) => x.id === id);
    return m ? T(m) : id || L("ఇతర", "Other");
  };

  const countByModule = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of all) c.set(i.module, (c.get(i.module) ?? 0) + 1);
    return c;
  }, [all]);
  const groups = useMemo(
    () => [...new Set(all.filter((i) => !moduleId || i.module === moduleId).map((i) => i.group).filter(Boolean))],
    [all, moduleId],
  );
  const filtered = useMemo(
    () =>
      (showCancelled ? everything : all).filter(
        (i) =>
          (!moduleId || i.module === moduleId) &&
          (!group || i.group === group) &&
          (!onlyMissing || !hasPer100(i)) &&
          matchesGrocery(i, search),
      ),
    [all, everything, showCancelled, moduleId, group, onlyMissing, search],
  );
  const withPer100 = all.filter(hasPer100).length;
  const linked = all.filter((i) => i.inventoryItemId).length;

  async function link(id: string, inventoryItemId: string) {
    setSavingId(id);
    setError(null);
    try {
      await linkGroceryItem(id, inventoryItemId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function saveForm() {
    if (!form) return;
    setFormError(null);
    const t = form.per100.trim();
    const per100 = t === "" ? null : Number(t);
    if (!form.nameTe.trim() && !form.nameEn.trim()) {
      setFormError(L("పేరు (తెలుగు లేదా English) ఇవ్వండి.", "Enter a name (Telugu or English)."));
      return;
    }
    if (per100 !== null && (!Number.isFinite(per100) || per100 < 0)) {
      setFormError(L("100 మందికి పరిమాణం 0 లేదా ఎక్కువ (లేదా ఖాళీ).", "Per-100 quantity must be 0 or more (or empty)."));
      return;
    }
    // Module 2a: pack sizes — every row needs a name that is not kg / g / L / ml / pcs / dozen and a quantity above 0
    const packs: { unit: string; qty: number }[] = [];
    const seenPack = new Set<string>();
    for (const row of form.packs) {
      const unit = row.unit.trim();
      const qty = Number(row.qty.trim());
      if (!unit && row.qty.trim() === "") continue;
      if (!unit || unit.length > 30 || !Number.isFinite(qty) || qty <= 0) {
        setFormError(L("ప్రతి ప్యాక్ కి పేరు (ఉదా: Bag) మరియు 0 కంటే ఎక్కువ పరిమాణం ఇవ్వండి.", "Each pack needs a name (e.g. Bag) and a quantity above 0."));
        return;
      }
      if (isFixedUnit(unit)) {
        setFormError(L(`"${unit}" కి ఇప్పటికే స్థిరమైన అర్థం ఉంది. ప్యాక్ పేరుగా Bag, Tin, Packet, Box లాంటివి వాడండి.`, `"${unit}" already has a fixed meaning. Use a pack name such as Bag, Tin, Packet or Box.`));
        return;
      }
      if (seenPack.has(unit.toLowerCase())) {
        setFormError(L(`"${unit}" ప్యాక్ రెండుసార్లు ఉంది.`, `Pack "${unit}" is listed twice.`));
        return;
      }
      seenPack.add(unit.toLowerCase());
      packs.push({ unit, qty });
    }
    const aliases = [...new Map(form.aliases.split(",").map((a) => a.trim()).filter((a) => nameKey(a) !== "").map((a) => [nameKey(a), a.slice(0, 100)] as const)).values()].slice(0, 20);
    const yt = form.yieldPct.trim();
    const yieldPct = yt === "" ? null : Number(yt);
    if (yieldPct !== null && (!Number.isFinite(yieldPct) || yieldPct < 10 || yieldPct > 100)) {
      setFormError(L("వాడకానికి వచ్చే శాతం 10 నుండి 100 మధ్య ఉండాలి (లేదా ఖాళీ).", "Usable % must be from 10 to 100 (or empty)."));
      return;
    }
    setFormSaving(true);
    try {
      await saveGroceryItem({ ...form, per100, packs, aliases, yieldPct: yieldPct === 100 ? null : yieldPct });
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setFormSaving(false);
    }
  }

  async function runLoad() {
    setLoading(true);
    setError(null);
    try {
      const r = await loadGrocerySeed(everything);
      setNotice(
        L(
          `జాబితా load అయింది: ${r.created} కొత్తవి, ${r.updated} నవీకరించాం, ${r.kept} మీరు మార్చినవి అలాగే ఉంచాం.`,
          `List loaded: ${r.created} new, ${r.updated} refreshed, ${r.kept} edited by you left as they are.`,
        ),
      );
      setConfirmLoad(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const stockSelect = (value: string, onChange: (v: string) => void, disabled?: boolean, fullWidth?: boolean) => (
    <TextField
      select
      size="small"
      fullWidth={fullWidth}
      label={fullWidth ? L("Stock వస్తువు (జత)", "Linked stock item") : undefined}
      value={value && !stockById.has(value) ? "__other" : value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "__other" ? value : e.target.value)}
      sx={fullWidth ? undefined : { minWidth: 200 }}
    >
      <MenuItem value="">
        <em>{L("జత చేయలేదు", "Not linked")}</em>
      </MenuItem>
      {value && !stockById.has(value) && <MenuItem value="__other">{L("వేరే శాఖ వస్తువు", "Item in another branch")}</MenuItem>}
      {stock.map((s) => (
        <MenuItem key={s.id} value={s.id}>
          {s.name} ({s.unit}){!currentBranchId && branchName(s.branchId) ? ` · ${branchName(s.branchId)}` : ""}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <ScreenTitle
        title={L("సరుకుల జాబితా", "Grocery items")}
        subtitle={L(
          `${all.length} సరుకులు · ${withPer100} కి 100 మందికి పరిమాణం ఉంది · ${linked} stock తో జత`,
          `${all.length} items · ${withPer100} have a per-100 quantity · ${linked} linked to stock`,
        )}
        onRefresh={() => refreshFromServer(allOf("groceryItems"), branchQuery("inventory", currentBranchId))}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" startIcon={<CloudDownloadIcon />} onClick={() => setConfirmLoad(true)} disabled={items === null}>
              {L("జాబితా load చేయి", "Load the list")}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ ...EMPTY_FORM, module: moduleId || EMPTY_FORM.module, group })}>
              {L("కొత్త సరుకు", "New item")}
            </Button>
          </Box>
        }
      />
      <ErrorBox message={error} />
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Chip
          clickable
          label={`${L("అన్నీ", "All")} (${all.length})`}
          color={!moduleId ? "primary" : "default"}
          variant={!moduleId ? "filled" : "outlined"}
          onClick={() => {
            setModuleId("");
            setGroup("");
          }}
          sx={{ minHeight: 40 }}
        />
        {GROCERY_MODULES.map((m) => (
          <Chip
            key={m.id}
            clickable
            label={`${T(m)} (${countByModule.get(m.id) ?? 0})`}
            color={moduleId === m.id ? "primary" : "default"}
            variant={moduleId === m.id ? "filled" : "outlined"}
            onClick={() => {
              setModuleId(m.id);
              setGroup("");
            }}
            sx={{ minHeight: 40 }}
          />
        ))}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "2fr 1fr auto" }, alignItems: "center", mb: 2 }}>
        <TextField
          size="small"
          placeholder={L("వెతకండి — తెలుగు, English లేదా Kandi Pappu లాగా", "Search — Telugu, English or e.g. Kandi Pappu")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <TextField select size="small" label={L("గుంపు", "Group")} value={group} onChange={(e) => setGroup(e.target.value)}>
          <MenuItem value="">{L("అన్ని గుంపులు", "All groups")}</MenuItem>
          {groups.map((g) => (
            <MenuItem key={g} value={g}>
              {g}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={<Switch checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />}
          label={L("100 మందికి పెట్టనివి మాత్రమే", "Only without per-100")}
        />
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={everything.length - all.length} />
      </Box>
      {!currentBranchId && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {L("అన్ని శాఖల stock వస్తువులు చూపిస్తున్నాం.", "Showing stock items of all branches.")}
        </Typography>
      )}

      <DataTable
        rows={filtered}
        rowKey={(i) => i.id}
        emptyText={
          items === null
            ? L("లోడ్ అవుతోంది…", "Loading…")
            : all.length === 0
              ? L("జాబితా ఖాళీగా ఉంది — 'జాబితా load చేయి' నొక్కండి.", "The list is empty — press 'Load the list'.")
              : L("ఈ ఎంపికకి సరుకులు లేవు.", "No items match.")
        }
        columns={[
          {
            label: L("సరుకు", "Item"),
            render: (i) => (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {i.cancelled ? (
                  <CancelledChip archived reason={i.cancelReason} />
                ) : (
                  <IconButton size="small" aria-label={L("మార్చు", "Edit")} onClick={() => setForm(toForm(i))}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>{lang === "te" ? i.nameTe || i.nameEn : i.nameEn || i.nameTe}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[lang === "te" ? i.nameEn : i.nameTe, i.nameRoman && i.nameRoman !== i.nameEn ? i.nameRoman : ""].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              </Box>
            ),
          },
          {
            label: L("గుంపు", "Group"),
            hideOnMobile: true,
            render: (i) => (
              <Typography variant="body2">
                {moduleId ? i.group : `${moduleLabel(i.module)} · ${i.group}`}
              </Typography>
            ),
          },
          {
            label: L("100 మందికి", "Per 100 guests"),
            align: "right",
            render: (i) =>
              hasPer100(i) ? (
                <Link component="button" onClick={() => setForm(toForm(i))} underline="hover">
                  {i.per100} {i.unit}
                </Link>
              ) : (
                <Link component="button" onClick={() => setForm(toForm(i))} sx={{ color: tokens.color.warning }}>
                  {L("ఇంకా పెట్టలేదు", "Not set yet")}
                </Link>
              ),
          },
          {
            label: L("Stock వస్తువు", "Stock item"),
            hideOnMobile: true,
            render: (i) => stockSelect(i.inventoryItemId, (v) => link(i.id, v), savingId === i.id),
          },
          {
            label: L("స్థితి", "Status"),
            hideOnMobile: true,
            render: (i) => {
              const s = stockById.get(i.inventoryItemId);
              if (s && s.unit && i.unit && s.unit.toLowerCase() !== i.unit.toLowerCase())
                return <Chip size="small" color="error" label={L(`యూనిట్ తేడా: ${i.unit} / ${s.unit}`, `Unit differs: ${i.unit} / ${s.unit}`)} />;
              if (i.inventoryItemId) return <Chip size="small" color="success" label={L("జత", "Linked")} />;
              return <Chip size="small" variant="outlined" label={L("జత లేదు", "Not linked")} />;
            },
          },
          { label: "", render: (i) => (i.cancelled ? null : <CancelButton collection="groceryItems" id={i.id} what={i.nameTe || i.nameEn} />) },
        ]}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {L(
          "'100 మందికి' పెట్టిన సరుకులు మాత్రమే 'సరుకుల లెక్క' లో వస్తాయి. Stock తో జత చేసినవి event పూర్తయినప్పుడు stock నుండి తగ్గుతాయి.",
          "Only items with a per-100 quantity appear in the grocery list. Linked items are taken out of stock when an event completes.",
        )}
      </Typography>

      <Dialog open={!!form} onClose={() => !formSaving && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? L("సరుకు మార్చు", "Edit grocery item") : L("కొత్త సరుకు", "New grocery item")}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <TextField label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={form.nameTe} onChange={(e) => setForm({ ...form, nameTe: e.target.value })} />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <TextField label={L("పేరు (English)", "Name (English)")} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              <TextField
                label={L("పేరు (Roman, ఉదా: Kandi Pappu)", "Name (Roman, e.g. Kandi Pappu)")}
                value={form.nameRoman}
                onChange={(e) => setForm({ ...form, nameRoman: e.target.value })}
              />
              <TextField select label={L("విభాగం", "Module")} value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })}>
                {GROCERY_MODULES.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {T(m)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label={L("గుంపు", "Group")} value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} />
              <TextField select label={L("యూనిట్", "Unit")} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as GroceryUnit })}>
                {GROCERY_UNITS.map((u) => (
                  <MenuItem key={u} value={u}>
                    {u}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={L("100 మందికి ఎంత", "Per 100 guests")}
                value={form.per100}
                onChange={(e) => setForm({ ...form, per100: e.target.value })}
                inputMode="decimal"
                helperText={form.per100.trim() === "" ? L("ఖాళీ = ఇంకా పెట్టలేదు (లెక్కలో రాదు)", "Empty = not set (left out of the list)") : form.unit}
              />
            </Box>
            {stockSelect(form.inventoryItemId, (v) => setForm({ ...form, inventoryItemId: v }), false, true)}

            <TextField
              label={L("శుభ్రం చేశాక వాడకానికి వచ్చే శాతం (ఐచ్ఛికం)", "Usable % after cleaning (optional)")}
              value={form.yieldPct}
              onChange={(e) => setForm({ ...form, yieldPct: e.target.value })}
              inputMode="decimal"
              helperText={L(
                "ఉదా: ఉల్లిపాయ 85 → 10 kg వాడాలంటే 11.8 kg కొనమని చూపిస్తాం. ఖాళీ = నష్టం లేదు. రెసిపీలో రాసిన కొలత శుభ్రం చేసిన తర్వాతి బరువు అయితేనే పెట్టండి; కొన్న బరువే రాసి ఉంటే ఖాళీగా వదిలేయండి.",
                "e.g. onion 85 → to use 10 kg we show 11.8 kg to buy. Empty = no loss. Fill this only if your recipe quantities are weights after cleaning; if they are weights as bought, leave it empty.",
              )}
            />
            <TextField
              label={L("ఇతర పేర్లు (కామాతో వేరు చేయండి)", "Other names (separate with commas)")}
              value={form.aliases}
              onChange={(e) => setForm({ ...form, aliases: e.target.value })}
              helperText={L("ఉదా: Toor Dal, Arhar, ఎర్ర పప్పు — బిల్లులో ఏ పేరు రాసినా ఇదే సరుకుగా గుర్తిస్తాం.", "e.g. Toor Dal, Arhar — whatever name is on the bill, it is matched to this item.")}
            />
            {formDuplicates.length > 0 && (
              <Alert severity="warning">
                {L("ఇదే పేరుతో ఇప్పటికే సరుకు ఉంది — కొత్తది చేయకుండా దానికే ఈ పేరు 'ఇతర పేర్లు' లో చేర్చండి", "An item with this name already exists — add this name to its other names instead of making a new item")}
                : {formDuplicates.map((d) => d.nameTe || d.nameEn || d.nameRoman).join(", ")}
              </Alert>
            )}

            <Box sx={{ display: "grid", gap: 1 }}>
              <Typography variant="subtitle2">{L("ప్యాక్ కొలతలు (ఈ సరుకుకి మాత్రమే)", "Pack sizes (for this item only)")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {L(
                  `ఉదా: 1 Bag = 25 ${form.unit}. Bag లో కొన్నా stock ${form.unit} లో పెరుగుతుంది, ధర ${form.unit} కి లెక్కవుతుంది.`,
                  `e.g. 1 Bag = 25 ${form.unit}. A purchase in Bags then adds stock in ${form.unit} and gives a rate per ${form.unit}.`,
                )}
              </Typography>
              {form.packs.map((row, idx) => (
                <Box key={idx} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography>1</Typography>
                  <TextField
                    size="small"
                    label={L("ప్యాక్ పేరు", "Pack name")}
                    value={row.unit}
                    onChange={(e) => setForm({ ...form, packs: form.packs.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)) })}
                    sx={{ width: 150 }}
                  />
                  <Typography>=</Typography>
                  <TextField
                    size="small"
                    label={form.unit}
                    value={row.qty}
                    onChange={(e) => setForm({ ...form, packs: form.packs.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)) })}
                    inputMode="decimal"
                    sx={{ width: 120 }}
                  />
                  <Button size="small" sx={{ minHeight: 40 }} onClick={() => setForm({ ...form, packs: form.packs.filter((_, i) => i !== idx) })}>
                    {L("తీసేయి", "Remove")}
                  </Button>
                </Box>
              ))}
              <Box>
                <Button size="small" variant="outlined" sx={{ minHeight: 40 }} onClick={() => setForm({ ...form, packs: [...form.packs, { unit: "", qty: "" }] })} disabled={form.packs.length >= 20}>
                  {L("ప్యాక్ చేర్చు", "Add a pack")}
                </Button>
              </Box>
            </Box>
            {formError && <Alert severity="error">{formError}</Alert>}
          {form?.id ? <PackHistory itemId={form.id} /> : null}
        </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)} disabled={formSaving}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={saveForm} disabled={formSaving}>
            {formSaving ? L("Save అవుతోంది…", "Saving…") : L("Save చేయి", "Save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmLoad} onClose={() => !loading && setConfirmLoad(false)}>
        <DialogTitle>{L("సరుకుల జాబితా load చేయాలా?", "Load the grocery list?")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {L(
              `${SEED_GROCERY_COUNT} సరుకులు (కిరాణా, కాయగూరలు, డిస్పోజబుల్స్, పండ్లు, మాంసాహారం, గ్యాస్, నీళ్లు) చేరుతాయి. మీరు ఇప్పటికే మార్చిన / చేర్చిన సరుకులు, stock లింకులు అలాగే ఉంటాయి.`,
              `This adds ${SEED_GROCERY_COUNT} items (grocery, vegetables, disposables, fruits, non-veg, gas, water). Items you already edited or added, and stock links, stay as they are.`,
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLoad(false)} disabled={loading}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={runLoad} disabled={loading}>
            {loading ? L("Load అవుతోంది…", "Loading…") : L("Load చేయి", "Load")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
