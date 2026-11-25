import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, FormControlLabel, Paper, Switch, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useLang, monthName } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings, type BusinessSettingsInput, type MonthlyPayRules } from "../../data/functions";
import {
  DEFAULT_PHONE,
  docBrandLine,
  progressPercent,
  uploadSettingsImage,
  useBusinessSettings,
} from "../../data/settingsRepository";
import { AnimatedProgress } from "../../theme/motion";
import { kpiCardSx } from "../../theme/tokens";
import { CALC_AREAS, type CalcArea, type CalcModes } from "../../data/calcMode";
import { refreshFromServer } from "../../data/refresh";
import { LeadAssignCard } from "../leads/LeadAssignCard";
import { ExpiryAlertCard } from "../inventory/ExpiryAlertCard";
import { StockReserveCard } from "../inventory/StockReserveCard";
import { PoApprovalCard } from "../procure/PoApprovalCard";
import { SodCard } from "../procure/SodCard";
import { StockAdjustCard } from "../inventory/StockAdjustCard";
import { UomCard } from "./UomCard";
import { doc } from "firebase/firestore";
import { db } from "../../firebase";

const AREA_LABEL: Record<CalcArea, { te: string; en: string }> = {
  quotation: { te: "కొటేషన్ మొత్తాలు", en: "Quotation totals" },
  invoice: { te: "Invoice మొత్తాలు", en: "Invoice totals" },
  attendancePay: { te: "రోజు కూలీ (హాజరు)", en: "Attendance day pay" },
  payroll: { te: "నెల జీతాలు", en: "Monthly payroll" },
  cooking: { te: "వంట పరిమాణాలు", en: "Cooking quantities" },
  targets: { te: "నెల లక్ష్యాలు", en: "Month targets" },
};
import { ErrorBox, ScreenTitle } from "../../components/ui";

/** Indian GSTIN: 2-digit state, 10-char PAN, entity, 'Z', check character. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

interface Form {
  name: string;
  address: string;
  phone: string;
  fssaiNumber: string;
  gstin: string;
  gstRate: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  upiId: string;
  logoUrl: string;
  signatureUrl: string;
  terms: string;
  invoiceTerms: string;
  profitMarginPct: string;
  seasonWeights: string[];
  rules: MonthlyPayRules;
  freeLeaves: string;
  calcModes: CalcModes;
  managerCanOverride: boolean;
  autoStockDeduct: boolean;
  legalName: string;
  brandName: string;
  legalNameOnDocs: boolean;
  targetBoardShowRupeesToAll: boolean;
  /** R10-5 / R10-8 */
  kitchenRent: string;
  otherFixed: string;
  googleReviewUrl: string;
  vendorPriceAlertPct: string;
  targetMarginPct: string;
  labourPerPlate: string;
  overheadPerPlate: string;
  lunchBoxPrice: string;
  templates: Record<string, string>;
}

/** Message types the agents send (functions/src/shared/templates.ts TemplateKey) → Meta template names. */
const MESSAGE_TYPES: { key: string; te: string; en: string }[] = [
  { key: "customer.duesReminder", te: "బాకీ గుర్తు (కస్టమర్)", en: "Dues reminder (customer)" },
  { key: "customer.guestCountConfirm", te: "అతిథుల సంఖ్య ఖరారు (కస్టమర్)", en: "Guest count confirmation (customer)" },
  { key: "customer.feedbackRequest", te: "అభిప్రాయం / review అడగడం (కస్టమర్)", en: "Feedback / review request (customer)" },
  { key: "lead.firstContact", te: "కొత్త ఎంక్వైరీకి మొదటి మెసేజ్", en: "Lead first contact" },
  { key: "lead.followup", te: "ఎంక్వైరీ follow-up", en: "Lead follow-up" },
  { key: "staff.timeline", te: "సిబ్బందికి event timeline", en: "Staff event timeline" },
  { key: "owner.alert", te: "యజమానికి హెచ్చరిక", en: "Owner alert" },
  { key: "owner.morningSummary", te: "యజమానికి ఉదయం సారాంశం", en: "Owner morning summary" },
];
const TEMPLATE_RE = /^[a-z0-9_]{1,512}$/;

const DEFAULT_TERMS_TE =
  "1. కొటేషన్ 15 రోజులు చెల్లుతుంది.\n2. Event కి 3 రోజుల ముందు guest count ఖరారు చేయాలి.\n3. చివరి నిమిషంలో పెంచిన ప్లేట్లకి 10% అదనం.\n4. Advance తిరిగి ఇవ్వబడదు.";

