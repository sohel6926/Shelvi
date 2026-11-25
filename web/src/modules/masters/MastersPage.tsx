import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, ListItemText, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveMaster, setMasterStatus, setupMasters, type MasterKind } from "../../data/functions";
import { uploadSettingsImage } from "../../data/settingsRepository";
import { DataTable, PageHeader } from "../../components/DataTable";

type Row = { id: string } & Record<string, unknown>;
type Opt = { code: string; te: string; en: string };
const o = (code: string, te: string, en: string): Opt => ({ code, te, en });
const str = (v: unknown) => (typeof v === "string" ? v : "");

const COLLECTION: Record<MasterKind, string> = { company: "companies", brand: "brands", branch: "branches", kitchen: "kitchens", store: "stores" };
const KIND_LABEL: Record<MasterKind, { te: string; en: string }> = {
  company: { te: "కంపెనీ", en: "Company" },
  brand: { te: "బ్రాండ్‌లు", en: "Brands" },
  branch: { te: "శాఖలు", en: "Branches" },
  kitchen: { te: "వంటశాలలు", en: "Kitchens" },
  store: { te: "స్టోర్లు", en: "Stores" },
};
const STATUS: Record<string, { te: string; en: string; color: "default" | "success" | "warning" }> = {
  draft: { te: "డ్రాఫ్ట్", en: "Draft", color: "default" },
  active: { te: "వాడుకలో", en: "Active", color: "success" },
  inactive: { te: "తాత్కాలికంగా ఆపారు", en: "Paused", color: "warning" },
  archived: { te: "ఆర్కైవ్", en: "Archived", color: "default" },
};
const statusOf = (r: Row) => (typeof r.status === "string" && STATUS[r.status] ? r.status : r.active === false ? "inactive" : "active");

const BRAND_TYPES = [o("pureVeg", "శుద్ధ శాకాహారం", "Pure veg"), o("nonVeg", "మాంసాహారం", "Non-veg"), o("mixed", "రెండూ", "Mixed"), o("corporate", "కార్పొరేట్", "Corporate"), o("wedding", "పెళ్ళిళ్ళు", "Wedding"), o("religious", "పూజలు / ధార్మిక", "Religious"), o("cloudKitchen", "క్లౌడ్ కిచెన్", "Cloud kitchen"), o("eventFood", "ఈవెంట్ ఫుడ్", "Event food"), o("other", "ఇతర", "Other")];
const BRANCH_TYPES = [o("fullOperations", "పూర్తి కార్యకలాపాలు", "Full operations"), o("sales", "అమ్మకాలు", "Sales"), o("kitchen", "వంటశాల", "Kitchen"), o("officeOnly", "ఆఫీస్ మాత్రమే", "Office only"), o("warehouseOnly", "గోదాం మాత్రమే", "Warehouse only"), o("dispatchHub", "పంపిణీ కేంద్రం", "Dispatch hub"), o("combination", "మిశ్రమం", "Combination")];
const KITCHEN_TYPES = [o("central", "ప్రధాన వంటశాల", "Central kitchen"), o("veg", "శాకాహార", "Veg"), o("nonVeg", "మాంసాహార", "Non-veg"), o("mixed", "రెండూ", "Mixed"), o("sweet", "స్వీట్లు", "Sweet"), o("bakery", "బేకరీ", "Bakery"), o("prep", "తయారీ", "Prep"), o("satellite", "ఉప వంటశాల", "Satellite"), o("eventSite", "కార్యక్రమ స్థలంలో", "Event-site")];
const SECTIONS = [o("vegPrep", "కూరగాయల తయారీ", "Vegetable prep"), o("rice", "అన్నం", "Rice"), o("curry", "కూరలు", "Curry"), o("fry", "వేపుళ్ళు", "Fry"), o("nonVeg", "మాంసాహారం", "Non-veg"), o("tiffin", "టిఫిన్", "Tiffin"), o("sweet", "స్వీట్లు", "Sweet"), o("bakery", "బేకరీ", "Bakery"), o("liveCounterPrep", "లైవ్ కౌంటర్", "Live counter prep"), o("packing", "ప్యాకింగ్", "Packing"), o("washing", "కడగడం", "Washing")];
const STORE_TYPES = [o("main", "ప్రధాన స్టోర్", "Main store"), o("grocery", "కిరాణా", "Grocery"), o("dry", "పొడి సరుకు", "Dry"), o("vegetable", "కూరగాయలు", "Vegetable"), o("fruit", "పండ్లు", "Fruit"), o("dairy", "పాల పదార్థాలు", "Dairy"), o("cold", "కోల్డ్ స్టోర్", "Cold store"), o("freezer", "ఫ్రీజర్", "Freezer"), o("nonVegCold", "మాంసం కోల్డ్ స్టోర్", "Non-veg cold store"), o("beverage", "పానీయాలు", "Beverage"), o("packing", "ప్యాకింగ్ సామాను", "Packing"), o("cleaning", "శుభ్రత సామాను", "Cleaning"), o("equipment", "పాత్రలు / సామాను", "Equipment"), o("gasFuel", "గ్యాస్ / ఇంధనం", "Gas / fuel"), o("return", "తిరిగి వచ్చినవి", "Return"), o("quarantine", "వేరుగా ఉంచినవి", "Quarantine"), o("scrap", "వ్యర్థం", "Scrap / waste"), o("transit", "రవాణాలో", "Transit")];

