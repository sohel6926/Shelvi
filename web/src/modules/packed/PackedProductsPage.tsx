import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { cancelPackedSale, errorText, recordPacking, savePackedProduct, sellPacked, type PackSaleResult, type PackingResult } from "../../data/functions";
import { useSession } from "../../auth/AuthProvider";
import { subscribeInventory, type InventoryItem } from "../../data/inventoryRepository";
import { GAP_LABEL, NET_UNITS, SALE_METHODS, labelGaps, labelHtml, subscribePackRuns, subscribePackedProducts, subscribePackedSales, type LabelBusiness, type PackRun, type PackedProduct, type PackedSale } from "../../data/packedRepository";
import { useBusinessSettings } from "../../data/settingsRepository";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { formatINR } from "../../util/format";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const num = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(/,/g, "")));

type LabelRun = { batchNo: string; packedDay: string; expiryDay: string; mrp: number; netQty: number; netUnit: string };

/** Opens the label in a small window and asks the browser to print it (`copies` labels on the sheet). */
function printLabels(html: string, copies: number) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false;
  const n = Math.max(1, Math.min(200, copies));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label</title><style>body{margin:8px;display:flex;flex-wrap:wrap;gap:6px}@media print{body{margin:0}}</style></head><body>${Array.from({ length: n }, () => html).join("")}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}

function GapsNote({ p, biz }: { p: Pick<PackedProduct, "nameEn" | "ingredientsText" | "allergensText" | "storageText" | "nutritionText">; biz: LabelBusiness }) {
  const { L, T } = useLang();
  const g = labelGaps(p, biz);
  if (!g.must.length && !g.check.length) return <Alert severity="success">{L("లేబుల్ వివరాలు అన్నీ ఉన్నాయి.", "All label details are filled.")}</Alert>;
  return (
    <>
      {g.must.length > 0 && (
        <Alert severity="warning">
          {L("అమ్మే ముందు ఇవి నింపాలి", "Fill these before selling")}: {g.must.map((k) => T(GAP_LABEL[k])).join(", ")}
        </Alert>
      )}
      {g.check.length > 0 && (
        <Alert severity="info">
          {L("మీ ఫుడ్ లైసెన్స్ సలహాదారుని అడిగి అవసరమైతే నింపండి", "Ask your food licence consultant and fill if needed")}: {g.check.map((k) => T(GAP_LABEL[k])).join(", ")}
        </Alert>
      )}
    </>
  );
}