/** Same default as the server (functions/src/shared/settingsModel.ts DEFAULT_INVOICE_TERMS). */
const DEFAULT_INVOICE_TERMS_TE = [
  "1. బిల్ మొత్తం event రోజు లోపు పూర్తిగా చెల్లించాలి.",
  "2. చెల్లింపు: UPI / బ్యాంక్ ట్రాన్స్‌ఫర్ / నగదు — చెల్లించిన ప్రతి మొత్తానికి రసీదు ఇస్తాం.",
  "3. Event తర్వాత పెరిగిన అతిథులు / అదనపు వస్తువులు ఈ బిల్‌లో వేరుగా చూపించాం.",
  "4. ఆర్డర్ రద్దు అయితే, ఉంచుకున్న మొత్తం 'రద్దు చార్జీ' గా బిల్‌లో ఉంటుంది.",
].join("\n");

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Box sx={{ display: "grid", gap: 2 }}>{children}</Box>
    </Paper>
  );
}

function ImagePicker({
  label,
  url,
  kind,
  onUploaded,
}: {
  label: string;
  url: string;
  kind: "logo" | "signature";
  onUploaded: (url: string) => void;
}) {
  const { L } = useLang();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr(L("ఫోటో (image) file మాత్రమే.", "Please choose an image file."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr(L("ఫోటో 5 MB లోపు ఉండాలి.", "Image must be under 5 MB."));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      onUploaded(await uploadSettingsImage(file, kind));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <Box
        sx={{
          width: 140,
          height: 80,
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          bgcolor: "#fff",
          overflow: "hidden",
        }}
      >
        {url ? (
          <Box component="img" src={url} alt={label} sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <Typography variant="caption" color="text.secondary">
            {L("ఇంకా లేదు", "None yet")}
          </Typography>
        )}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 500 }}>{label}</Typography>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button size="small" variant="outlined" onClick={() => input.current?.click()} disabled={busy} sx={{ mt: 0.5 }}>
          {busy ? <CircularProgress size={16} /> : url ? L("మార్చు", "Change") : L("ఎక్కించు", "Upload")}
        </Button>
        {err && (
          <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
            {err}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function SettingsPage() {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const { settings, loaded } = useBusinessSettings();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  // Fill the form once from the stored settings.
  useEffect(() => {
    if (!loaded || form) return;
    setForm({
      name: settings.name,
      address: settings.address,
      phone: settings.phone || DEFAULT_PHONE,
      fssaiNumber: settings.fssaiNumber,
      gstin: settings.gstin,
      gstRate: settings.gstRegistered ? String(settings.defaultGstRate) : "",
      bankName: settings.bank.name,
      bankAccount: settings.bank.account,
      bankIfsc: settings.bank.ifsc,
      upiId: settings.upiId,
      logoUrl: settings.logoUrl,
      signatureUrl: settings.signatureUrl,
      terms: settings.terms || DEFAULT_TERMS_TE,
      invoiceTerms: settings.invoiceTerms || DEFAULT_INVOICE_TERMS_TE,
      profitMarginPct: String(settings.profitMarginPct),
      seasonWeights: settings.seasonWeights.map(String),
      rules: settings.monthlyPayRules,
      freeLeaves: String(settings.monthlyPayRules.freeLeaves),
      calcModes: settings.calcModes,
      managerCanOverride: settings.managerCanOverride,
      autoStockDeduct: settings.autoStockDeduct,
      legalName: settings.legalName,
      brandName: settings.brandName,
      legalNameOnDocs: settings.legalNameOnDocs,
      targetBoardShowRupeesToAll: settings.targetBoardShowRupeesToAll,
      kitchenRent: String(settings.fixedCostParts.kitchenRent),
      otherFixed: String(settings.fixedCostParts.other),
      googleReviewUrl: settings.googleReviewUrl,
      vendorPriceAlertPct: String(settings.vendorPriceAlertPct),
      targetMarginPct: String(settings.targetMarginPct),
      labourPerPlate: String(settings.labourPerPlate),
      overheadPerPlate: String(settings.overheadPerPlate),
      lunchBoxPrice: String(settings.lunchBoxPrice),
      templates: { ...settings.whatsappTemplates },
    });
  }, [loaded, settings, form]);

  if (!form) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const f = form;
  const set = (patch: Partial<Form>) => setForm({ ...f, ...patch });
  const gstin = f.gstin.trim().toUpperCase();
  const gstinValid = gstin === "" || GSTIN_RE.test(gstin);
  const ifscValid = f.bankIfsc.trim() === "" || IFSC_RE.test(f.bankIfsc.trim().toUpperCase());
  const upiValid = f.upiId.trim() === "" || UPI_RE.test(f.upiId.trim());
  const phoneValid = /^[6-9]\d{9}$/.test(f.phone.replace(/[\s-]/g, "").replace(/^\+?91/, ""));
  const pct = progress ?? progressPercent(settings.setupProgress);

  async function save() {
    setSavedMsg(null);
    setError(null);
    const problems: string[] = [];
    if (!f.name.trim()) problems.push(L("వ్యాపారం పేరు ఇవ్వండి.", "Enter the business name."));
    if (!phoneValid) problems.push(L("ఫోన్ నంబర్ 10 అంకెలు కావాలి.", "Phone must be a 10-digit mobile number."));
    if (!gstinValid) problems.push(L("GSTIN 15 అక్షరాలు, సరైన రూపంలో ఉండాలి.", "GSTIN must be 15 characters in the right format."));
    const rate = f.gstRate.trim() === "" ? null : Number(f.gstRate);
    if (gstin && (rate === null || !Number.isFinite(rate) || rate < 0 || rate > 28))
      problems.push(L("GSTIN ఇచ్చినప్పుడు GST రేటు (0–28%) కూడా ఇవ్వండి.", "With a GSTIN, enter the GST rate (0–28%)."));
    if (!ifscValid) problems.push(L("IFSC code సరిగా లేదు (ఉదా: SBIN0001234).", "IFSC code is not valid (e.g. SBIN0001234)."));
    if (!upiValid) problems.push(L("UPI ID సరిగా లేదు (ఉదా: name@okaxis).", "UPI ID is not valid (e.g. name@okaxis)."));
    const margin = Number(f.profitMarginPct);
    if (!Number.isFinite(margin) || margin < 0 || margin > 100) problems.push(L("లాభం % 0–100 మధ్య.", "Profit % must be 0–100."));
    const weights = f.seasonWeights.map((w) => Number(w));
    if (weights.some((w) => !Number.isFinite(w) || w < 0) || weights.reduce((a, w) => a + w, 0) <= 0)
      problems.push(L("నెలల బరువులు 0 లేదా ఎక్కువ, మొత్తం 0 కంటే ఎక్కువ.", "Season weights must be ≥ 0 and not all zero."));
    const freeLeaves = f.freeLeaves.trim() === "" ? 0 : Number(f.freeLeaves);
    if (!Number.isInteger(freeLeaves) || freeLeaves < 0 || freeLeaves > 31)
      problems.push(L("ఉచిత సెలవులు 0–31 పూర్ణ సంఖ్య.", "Free leave days must be a whole number 0–31."));
    // R10-5 numbers (all ≥ 0; the server checks the same ranges).
    const nonNeg = (s: string, max: number) => {
      const n = s.trim() === "" ? 0 : Number(s.replace(/,/g, ""));
      return Number.isFinite(n) && n >= 0 && n <= max ? n : NaN;
    };
    const kitchenRent = nonNeg(f.kitchenRent, 100_000_000);
    const otherFixed = nonNeg(f.otherFixed, 100_000_000);
    const alertPct = nonNeg(f.vendorPriceAlertPct, 100);
    const targetMargin = nonNeg(f.targetMarginPct, 95);
    const labour = nonNeg(f.labourPerPlate, 100000);
    const overhead = nonNeg(f.overheadPerPlate, 100000);
    const boxPrice = nonNeg(f.lunchBoxPrice, 100000);
    if ([kitchenRent, otherFixed].some(Number.isNaN)) problems.push(L("నెల fixed ఖర్చులు 0 లేదా ఎక్కువ రూపాయలు.", "Fixed monthly costs must be rupees ≥ 0."));
    if (Number.isNaN(alertPct)) problems.push(L("ధర పెరుగుదల హెచ్చరిక % 0–100.", "Price-rise alert % must be 0–100."));
    if (Number.isNaN(targetMargin)) problems.push(L("లక్ష్య లాభం % 0–95.", "Target margin % must be 0–95."));
    if ([labour, overhead, boxPrice].some(Number.isNaN)) problems.push(L("ప్లేటుకి కూలీ / ఇతర ఖర్చు, లంచ్ బాక్స్ ధర 0 లేదా ఎక్కువ రూపాయలు.", "Per-plate costs and lunch box price must be rupees ≥ 0."));
    const reviewUrl = f.googleReviewUrl.trim();
    if (reviewUrl && !/^https:\/\//i.test(reviewUrl)) problems.push(L("Google review link https:// తో మొదలవ్వాలి.", "The Google review link must start with https://."));
    const badTemplates = Object.values(f.templates).filter((v) => v.trim() !== "" && !TEMPLATE_RE.test(v.trim()));
    if (badTemplates.length) problems.push(L("Template పేర్లు చిన్న అక్షరాలు, అంకెలు, _ మాత్రమే (Meta లో ఉన్నట్టే).", "Template names: lower-case letters, digits and _ only (as in Meta)."));
    if (problems.length) {
      setError(problems.join(" "));
      return;
    }
    const payload: BusinessSettingsInput = {
      name: f.name.trim(),
      address: f.address.trim(),
      phone: f.phone.trim(),
      fssaiNumber: f.fssaiNumber.trim(),
      gstin,
      // GST turns on only when a GSTIN is entered (server sets gstRegistered / defaultGstRate).
      gstRate: gstin ? (rate as number) : 0,
      bank: { name: f.bankName.trim(), account: f.bankAccount.trim(), ifsc: f.bankIfsc.trim().toUpperCase() },
      upiId: f.upiId.trim(),
      logoUrl: f.logoUrl,
      signatureUrl: f.signatureUrl,
      terms: f.terms.trim(),
      invoiceTerms: f.invoiceTerms.trim(),
      profitMarginPct: margin,
      seasonWeights: weights,
      monthlyPayRules: { ...f.rules, freeLeaves: f.rules.deductAbsences ? freeLeaves : 0 },
      calcModes: f.calcModes,
      managerCanOverride: f.managerCanOverride,
      autoStockDeduct: f.autoStockDeduct,
      legalName: f.legalName.trim(),
      brandName: f.brandName.trim(),
      legalNameOnDocs: f.legalNameOnDocs,
      targetBoardShowRupeesToAll: f.targetBoardShowRupeesToAll,
      fixedMonthlyCosts: { kitchenRent, other: otherFixed },
      googleReviewUrl: reviewUrl,
      vendorPriceAlertPct: alertPct,
      targetMarginPct: targetMargin,
      labourPerPlate: labour,
      overheadPerPlate: overhead,
      lunchBoxPrice: boxPrice,
      // "" for a cleared row removes it on the server.
      whatsappTemplates: Object.fromEntries(MESSAGE_TYPES.map((m) => [m.key, (f.templates[m.key] ?? "").trim()])),
    };
    setSaving(true);
    try {
      const res = await saveBusinessSettings(payload);
      setProgress(progressPercent(res.setupProgress));
      setSavedMsg(
        gstin
          ? L("Save అయింది. GST ఇప్పుడు ఆన్ — కొత్త invoices 'Tax Invoice' గా వస్తాయి.", "Saved. GST is now on — new invoices print as 'Tax Invoice'.")
          : L("Save అయింది. GST ఆఫ్ — invoices 'Invoice' గా వస్తాయి.", "Saved. GST is off — invoices print as 'Invoice'."),
      );
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <ScreenTitle
        title={L("వ్యాపార వివరాలు (Setup)", "Business settings (setup)")}
        subtitle={L("ఇవి invoices, కొటేషన్ల మీద ప్రింట్ అవుతాయి.", "These print on invoices and quotations.")}
        onRefresh={async () => {
          await refreshFromServer(doc(db, "settings", "business"));
          setForm(null); // re-fill from the fresh server copy
        }}
        action={
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate("/settings/import")}>
            {L("Excel / CSV దిగుమతి", "Excel / CSV import")}
          </Button>
        }
      />

      <Paper sx={{ ...kpiCardSx(pct >= 100 ? "good" : "brand"), mb: 2, position: "relative" }}>
        <Typography variant="section" component="h2">
          {L("Setup ఎంత పూర్తయింది", "Setup progress")}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <AnimatedProgress value={pct} label={L("Setup పూర్తి శాతం", "Setup completion")} celebrateOnComplete />
        </Box>
        {pct >= 100 && (
          <Typography sx={{ mt: 1, fontWeight: 600 }}>{L("Setup పూర్తి!", "Setup complete!")}</Typography>
        )}
      </Paper>

      <Box sx={{ display: "grid", gap: 2 }}>
        <Section title={L("వ్యాపారం", "Business")}>
          <TextField label={L("వ్యాపారం పేరు", "Business name")} value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField
            label={L("చిరునామా", "Address")}
            value={f.address}
            onChange={(e) => set({ address: e.target.value })}
            multiline
            minRows={2}
          />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField
              label={L("ఫోన్", "Phone")}
              value={f.phone}
              onChange={(e) => set({ phone: e.target.value })}
              inputMode="tel"
              error={!phoneValid}
              helperText={L(`సాధారణంగా ${DEFAULT_PHONE}`, `Default ${DEFAULT_PHONE}`)}
            />
            <TextField
              label={L("FSSAI license నంబర్", "FSSAI licence number")}
              value={f.fssaiNumber}
              onChange={(e) => set({ fssaiNumber: e.target.value.replace(/\D/g, "").slice(0, 14) })}
              inputMode="numeric"
              helperText={L("14 అంకెలు", "14 digits")}
            />
          </Box>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField
              label={L("బ్రాండ్ పేరు", "Brand name")}
              value={f.brandName}
              onChange={(e) => set({ brandName: e.target.value })}
            />
            <TextField
              label={L("కంపెనీ చట్టపరమైన పేరు", "Legal company name")}
              value={f.legalName}
              onChange={(e) => set({ legalName: e.target.value })}
            />
          </Box>
          <FormControlLabel
            control={<Switch checked={f.legalNameOnDocs} onChange={(e) => set({ legalNameOnDocs: e.target.checked })} />}
            label={L(
              "బిల్లులు / కొటేషన్లపై కంపెనీ పేరు చూపించు (incorporation అయ్యాక ఆన్ చేయండి)",
              "Show the company name on invoices / quotations (turn on after incorporation)",
            )}
          />
          {f.legalNameOnDocs && (
            <Typography variant="body2" color="text.secondary">
              {L("బిల్లుపై ఇలా వస్తుంది", "Documents will show")}: <b>{docBrandLine(f.brandName, f.legalName, true)}</b>
            </Typography>
          )}
        </Section>

        <Section title="GST">
          <Alert severity={gstin && gstinValid ? "success" : "info"}>
            {gstin && gstinValid
              ? L("GSTIN ఉంది → GST ఆన్ అవుతుంది. రేటు మీరే నమోదు చేయండి.", "GSTIN entered → GST turns on. Type the rate yourself.")
              : L(
                  "GST registration వచ్చేవరకు ఖాళీగా వదలండి. GSTIN ఇచ్చినప్పుడే GST ఆన్ అవుతుంది.",
                  "Leave empty until GST registration. GST turns on only when a GSTIN is entered.",
                )}
          </Alert>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
            <TextField
              label="GSTIN"
              value={f.gstin}
              onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15) })}
              error={!gstinValid}
              helperText={!gstinValid ? L("15 అక్షరాలు కావాలి (ఉదా: 36ABCDE1234F1Z5)", "15 characters, e.g. 36ABCDE1234F1Z5") : " "}
            />
            <TextField
              label={L("GST రేటు %", "GST rate %")}
              value={f.gstRate}
              onChange={(e) => set({ gstRate: e.target.value })}
              inputMode="decimal"
              disabled={!gstin}
              helperText={gstin ? L("ఉదా: 5", "e.g. 5") : L("GSTIN తర్వాత", "after GSTIN")}
            />
          </Box>
        </Section>

        <Section title={L("బ్యాంక్ & UPI", "Bank & UPI")}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label={L("బ్యాంక్ పేరు", "Bank name")} value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} />
            <TextField
              label={L("ఖాతా నంబర్", "Account number")}
              value={f.bankAccount}
              onChange={(e) => set({ bankAccount: e.target.value.replace(/\s/g, "") })}
              inputMode="numeric"
            />
            <TextField
              label="IFSC"
              value={f.bankIfsc}
              onChange={(e) => set({ bankIfsc: e.target.value.toUpperCase() })}
              error={!ifscValid}
            />
            <TextField
              label="UPI ID"
              value={f.upiId}
              onChange={(e) => set({ upiId: e.target.value.trim() })}
              error={!upiValid}
              helperText={L("Invoice మీద UPI link / QR కి వాడతాం", "Used for the UPI link / QR on invoices")}
            />
          </Box>
        </Section>

        <Section title={L("లోగో & సంతకం", "Logo & signature")}>
          <ImagePicker label={L("లోగో", "Logo")} url={f.logoUrl} kind="logo" onUploaded={(url) => set({ logoUrl: url })} />
          <ImagePicker
            label={L("సంతకం", "Signature")}
            url={f.signatureUrl}
            kind="signature"
            onUploaded={(url) => set({ signatureUrl: url })}
          />
          <Typography variant="body2" color="text.secondary">
            {L("ఎక్కించిన తర్వాత కింద Save నొక్కండి.", "After uploading, press Save below.")}
          </Typography>
        </Section>

        <Section title={L("నిబంధనలు (Terms)", "Terms")}>
          <TextField
            label={L("కొటేషన్ షరతులు", "Quotation terms")}
            helperText={L("కొటేషన్ మీద ప్రింట్ అవుతాయి.", "Printed on quotations.")}
            value={f.terms}
            onChange={(e) => set({ terms: e.target.value })}
            multiline
            minRows={4}
          />
          <TextField
            label={L("బిల్ షరతులు", "Bill terms")}
            helperText={L("కొత్త బిల్లుల (invoice) మీద ప్రింట్ అవుతాయి — validity లైన్ వద్దు.", "Printed on new bills (invoices) — no validity line.")}
            value={f.invoiceTerms}
            onChange={(e) => set({ invoiceTerms: e.target.value })}
            multiline
            minRows={4}
            slotProps={{ htmlInput: { maxLength: 5000 } }}
            sx={{ mt: 2 }}
          />
        </Section>

        <Section title={L("నెల జీతం నియమాలు", "Monthly salary rules")}>
          <FormControlLabel
            control={
              <Switch checked={f.rules.deductAbsences} onChange={(e) => set({ rules: { ...f.rules, deductAbsences: e.target.checked } })} />
            }
            label={L("గైర్హాజరు / సెలవు రోజులకి జీతం కోత", "Cut pay for absent / leave days")}
          />
          {f.rules.deductAbsences && (
            <TextField
              label={L("నెలకి ఉచిత సెలవులు", "Free leave days per month")}
              value={f.freeLeaves}
              onChange={(e) => set({ freeLeaves: e.target.value })}
              inputMode="numeric"
              helperText={L("ఇన్ని రోజుల వరకు కోత లేదు", "No cut up to this many days")}
              sx={{ maxWidth: 260 }}
            />
          )}
          <FormControlLabel
            control={<Switch checked={f.rules.overtime} onChange={(e) => set({ rules: { ...f.rules, overtime: e.target.checked } })} />}
            label={L("Overtime (OT) చెల్లించు", "Pay overtime (OT)")}
          />
          <Typography variant="body2" color="text.secondary">
            {L(
              "Advances ఎప్పుడూ జీతం నుండి తీసేస్తాం. మీ నియమం: సెలవులకి కోత లేదు, OT లేదు.",
              "Advances are always deducted from salary. Your rule: no cut for leave, no OT.",
            )}
          </Typography>
        </Section>

        <Section title={L("లెక్కలు: ఆటోమేటిక్ / మాన్యువల్", "Calculations: automatic / manual")}>
          <Typography variant="body2" color="text.secondary">
            {L(
              "ఆటోమేటిక్ = server లెక్కిస్తుంది. మాన్యువల్ = మీరు చేతితో పెడతారు (కారణంతో). ఏ mode లో ఉన్నా ఒక్కో document ని చేతితో మార్చవచ్చు.",
              "Automatic = the server calculates. Manual = you type the value (with a reason). Any single document can still be changed by hand.",
            )}
          </Typography>
          {CALC_AREAS.map((area) => (
            <FormControlLabel
              key={area}
              control={
                <Switch
                  checked={f.calcModes[area] === "auto"}
                  onChange={(e) => set({ calcModes: { ...f.calcModes, [area]: e.target.checked ? "auto" : "manual" } })}
                />
              }
              label={`${L(AREA_LABEL[area].te, AREA_LABEL[area].en)} — ${
                f.calcModes[area] === "auto" ? L("ఆటోమేటిక్", "Automatic") : L("మాన్యువల్", "Manual")
              }`}
            />
          ))}
          <FormControlLabel
            control={<Switch checked={f.managerCanOverride} onChange={(e) => set({ managerCanOverride: e.target.checked })} />}
            label={L("మేనేజర్ కూడా చేతితో మార్చవచ్చు", "Managers may enter values by hand")}
          />
          <Typography variant="body2" color="text.secondary">
            {L("సిబ్బంది (staff) ఎప్పుడూ మార్చలేరు.", "Staff can never override.")}
          </Typography>
        </Section>

        <Section title={L("లక్ష్య బోర్డు (అందరికీ మొదటి పేజీ)", "Target board (everyone's first screen)")}>
          <FormControlLabel
            control={
              <Switch
                checked={f.targetBoardShowRupeesToAll}
                onChange={(e) => set({ targetBoardShowRupeesToAll: e.target.checked })}
              />
            }
            label={L("అందరికీ ₹ చూపించు", "Show ₹ to everyone")}
          />
          <Typography variant="body2" color="text.secondary">
            {f.targetBoardShowRupeesToAll
              ? L(
                  "మేనేజర్, సిబ్బంది కూడా అమ్మకాల ₹ అంకెలు (లక్ష్యం, వచ్చింది, రోజుకి ఇంకా ₹) చూస్తారు. లాభం మాత్రం మీకే.",
                  "Managers and staff also see the ₹ sales figures (target, achieved, ₹ needed per day). Profit stays yours only.",
                )
              : L(
                  "మేనేజర్, సిబ్బందికి % మరియు progress మాత్రమే కనిపిస్తాయి (₹ అంకెలు, లాభం కనిపించవు).",
                  "Managers and staff see percentages and progress only (no ₹ figures, no profit).",
                )}
          </Typography>
        </Section>

        <Section title={L("ఎంక్వైరీలు: ఆటో అప్పగింత, స్పందన సమయం", "Leads: auto-assign and response time")}>
          <Typography variant="body2" color="text.secondary">
            {L("ఈ భాగానికి దాని సొంత Save బటన్ ఉంది.", "This part has its own Save button.")}
          </Typography>
          <LeadAssignCard />
        </Section>

        <Section title={L("కొలతల జాబితా (Units)", "Units of measure")}>
          <UomCard />
        </Section>

        <Section title={L("సరుకుల నిల్వ (Stock)", "Stock")}>
          <FormControlLabel
            control={<Switch checked={f.autoStockDeduct} onChange={(e) => set({ autoStockDeduct: e.target.checked })} />}
            label={L(
              "Event పూర్తయితే సరుకులు stock నుండి దానంతట అదే తగ్గించు",
              "Take groceries out of stock automatically when an event is completed",
            )}
          />
          <Typography variant="body2" color="text.secondary">
            {L(
              "సరుకుల వస్తువులని stock వస్తువులతో 'సరుకుల జాబితా' పేజీలో జత చేయండి. జత చేయనివి వదిలేస్తాం.",
              "Link grocery items to stock items on the 'Grocery items' page. Unlinked items are skipped.",
            )}
          </Typography>
          <ExpiryAlertCard />
          <StockReserveCard />
          <PoApprovalCard />
          <SodCard />
          <StockAdjustCard />
        </Section>

        <Section title={L("నెల fixed ఖర్చులు & ప్లేటు ఖర్చు", "Fixed monthly costs & plate cost")}>
          <Typography variant="body2" color="text.secondary">
            {L(
              "Break-even, సూచించే ధర ఈ అంకెలతో server లెక్కిస్తుంది.",
              "The server uses these for break-even and the suggested menu price.",
            )}
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label={L("వంటశాల అద్దె (నెలకి ₹)", "Kitchen rent (₹ / month)")} value={f.kitchenRent} onChange={(e) => set({ kitchenRent: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField label={L("ఇతర fixed ఖర్చులు (నెలకి ₹)", "Other fixed costs (₹ / month)")} value={f.otherFixed} onChange={(e) => set({ otherFixed: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField label={L("లక్ష్య లాభం % (సూచించే ధరకి)", "Target margin % (suggested price)")} value={f.targetMarginPct} onChange={(e) => set({ targetMarginPct: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField label={L("ప్లేటుకి కూలీ ₹", "Labour per plate ₹")} value={f.labourPerPlate} onChange={(e) => set({ labourPerPlate: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField label={L("ప్లేటుకి ఇతర ఖర్చు ₹", "Overhead per plate ₹")} value={f.overheadPerPlate} onChange={(e) => set({ overheadPerPlate: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField label={L("లంచ్ బాక్స్ ధర ₹", "Lunch box price ₹")} value={f.lunchBoxPrice} onChange={(e) => set({ lunchBoxPrice: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          </Box>
        </Section>

        <Section title={L("సరఫరాదారులు & reviews", "Vendors & reviews")}>
          <TextField
            label={L("కొనుగోలు ధర ఎంత % పెరిగితే హెచ్చరిక", "Alert when a purchase rate rises by %")}
            value={f.vendorPriceAlertPct}
            onChange={(e) => set({ vendorPriceAlertPct: e.target.value })}
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
            sx={{ maxWidth: 360 }}
          />
          <TextField
            label={L("Google review link", "Google review link")}
            value={f.googleReviewUrl}
            onChange={(e) => set({ googleReviewUrl: e.target.value })}
            placeholder="https://g.page/r/…/review"
            helperText={L("Event తర్వాత review అడిగే మెసేజ్‌లో ఈ link వెళ్తుంది.", "Sent in the review request after an event.")}
          />
          {!f.googleReviewUrl.trim() && (
            <Alert severity="warning">
              {L("Google review link లేదు — review messages పంపబడవు.", "No Google review link — review messages will not be sent.")}
            </Alert>
          )}
        </Section>

        <Section title={L("WhatsApp templates (Meta)", "WhatsApp templates (Meta)")}>
          <Typography variant="body2" color="text.secondary">
            {L(
              "కస్టమర్ 24 గంటల్లో మెసేజ్ చేయకపోతే Meta approve చేసిన template తోనే పంపాలి. ప్రతి మెసేజ్ రకానికి Meta లో ఉన్న template పేరు రాయండి. పేరు లేకపోతే మెసేజ్ \"template కావాలి\" అని మీ ఆమోదం జాబితాలో ఆగుతుంది.",
              "Outside the 24-hour window WhatsApp only accepts Meta-approved templates. Enter the Meta template name for each message type; without one the message waits in your approvals as \"template needed\".",
            )}
          </Typography>
          {MESSAGE_TYPES.every((m) => !(f.templates[m.key] ?? "").trim()) && (
            <Alert severity="warning">
              {L("Templates ఏవీ లేవు — WhatsApp messages approval కోసం ఆగుతాయి.", "No templates set — WhatsApp messages will wait for your approval.")}
            </Alert>
          )}
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            {MESSAGE_TYPES.map((m) => {
              const v = f.templates[m.key] ?? "";
              const bad = v.trim() !== "" && !TEMPLATE_RE.test(v.trim());
              return (
                <TextField
                  key={m.key}
                  size="small"
                  label={L(m.te, m.en)}
                  value={v}
                  error={bad}
                  placeholder={`suseela_${m.key.split(".")[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`}
                  helperText={bad ? L("చిన్న అక్షరాలు, అంకెలు, _ మాత్రమే", "a-z, 0-9 and _ only") : " "}
                  onChange={(e) => set({ templates: { ...f.templates, [m.key]: e.target.value } })}
                />
              );
            })}
          </Box>
        </Section>

        <Section title={L("లాభం & season బరువులు", "Profit & season weights")}>
          <TextField
            label={L("లాభ లక్ష్యం %", "Profit target %")}
            value={f.profitMarginPct}
            onChange={(e) => set({ profitMarginPct: e.target.value })}
            inputMode="decimal"
            sx={{ maxWidth: 200 }}
          />
          <Typography variant="body2" color="text.secondary">
            {L(
              "ఏ నెలలో ఎక్కువ పెళ్ళిళ్ళు / events ఉంటాయో ఆ నెలకి ఎక్కువ బరువు ఇవ్వండి (ఉదా: 2 = రెట్టింపు).",
              "Give busier months a bigger weight (e.g. 2 = twice a normal month).",
            )}
          </Typography>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(6, 1fr)" } }}>
            {f.seasonWeights.map((w, i) => (
              <TextField
                key={i}
                size="small"
                label={monthName(i, lang)}
                value={w}
                inputMode="decimal"
                onChange={(e) => set({ seasonWeights: f.seasonWeights.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            ))}
          </Box>
        </Section>
      </Box>

      <Box sx={{ position: "sticky", bottom: 0, py: 2, mt: 2, bgcolor: "background.default", zIndex: 1 }}>
        <ErrorBox message={error} />
        {savedMsg && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {savedMsg}
          </Alert>
        )}
        <Button variant="contained" size="large" onClick={save} disabled={saving}>
          {saving ? L("Save అవుతోంది…", "Saving…") : L("అన్నీ Save చేయి", "Save all")}
        </Button>
      </Box>
    </Box>
  );
}