type Field =
  | { key: string; te: string; en: string; type: "text" | "number" | "bool"; path?: "address"; upper?: boolean; help?: { te: string; en: string } }
  | { key: string; te: string; en: string; type: "select"; options: Opt[] }
  | { key: string; te: string; en: string; type: "multi"; options: Opt[] }
  | { key: string; te: string; en: string; type: "parent"; of: MasterKind; optional?: boolean }
  | { key: string; te: string; en: string; type: "parents"; of: MasterKind }
  | { key: string; te: string; en: string; type: "image" }
  | { key: string; te: string; en: string; type: "lines"; help: { te: string; en: string } };
const f = (key: string, te: string, en: string, type: "text" | "number" | "bool" = "text", extra: { path?: "address"; upper?: boolean } = {}): Field => ({ key, te, en, type, ...extra });
const ADDRESS: Field[] = [f("line1", "చిరునామా", "Address", "text", { path: "address" }), f("area", "ప్రాంతం", "Area", "text", { path: "address" }), f("city", "నగరం", "City", "text", { path: "address" }), f("state", "రాష్ట్రం", "State", "text", { path: "address" }), f("pin", "PIN కోడ్", "PIN code", "text", { path: "address" })];
const CONTACT: Field[] = [f("mobile", "మొబైల్ (10 అంకెలు)", "Mobile (10 digits)"), f("email", "ఈమెయిల్", "Email")];