function LabelDialog({ product, run, biz, onClose }: { product: PackedProduct; run: LabelRun; biz: LabelBusiness; onClose: () => void }) {
  const { L } = useLang();
  const [copies, setCopies] = useState("1");
  const [blocked, setBlocked] = useState(false);
  const html = useMemo(() => labelHtml(product, run, biz), [product, run, biz]);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{L("లేబుల్", "Label")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5 }}>
        {/* built by labelHtml, which escapes every piece of text */}
        <Box sx={{ display: "flex", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: html }} />
        <GapsNote p={product} biz={biz} />
        <TextField size="small" label={L("ఎన్ని లేబుల్స్", "How many labels")} value={copies} onChange={(e) => setCopies(e.target.value)} sx={{ maxWidth: 180 }} />
        {blocked && <Alert severity="error">{L("ప్రింట్ విండో తెరుచుకోలేదు. బ్రౌజర్‌లో pop-up అనుమతించండి.", "The print window did not open. Allow pop-ups in the browser.")}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("మూసివేయి", "Close")}</Button>
        <Button variant="contained" onClick={() => setBlocked(!printLabels(html, Number(copies) || 1))}>
          {L("ప్రింట్", "Print")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ProductDialog({ product, branchId, biz, onClose }: { product: PackedProduct | "new"; branchId: string | null; biz: LabelBusiness; onClose: () => void }) {
  const { L, lang } = useLang();
  const p = product === "new" ? null : product;
  const [nameTe, setNameTe] = useState(p?.nameTe ?? "");
  const [nameEn, setNameEn] = useState(p?.nameEn ?? "");
  const [netQty, setNetQty] = useState(p ? String(p.netQty) : "");
  const [netUnit, setNetUnit] = useState(p?.netUnit ?? "g");
  const [mrp, setMrp] = useState(p ? String(p.mrp) : "");
  const [shelf, setShelf] = useState(p ? String(p.shelfLifeDays) : "");
  const [vegType, setVegType] = useState<"veg" | "nonveg">(p?.vegType ?? "veg");
  const [dateKind, setDateKind] = useState<"bestBefore" | "useBy">(p?.dateKind ?? "bestBefore");
  const [ingredients, setIngredients] = useState(p?.ingredientsText ?? "");
  const [allergens, setAllergens] = useState(p?.allergensText ?? "");
  const [storage, setStorage] = useState(p?.storageText ?? "");
  const [nutrition, setNutrition] = useState(p?.nutritionText ?? "");
  const [active, setActive] = useState(p?.active ?? true);
  const [hsn, setHsn] = useState(p?.hsn ?? "");
  const [gst, setGst] = useState(p ? String(p.gstRate) : "0");
  const [barcode, setBarcode] = useState(p?.barcode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = num(netQty);
  const m = num(mrp);
  const sl = num(shelf);
  const valid = (nameTe.trim() || nameEn.trim()) && q > 0 && m > 0 && Number.isInteger(sl) && sl >= 1 && sl <= 1095;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePackedProduct({
        ...(p ? { id: p.id } : branchId ? { branchId } : {}),
        nameTe: nameTe.trim(),
        nameEn: nameEn.trim(),
        netQty: q,
        netUnit,
        mrp: m,
        shelfLifeDays: sl,
        vegType,
        dateKind,
        ingredientsText: ingredients.trim(),
        allergensText: allergens.trim(),
        storageText: storage.trim(),
        nutritionText: nutrition.trim(),
        dishId: p?.dishId ?? "",
        active,
        hsn: hsn.trim(),
        gstRate: Number(gst) || 0,
        barcode: barcode.trim(),
      });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{p ? L("ఉత్పత్తి మార్చు", "Edit product") : L("కొత్త ప్యాక్ ఉత్పత్తి", "New packed product")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        {error && <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>{error}</Alert>}
        <TextField size="small" label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={nameTe} onChange={(e) => setNameTe(e.target.value)} />
        <TextField size="small" label={L("పేరు (English) — లేబుల్ మీద", "Name (English) — on the label")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" sx={{ flex: 1 }} label={L("నికర పరిమాణం", "Net quantity")} value={netQty} onChange={(e) => setNetQty(e.target.value)} />
          <TextField select size="small" sx={{ width: 90 }} label={L("కొలత", "Unit")} value={netUnit} onChange={(e) => setNetUnit(e.target.value)}>
            {NET_UNITS.map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <TextField size="small" label={L("MRP ₹ (అన్ని పన్నులతో)", "MRP ₹ (incl. all taxes)")} value={mrp} onChange={(e) => setMrp(e.target.value)} />
        <TextField size="small" label={L("ఎన్ని రోజులు నిల్వ ఉంటుంది", "Shelf life in days")} value={shelf} onChange={(e) => setShelf(e.target.value)} helperText={L("ప్యాక్ చేసిన రోజు + ఇన్ని రోజులు = గడువు తేదీ", "Packing day + these days = expiry date")} />
        <TextField select size="small" label={L("లేబుల్ మీద తేదీ", "Date on the label")} value={dateKind} onChange={(e) => setDateKind(e.target.value as "bestBefore" | "useBy")}>
          <MenuItem value="bestBefore">Best before</MenuItem>
          <MenuItem value="useBy">Use by</MenuItem>
        </TextField>
        <TextField select size="small" label={L("శాకాహారం / మాంసాహారం", "Veg / non-veg")} value={vegType} onChange={(e) => setVegType(e.target.value as "veg" | "nonveg")}>
          <MenuItem value="veg">{L("శాకాహారం (ఆకుపచ్చ గుర్తు)", "Veg (green mark)")}</MenuItem>
          <MenuItem value="nonveg">{L("మాంసాహారం (గోధుమ గుర్తు)", "Non-veg (brown mark)")}</MenuItem>
        </TextField>
        <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label={L("అమ్మకంలో ఉంది", "On sale")} />
        <TextField size="small" label={L("HSN కోడ్ (GST ఉంటే)", "HSN code (if GST applies)")} value={hsn} onChange={(e) => setHsn(e.target.value)} />
        <TextField size="small" label={L("GST % (MRP లో కలిసే ఉంటుంది)", "GST % (already inside the MRP)")} value={gst} onChange={(e) => setGst(e.target.value)} />
        <TextField size="small" sx={{ gridColumn: "1 / -1" }} label={L("బార్‌కోడ్ నంబర్ (ఉంటే)", "Barcode number (if any)")} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        <TextField size="small" multiline minRows={2} sx={{ gridColumn: "1 / -1" }} label={L("పదార్థాలు (ఎక్కువ నుండి తక్కువ క్రమంలో, English లో)", "Ingredients (most to least, in English)")} value={ingredients} onChange={(e) => setIngredients(e.target.value)} />
        <TextField size="small" sx={{ gridColumn: "1 / -1" }} label={L("అలెర్జీ సమాచారం (ఉదా: Contains mustard, nuts)", "Allergen information (e.g. Contains mustard, nuts)")} value={allergens} onChange={(e) => setAllergens(e.target.value)} />
        <TextField size="small" sx={{ gridColumn: "1 / -1" }} label={L("నిల్వ చేసే విధానం", "Storage instructions")} value={storage} onChange={(e) => setStorage(e.target.value)} />
        <TextField size="small" multiline minRows={2} sx={{ gridColumn: "1 / -1" }} label={L("పోషక విలువలు (ఉంటే)", "Nutrition information (if any)")} value={nutrition} onChange={(e) => setNutrition(e.target.value)} />
        <Box sx={{ gridColumn: "1 / -1", display: "grid", gap: 1 }}>
          <GapsNote p={{ nameEn, ingredientsText: ingredients, allergensText: allergens, storageText: storage, nutritionText: nutrition }} biz={biz} />
        </Box>
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

function PackDialog({ product, biz, onClose }: { product: PackedProduct; biz: LabelBusiness; onClose: () => void }) {
  const { L, lang } = useLang();
  const [packs, setPacks] = useState("");
  const [day, setDay] = useState(todayIso());
  const [batchNo, setBatchNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PackingResult | null>(null);
  const [runs, setRuns] = useState<PackRun[]>([]);
  const [label, setLabel] = useState<LabelRun | null>(null);
  useEffect(() => subscribePackRuns(product.id, setRuns, () => setRuns([])), [product.id]);

  const n = num(packs);
  const valid = Number.isInteger(n) && n >= 1 && day <= todayIso();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await recordPacking({ productId: product.id, packs: n, packedDay: day, ...(batchNo.trim() ? { batchNo: batchNo.trim() } : {}) });
      setDone(r);
      setPacks("");
      setBatchNo("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        {L("ప్యాకింగ్ నమోదు", "Record packing")} — {L(product.nameTe || product.nameEn, product.nameEn || product.nameTe)} ({product.netQty} {product.netUnit})
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        {done && (
          <Alert
            severity="success"
            action={
              <Button color="inherit" size="small" onClick={() => setLabel({ batchNo: done.batchNo, packedDay: done.packedDay, expiryDay: done.expiryDay, mrp: product.mrp, netQty: product.netQty, netUnit: product.netUnit })}>
                {L("లేబుల్", "Label")}
              </Button>
            }
          >
            {L(`${done.packs} ప్యాక్‌లు నిల్వలో కలిశాయి. బ్యాచ్ ${done.batchNo}, గడువు ${done.expiryDay}. ఇప్పుడు నిల్వ: ${done.newQuantity}`, `${done.packs} packs added to stock. Batch ${done.batchNo}, expiry ${done.expiryDay}. In stock now: ${done.newQuantity}`)}
          </Alert>
        )}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField size="small" autoFocus label={L("ఎన్ని ప్యాక్‌లు", "How many packs")} value={packs} onChange={(e) => setPacks(e.target.value)} sx={{ width: 150 }} />
          <TextField size="small" type="date" label={L("ప్యాక్ చేసిన తేదీ", "Packed on")} value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label={L("బ్యాచ్ నంబర్ (ఖాళీ = ఆటో)", "Batch no. (blank = auto)")} value={batchNo} onChange={(e) => setBatchNo(e.target.value)} sx={{ width: 190 }} />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {L(`గడువు తేదీ దానంతట అదే వస్తుంది: ప్యాక్ చేసిన రోజు + ${product.shelfLifeDays} రోజులు.`, `The expiry date is worked out for you: packing day + ${product.shelfLifeDays} days.`)}
        </Typography>
        {runs.length > 0 && (
          <Box>
            <Typography variant="subtitle2">{L("ఇటీవలి ప్యాకింగ్‌లు", "Recent packing runs")}</Typography>
            {runs.map((r) => (
              <Box key={r.id} sx={{ display: "flex", gap: 1, alignItems: "center", py: 0.25, flexWrap: "wrap" }}>
                <Typography variant="body2" sx={{ minWidth: 220 }}>
                  {r.packedDay} · <b>{r.packs}</b> · #{r.batchNo} · {L("గడువు", "exp")} {r.expiryDay}
                </Typography>
                <Button size="small" onClick={() => setLabel({ batchNo: r.batchNo, packedDay: r.packedDay, expiryDay: r.expiryDay, mrp: r.mrp || product.mrp, netQty: r.netQty || product.netQty, netUnit: r.netUnit || product.netUnit })}>
                  {L("లేబుల్", "Label")}
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("మూసివేయి", "Close")}
        </Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("నిల్వలో కలుపు", "Add to stock")}
        </Button>
      </DialogActions>
      {label && <LabelDialog product={product} run={label} biz={biz} onClose={() => setLabel(null)} />}
    </Dialog>
  );
}

/** X5: sell packs — price per pack (MRP by default, never above it), payment method, optional customer. */
function SellDialog({ product, canSell, onClose }: { product: PackedProduct; canSell: number; onClose: () => void }) {
  const { L, lang } = useLang();
  const [packs, setPacks] = useState("");
  const [price, setPrice] = useState(String(product.mrp));
  const [method, setMethod] = useState<string>("Cash");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PackSaleResult | null>(null);
  const n = num(packs);
  const pr = num(price);
  const overMrp = pr > product.mrp;
  const valid = Number.isInteger(n) && n >= 1 && n <= canSell && pr > 0 && !overMrp && (method !== "Credit" || customer.trim() !== "");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await sellPacked({ productId: product.id, packs: n, pricePerPack: pr, method, ...(customer.trim() ? { customerName: customer.trim() } : {}), ...(phone.trim() ? { phone: phone.trim() } : {}) });
      setDone(r);
      setPacks("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>
        {L("అమ్మకం", "Sell")} — {L(product.nameTe || product.nameEn, product.nameEn || product.nameTe)} ({product.netQty} {product.netUnit})
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        {done && (
          <Alert severity="success">
            {L(`బిల్ ${done.saleNumber}: ${formatINR(done.amount)}${done.tax > 0 ? ` (అందులో GST ${formatINR(done.tax)})` : ""}. నిల్వలో మిగిలినవి: ${done.newQuantity}`, `Bill ${done.saleNumber}: ${formatINR(done.amount)}${done.tax > 0 ? ` (GST inside ${formatINR(done.tax)})` : ""}. Left in stock: ${done.newQuantity}`)}
          </Alert>
        )}
        <Typography variant="body2">
          {L(`అమ్మడానికి ఉన్నవి: ${done ? done.newQuantity : canSell} ప్యాక్‌లు (గడువు దాటినవి లెక్కలో లేవు) · MRP ${formatINR(product.mrp)}`, `Can be sold: ${done ? done.newQuantity : canSell} packs (expired packs not counted) · MRP ${formatINR(product.mrp)}`)}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField size="small" autoFocus label={L("ఎన్ని ప్యాక్‌లు", "How many packs")} value={packs} onChange={(e) => setPacks(e.target.value)} error={Number.isFinite(n) && n > canSell} />
          <TextField size="small" label={L("ప్యాక్ ధర ₹", "Price per pack ₹")} value={price} onChange={(e) => setPrice(e.target.value)} error={overMrp} helperText={overMrp ? L("MRP కంటే ఎక్కువ వద్దు", "Not above MRP") : " "} />
        </Box>
        <TextField select size="small" label={L("చెల్లింపు", "Payment")} value={method} onChange={(e) => setMethod(e.target.value)}>
          {SALE_METHODS.map((m) => (
            <MenuItem key={m} value={m}>
              {m === "Credit" ? L("అప్పు (Credit)", "Credit") : m}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label={method === "Credit" ? L("కస్టమర్ పేరు (తప్పనిసరి)", "Customer name (required)") : L("కస్టమర్ పేరు (ఉంటే)", "Customer name (optional)")} value={customer} onChange={(e) => setCustomer(e.target.value)} />
        <TextField size="small" label={L("ఫోన్ (ఉంటే)", "Phone (optional)")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        {Number.isFinite(n) && n >= 1 && pr > 0 && !overMrp && (
          <Typography sx={{ fontWeight: 600 }}>
            {L("మొత్తం", "Total")}: {formatINR(Math.round(n * pr * 100) / 100)}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("మూసివేయి", "Close")}
        </Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("అమ్మకం నమోదు", "Record sale")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Module 2f — packed products: master (MRP, net quantity, shelf life, label text), packing runs, label print. */
export function PackedProductsPage() {
  const { L } = useLang();
  const { currentBranchId } = useBranch();
  const { settings } = useBusinessSettings();
  const [rows, setRows] = useState<PackedProduct[] | null>(null);
  const [stock, setStock] = useState<Map<string, InventoryItem>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PackedProduct | "new" | null>(null);
  const [packing, setPacking] = useState<PackedProduct | null>(null);
  // X5: selling
  const [selling, setSelling] = useState<PackedProduct | null>(null);
  const [sales, setSales] = useState<PackedSale[]>([]);
  const session = useSession();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const today = todayIso();
  useEffect(() => (currentBranchId ? subscribePackedSales(currentBranchId, today, setSales, () => setSales([])) : setSales([])), [currentBranchId, today]);
  const liveSales = sales.filter((x) => !x.cancelled);
  const cancelSale = async (sale: PackedSale) => {
    const reason = window.prompt(L(`బిల్ ${sale.saleNumber} రద్దు చేయడానికి కారణం రాయండి`, `Reason for cancelling bill ${sale.saleNumber}`));
    if (!reason || reason.trim().length < 3) return;
    try {
      await cancelPackedSale({ saleId: sale.id, reason: reason.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const sellable = (p: PackedProduct) => {
    const it = stock.get(p.inventoryItemId);
    return it ? Math.max(0, Math.floor(it.quantityInStock - it.expiredQty)) : 0;
  };

  useEffect(() => subscribePackedProducts(currentBranchId, setRows, (e) => setError(e.message)), [currentBranchId]);
  useEffect(() => subscribeInventory(currentBranchId, (items) => setStock(new Map(items.map((i) => [i.id, i])))), [currentBranchId]);

  const biz: LabelBusiness = { name: settings.name, address: settings.address, phone: settings.phone, fssaiNumber: settings.fssaiNumber };
  const all = rows ?? [];
  const incomplete = all.filter((p) => p.active && labelGaps(p, biz).must.length > 0).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("ప్యాక్ ఉత్పత్తులు", "Packed products")}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")}>
            {L("కొత్త ఉత్పత్తి", "New product")}
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <StatRow>
        <StatCard label={L("ఉత్పత్తులు", "Products")} value={all.filter((p) => p.active).length} />
        <StatCard label={L("లేబుల్ వివరాలు అసంపూర్ణం", "Label details incomplete")} value={incomplete} tone={incomplete > 0 ? "warn" : "good"} />
        <StatCard label={L("ఈరోజు అమ్మకం", "Sold today")} value={formatINR(liveSales.reduce((a, x) => a + x.amount, 0))} />
      </StatRow>
      {rows !== null && all.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {L(
            "ఇంకా ప్యాక్ ఉత్పత్తులు లేవు. పచ్చళ్లు, పొడులు, స్వీట్లు లాంటివి ప్యాక్ చేసి అమ్ముతుంటే ఇక్కడ చేర్చండి: పేరు, బరువు, MRP, ఎన్ని రోజులు నిల్వ ఉంటుంది.",
            "No packed products yet. If you sell pickles, powders or sweets in packs, add them here: name, weight, MRP and shelf life.",
          )}
        </Alert>
      )}
      <DataTable
        rows={all}
        rowKey={(p) => p.id}
        onRowClick={(p) => setEditing(p)}
        columns={[
          { label: L("ఉత్పత్తి", "Product"), render: (p) => `${L(p.nameTe || p.nameEn, p.nameEn || p.nameTe)}${p.active ? "" : L(" · ఆపివేశారు", " · off")}` },
          { label: L("నికర పరిమాణం", "Net"), render: (p) => `${p.netQty} ${p.netUnit}` },
          { label: "MRP", align: "right", render: (p) => formatINR(p.mrp) },
          { label: L("నిల్వ (ప్యాక్‌లు)", "In stock (packs)"), align: "right", render: (p) => stock.get(p.inventoryItemId)?.quantityInStock ?? 0 },
          { label: L("ముందు గడువు", "Nearest expiry"), hideOnMobile: true, render: (p) => stock.get(p.inventoryItemId)?.nearestExpiry || "—" },
          {
            label: L("లేబుల్", "Label"),
            hideOnMobile: true,
            render: (p) => (labelGaps(p, biz).must.length ? <Chip size="small" color="warning" label={L("అసంపూర్ణం", "Incomplete")} /> : <Chip size="small" color="success" label={L("సరే", "OK")} />),
          },
          {
            label: "",
            render: (p) => (
              <Button
                size="small"
                variant="outlined"
                disabled={!p.active}
                onClick={(e) => {
                  e.stopPropagation();
                  setPacking(p);
                }}
              >
                {L("ప్యాక్ చేశాం", "Packed")}
              </Button>
            ),
          },
          {
            label: " ",
            render: (p) => (
              <Button
                size="small"
                variant="contained"
                disabled={!p.active || sellable(p) < 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelling(p);
                }}
              >
                {L("అమ్ము", "Sell")}
              </Button>
            ),
          },
        ]}
      />
      {editing && <ProductDialog product={editing} branchId={currentBranchId} biz={biz} onClose={() => setEditing(null)} />}
      {packing && <PackDialog product={packing} biz={biz} onClose={() => setPacking(null)} />}
      {selling && <SellDialog product={selling} canSell={sellable(selling)} onClose={() => setSelling(null)} />}
      {sales.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("ఈరోజు అమ్మకాలు", "Today's sales")}
          </Typography>
          <DataTable
            rows={sales}
            rowKey={(x) => x.id}
            columns={[
              { label: L("బిల్", "Bill"), render: (x) => `${x.saleNumber}${x.cancelled ? L(" · రద్దు", " · cancelled") : ""}` },
              { label: L("ఉత్పత్తి", "Product"), render: (x) => x.productName },
              { label: L("ప్యాక్‌లు", "Packs"), align: "right", render: (x) => x.packs },
              { label: L("మొత్తం", "Amount"), align: "right", render: (x) => formatINR(x.amount) },
              { label: L("చెల్లింపు", "Payment"), hideOnMobile: true, render: (x) => `${x.method}${x.customerName ? ` · ${x.customerName}` : ""}` },
              {
                label: "",
                render: (x) =>
                  isAdmin && !x.cancelled ? (
                    <Button size="small" color="error" onClick={() => cancelSale(x)}>
                      {L("రద్దు", "Cancel")}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </Box>
      )}
    </Box>
  );
}