const FIELDS: Record<MasterKind, Field[]> = {
  company: [f("legalName", "చట్టబద్ధ పేరు", "Legal name"), f("displayName", "చూపే పేరు", "Display name"), f("companyType", "కంపెనీ రకం (Pvt Ltd, Proprietorship …)", "Company type (Pvt Ltd, Proprietorship …)"), f("registrationNumber", "రిజిస్ట్రేషన్ / CIN నంబర్", "Registration / CIN number", "text", { upper: true }), f("gstRegistered", "GST నమోదు ఉంది", "GST registered", "bool"), f("gstin", "GSTIN", "GSTIN", "text", { upper: true }), f("pan", "PAN", "PAN", "text", { upper: true }), ...ADDRESS, ...CONTACT, f("website", "వెబ్‌సైట్", "Website")],
  brand: [{ key: "companyId", te: "కంపెనీ", en: "Company", type: "parent", of: "company" }, f("name", "బ్రాండ్ పేరు", "Brand name"), { key: "businessTypes", te: "వ్యాపార రకం", en: "Business type", type: "multi", options: BRAND_TYPES }, f("tagline", "ట్యాగ్‌లైన్", "Tagline"), { key: "logoUrl", te: "బ్రాండ్ లోగో (ఈ బ్రాండ్ ఇన్‌వాయిస్‌పై వస్తుంది)", en: "Brand logo (printed on this brand's invoices)", type: "image" }, f("invoiceDisplayName", "ఇన్వాయిస్‌పై పేరు", "Name on invoices"), f("quotationDisplayName", "కొటేషన్‌పై పేరు", "Name on quotations"), f("vegOnly", "శాకాహారం మాత్రమే", "Veg only", "bool"), ...CONTACT, f("whatsapp", "WhatsApp నంబర్", "WhatsApp number"), f("website", "వెబ్‌సైట్", "Website")],
  branch: [{ key: "companyId", te: "కంపెనీ", en: "Company", type: "parent", of: "company" }, f("name", "శాఖ పేరు", "Branch name"), { key: "brandIds", te: "ఈ శాఖ ఏ బ్రాండ్‌లకు పని చేస్తుంది", en: "Brands this branch serves", type: "parents", of: "brand" }, { key: "branchType", te: "శాఖ రకం", en: "Branch type", type: "select", options: BRANCH_TYPES }, ...ADDRESS, ...CONTACT, f("maxEventsPerDay", "రోజుకు గరిష్ట కార్యక్రమాలు (0 = పరిమితి లేదు)", "Most events per day (0 = no limit)", "number")],
  kitchen: [{ key: "branchId", te: "శాఖ", en: "Branch", type: "parent", of: "branch" }, f("name", "వంటశాల పేరు", "Kitchen name"), { key: "kitchenType", te: "వంటశాల రకం", en: "Kitchen type", type: "select", options: KITCHEN_TYPES }, { key: "sections", te: "విభాగాలు", en: "Sections", type: "multi", options: SECTIONS }, f("vegOnly", "శాకాహారం మాత్రమే", "Veg only", "bool"), f("maxPlatesPerShift", "ఒక షిఫ్ట్‌లో గరిష్ట ప్లేట్లు (0 = చెప్పలేదు)", "Most plates per shift (0 = not set)", "number"), f("qualityApprovalRequired", "నాణ్యత ఆమోదం తప్పనిసరి", "Quality approval required", "bool"), f("temperatureLogRequired", "ఉష్ణోగ్రత నమోదు తప్పనిసరి", "Temperature log required", "bool"), f("batchTrackingRequired", "బ్యాచ్ నమోదు తప్పనిసరి", "Batch tracking required", "bool")],
  store: [{ key: "branchId", te: "శాఖ", en: "Branch", type: "parent", of: "branch" }, { key: "kitchenId", te: "వంటశాల (ఉంటే)", en: "Kitchen (if any)", type: "parent", of: "kitchen", optional: true }, f("name", "స్టోర్ పేరు", "Store name"), { key: "storeType", te: "స్టోర్ రకం", en: "Store type", type: "select", options: STORE_TYPES }, f("temperatureControlled", "ఉష్ణోగ్రత నియంత్రణ ఉంది", "Temperature controlled", "bool"), f("restrictedAccess", "అనుమతి ఉన్నవారికే ప్రవేశం", "Restricted access", "bool"), f("expiryTracking", "గడువు తేదీ నమోదు", "Expiry tracking", "bool"), { key: "locations", te: "స్థానాలు (ఒక్కో లైన్‌కి ఒకటి)", en: "Shelf locations (one per line)", type: "lines", help: { te: "జోన్ / ర్యాక్ / షెల్ఫ్ / బిన్ — ఉదా: పొడి / R1 / S2 / B3. మీరే రాయండి; ఇది వస్తువులకు స్థానం ఎంచుకోవడానికి.", en: "Zone / Rack / Shelf / Bin — e.g. Dry / R1 / S2 / B3. You write them; items are then given a place from this list." } }],
};
/** Parsed by the server but not shown in the form. */
const HIDDEN_KEYS = ["shortName", "tan", "stateCode", "fyStartMonth", "nonVegAllowed", "adjustmentApprovalRequired"];
const nameOf = (kind: MasterKind, r: Row) => str(kind === "company" ? r.displayName || r.legalName : r.name) || r.id;

function EditDialog({ kind, row, all, onClose }: { kind: MasterKind; row: Row | null; all: Record<MasterKind, Row[]>; onClose: () => void }) {
  const { L, lang } = useLang();
  const [v, setV] = useState<Record<string, unknown>>(() => ({ ...(row ?? {}), address: { ...((row?.address as object) ?? {}) } }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const get = (fl: Field) => ("path" in fl && fl.path ? (v.address as Record<string, unknown>)?.[fl.key] : v[fl.key]);
  const set = (fl: Field, value: unknown) => setV((cur) => ("path" in fl && fl.path ? { ...cur, address: { ...(cur.address as object), [fl.key]: value } } : { ...cur, [fl.key]: value }));
  const usable = (k: MasterKind) => all[k].filter((r) => ["active", "draft"].includes(statusOf(r)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const data: Record<string, unknown> = { address: v.address };
      for (const fl of FIELDS[kind]) if (!("path" in fl && fl.path)) data[fl.key] = fl.type === "number" ? Number(v[fl.key]) || 0 : v[fl.key];
      // Fields the form does not show (short name, TAN, state code, FY start month …) are kept as they are — the server
      // saves with defaults for anything missing, so leaving them out would reset them on every edit.
      if (row) for (const k of HIDDEN_KEYS) if (row[k] !== undefined && !(k in data)) data[k] = row[k];
      await saveMaster({ kind, ...(row ? { id: row.id } : {}), data });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>{row ? `${str(row.code)} · ${nameOf(kind, row)}` : L("కొత్తది చేర్చు", "Add new")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {FIELDS[kind].map((fl) => {
          const label = L(fl.te, fl.en);
          if (fl.type === "lines")
            return (
              <TextField
                key={fl.key}
                label={label}
                helperText={L(fl.help.te, fl.help.en)}
                multiline
                minRows={3}
                value={Array.isArray(get(fl)) ? (get(fl) as string[]).join("\n") : str(get(fl))}
                onChange={(e) => set(fl, e.target.value.split("\n"))}
              />
            );
          if (fl.type === "image")
            return (
              <Box key={fl.key} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ width: 120, height: 64, border: "1px dashed", borderColor: "divider", borderRadius: 1, display: "grid", placeItems: "center", bgcolor: "#fff", overflow: "hidden" }}>
                  {str(get(fl)) ? <Box component="img" src={str(get(fl))} alt="" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <Typography variant="caption" color="text.secondary">{L("లోగో లేదు", "No logo")}</Typography>}
                </Box>
                <Button component="label" size="small" variant="outlined" disabled={busy}>
                  {label}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
                        setError(L("5 MB లోపు ఫోటో (image) file మాత్రమే.", "Choose an image file under 5 MB."));
                        return;
                      }
                      setBusy(true);
                      setError(null);
                      uploadSettingsImage(file, "logo")
                        .then((url) => set(fl, url))
                        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                        .finally(() => setBusy(false));
                    }}
                  />
                </Button>
                {str(get(fl)) && (
                  <Button size="small" color="error" onClick={() => set(fl, "")}>
                    {L("తీసేయి", "Remove")}
                  </Button>
                )}
              </Box>
            );
          if (fl.type === "bool") return <FormControlLabel key={fl.key} control={<Checkbox checked={get(fl) === true} onChange={(e) => set(fl, e.target.checked)} />} label={label} />;
          if (fl.type === "select")
            return (
              <TextField key={fl.key} select label={label} value={str(get(fl)) || fl.options[0].code} onChange={(e) => set(fl, e.target.value)}>
                {fl.options.map((x) => (
                  <MenuItem key={x.code} value={x.code}>
                    {L(x.te, x.en)}
                  </MenuItem>
                ))}
              </TextField>
            );
          if (fl.type === "multi" || fl.type === "parents") {
            const options: Opt[] = fl.type === "multi" ? fl.options : usable(fl.of).filter((r) => fl.of !== "brand" || !v.companyId || r.companyId === v.companyId).map((r) => o(r.id, nameOf(fl.of, r), nameOf(fl.of, r)));
            const value = Array.isArray(get(fl)) ? (get(fl) as string[]) : [];
            return (
              <TextField key={fl.key} select label={label} value={value} onChange={(e) => set(fl, e.target.value)} slotProps={{ select: { multiple: true, renderValue: (sel) => (sel as string[]).map((c) => { const x = options.find((y) => y.code === c); return x ? L(x.te, x.en) : c; }).join(", ") } }}>
                {options.map((x) => (
                  <MenuItem key={x.code} value={x.code}>
                    <Checkbox checked={value.includes(x.code)} />
                    <ListItemText primary={L(x.te, x.en)} />
                  </MenuItem>
                ))}
              </TextField>
            );
          }
          if (fl.type === "parent") {
            const rows = usable(fl.of).filter((r) => fl.of !== "kitchen" || !v.branchId || r.branchId === v.branchId);
            return (
              <TextField key={fl.key} select label={label} value={str(get(fl))} onChange={(e) => set(fl, e.target.value)} disabled={!!row && !fl.optional}>
                {fl.optional && <MenuItem value="">{L("— లేదు —", "— none —")}</MenuItem>}
                {rows.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {nameOf(fl.of, r)}
                  </MenuItem>
                ))}
              </TextField>
            );
          }
          return <TextField key={fl.key} label={label} value={get(fl) === undefined || get(fl) === null ? "" : String(get(fl))} onChange={(e) => set(fl, "upper" in fl && fl.upper ? e.target.value.toUpperCase() : e.target.value)} slotProps={fl.type === "number" ? { htmlInput: { inputMode: "numeric" } } : undefined} />;
        })}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Cancel")}
        </Button>
        <Button variant="contained" onClick={save} disabled={busy}>
          {L("సేవ్", "Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Module 5a — Company → Brand → Branch → Kitchen → Store (Master Data Freeze 01). Owner only. Every change goes
 * through saveMaster / setMasterStatus; nothing is deleted — a record is paused or archived.
 */
export function MastersPage() {
  const { L, lang } = useLang();
  const [kind, setKind] = useState<MasterKind>("company");
  const [all, setAll] = useState<Record<MasterKind, Row[]>>({ company: [], brand: [], branch: [], kitchen: [], store: [] });
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const stops = (Object.keys(COLLECTION) as MasterKind[]).map((k) =>
      onSnapshot(
        collection(db, COLLECTION[k]),
        (snap) => setAll((cur) => ({ ...cur, [k]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
        () => undefined,
      ),
    );
    return () => stops.forEach((s) => s());
  }, []);

  const rows = useMemo(() => [...all[kind]].sort((a, b) => str(a.code).localeCompare(str(b.code)) || nameOf(kind, a).localeCompare(nameOf(kind, b))), [all, kind]);
  const parentName = (k: MasterKind, id: unknown) => {
    const r = all[k].find((x) => x.id === id);
    return r ? nameOf(k, r) : "—";
  };
  const needsSetup = all.company.length === 0 || all.brand.length === 0 || all.branch.some((b) => !b.companyId) || all.branch.some((b) => statusOf(b) !== "archived" && !all.store.some((s) => s.branchId === b.id));

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await work();
      if (done) setNote(done);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = (r: Row, status: "active" | "inactive" | "archived") => {
    const ask = status === "archived" ? L("ఆర్కైవ్ చేయడానికి కారణం రాయండి (తిరిగి తెరవలేరు)", "Why are you archiving it? (it cannot be reopened)") : status === "inactive" ? L("తాత్కాలికంగా ఆపడానికి కారణం రాయండి", "Why are you pausing it?") : L("తిరిగి వాడుకలోకి తేవడానికి కారణం రాయండి", "Why are you putting it back in use?");
    const reason = (window.prompt(ask) ?? "").trim();
    if (reason) void run(() => setMasterStatus({ kind, id: r.id, status, reason }));
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("కంపెనీ · బ్రాండ్ · శాఖ · వంటశాల · స్టోర్", "Company · Brand · Branch · Kitchen · Store")}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing("new")} disabled={kind !== "company" && all.company.length === 0}>
            {L("కొత్తది", "Add")}
          </Button>
        }
      />
      {needsSetup && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" disabled={busy} onClick={() => void run(() => setupMasters({}), L("మొదటి ఏర్పాటు పూర్తయింది.", "First set-up done."))}>{L("మొదటి ఏర్పాటు చేయి", "Do the first set-up")}</Button>}>
          {L("CRM లో ఇప్పటికే ఉన్న వివరాలతో కంపెనీ, బ్రాండ్ తయారు చేసి, ప్రతి శాఖకు ఒక వంటశాల, ఒక ప్రధాన స్టోర్ పెడతాం. తర్వాత మీరు మార్చుకోవచ్చు.", "A company and a brand are made from what the CRM already knows, and every branch gets one kitchen and one main store. You can change them afterwards.")}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {note && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {note}
        </Alert>
      )}
      <Tabs value={kind} onChange={(_, k) => setKind(k as MasterKind)} variant="scrollable" sx={{ mb: 2 }}>
        {(Object.keys(KIND_LABEL) as MasterKind[]).map((k) => (
          <Tab key={k} value={k} label={`${L(KIND_LABEL[k].te, KIND_LABEL[k].en)} (${all[k].filter((r) => statusOf(r) !== "archived").length})`} />
        ))}
      </Tabs>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        emptyText={L("ఇంకా ఏమీ లేదు.", "Nothing here yet.")}
        columns={[
          { label: L("కోడ్", "Code"), render: (r) => str(r.code) || "—" },
          { label: L("పేరు", "Name"), render: (r) => nameOf(kind, r) },
          {
            label: L("ఎక్కడ", "Under"),
            hideOnMobile: true,
            render: (r) =>
              kind === "company" ? str(r.gstin) || L("GST నమోదు లేదు", "Not GST registered") : kind === "brand" || kind === "branch" ? parentName("company", r.companyId) : kind === "kitchen" ? parentName("branch", r.branchId) : `${parentName("branch", r.branchId)}${r.kitchenId ? ` · ${parentName("kitchen", r.kitchenId)}` : ""}`,
          },
          { label: L("స్థితి", "Status"), render: (r) => <Chip size="small" color={STATUS[statusOf(r)].color} label={L(STATUS[statusOf(r)].te, STATUS[statusOf(r)].en)} /> },
          {
            label: "",
            render: (r) => {
              const st = statusOf(r);
              if (st === "archived") return null;
              return (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  <Button size="small" onClick={() => setEditing(r)}>
                    {L("మార్చు", "Edit")}
                  </Button>
                  {st === "active" ? (
                    <Button size="small" color="warning" disabled={busy} onClick={() => changeStatus(r, "inactive")}>
                      {L("ఆపు", "Pause")}
                    </Button>
                  ) : (
                    <Button size="small" color="success" disabled={busy} onClick={() => changeStatus(r, "active")}>
                      {L("వాడుకలోకి", "Use again")}
                    </Button>
                  )}
                  <Button size="small" color="error" disabled={busy} onClick={() => changeStatus(r, "archived")}>
                    {L("ఆర్కైవ్", "Archive")}
                  </Button>
                </Box>
              );
            },
          },
        ]}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {L("ఏదీ తొలగించబడదు: ఆపవచ్చు లేదా ఆర్కైవ్ చేయవచ్చు. కింద వాడుకలో ఉన్నవి ఉంటే ఆర్కైవ్ కాదు.", "Nothing is deleted: a record is paused or archived. It cannot be archived while records under it are in use.")}
      </Typography>
      {editing && <EditDialog kind={kind} row={editing === "new" ? null : editing} all={all} onClose={() => setEditing(null)} />}
    </Box>
  );
}
