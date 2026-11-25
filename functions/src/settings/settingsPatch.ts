/** Pure validation of a saveBusinessSettings request → the Firestore update. CalcError-free: returns errors. */
import { asObj, Doc } from "../shared/coerce";
import { parseStockAdjustPatch } from "../inventory/adjustRules";
import { parseFoodSafety } from "../safety/safetyRules";
import { parseAllergenList } from "../safety/allergenRules";
import { normalizeSettings } from "../shared/settingsModel";
import { timelineMinutes } from "../calc/timeline";
import { CALC_MODE_AREAS, normalizeCalcModes } from "../shared/overridePolicy";
import { isValidUpiId } from "../integrations/upi";
import type { Bilingual } from "../shared/errors";
import { parseLeadAssignPatch } from "../leads/assignRules";
import { parseLeadTatPatch } from "../leads/tatRules";
import { parseExpiryAlertPatch } from "../stock/batchRules";
import { parsePoApprovalPatch } from "../procure/procureRules";
import { parseBillMatchPatch } from "../procure/matchRules";
import { parseSodPatch } from "../roles/permRules";
import { parseStockReservePatch } from "../stock/reservationRules";
import { parseUomPacksPatch } from "../shared/uomRules";

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const FSSAI_RE = /^\d{14}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const TEXT_FIELDS: Record<string, number> = {
  legalName: 200,
  brandName: 200,
  name: 200,
  logoUrl: 2000,
  address: 1000,
  phone: 30,
  ownerPhone: 30,
  fssaiNumber: 20,
  upiId: 260,
  signatureUrl: 2000,
  terms: 5000,
  invoiceTerms: 5000,
  googleReviewUrl: 2000,
};

export function applySettingsPatch(current: Doc | undefined, patch: Doc): { update: Doc; errors: Bilingual[] } {
  const errors: Bilingual[] = [];
  const update: Doc = {};
  const err = (te: string, en: string) => errors.push({ te, en });

  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v !== "string" || v.length > max) {
      err(`"${k}" సరిగా లేదు.`, `${k} must be text up to ${max} characters.`);
      continue;
    }
    update[k] = v.trim();
  }
  if (typeof update.upiId === "string" && update.upiId && !isValidUpiId(update.upiId as string)) err("UPI ID సరిగా లేదు (ఉదా: name@bank).", "UPI ID is not valid (e.g. name@bank).");
  if (typeof update.fssaiNumber === "string" && update.fssaiNumber && !FSSAI_RE.test(update.fssaiNumber as string)) err("FSSAI number 14 అంకెలు ఉండాలి.", "FSSAI number must be 14 digits.");

  if ("bank" in patch) {
    const b = asObj(patch.bank);
    const bank = { name: String(b.name ?? "").trim(), account: String(b.account ?? "").replace(/\s/g, ""), ifsc: String(b.ifsc ?? "").trim().toUpperCase() };
    if (bank.account && !/^\d{6,20}$/.test(bank.account)) err("Bank account number సరిగా లేదు.", "Bank account number is not valid.");
    if (bank.ifsc && !IFSC_RE.test(bank.ifsc)) err("IFSC code సరిగా లేదు.", "IFSC code is not valid.");
    update.bank = bank;
  }
  if ("calcModes" in patch) {
    const m = asObj(patch.calcModes);
    const bad = Object.entries(m).filter(([k, v]) => !(CALC_MODE_AREAS as readonly string[]).includes(k) || (v !== "auto" && v !== "manual"));
    if (bad.length || typeof patch.calcModes !== "object" || patch.calcModes === null) err("లెక్క విధానం (ఆటోమేటిక్ / మాన్యువల్) సరిగా లేదు.", `calcModes keys must be ${CALC_MODE_AREAS.join(", ")} with "auto" or "manual".`);
    else update.calcModes = { ...normalizeCalcModes(current?.calcModes), ...m };
  }
  if ("managerCanOverride" in patch) {
    if (typeof patch.managerCanOverride !== "boolean") err("managerCanOverride true లేదా false గా ఉండాలి.", "managerCanOverride must be true or false.");
    else update.managerCanOverride = patch.managerCanOverride;
  }
  if ("legalNameOnDocs" in patch) {
    if (typeof patch.legalNameOnDocs !== "boolean") err("legalNameOnDocs true లేదా false గా ఉండాలి.", "legalNameOnDocs must be true or false.");
    else update.legalNameOnDocs = patch.legalNameOnDocs;
  }
  if ("targetBoardShowRupeesToAll" in patch) {
    if (typeof patch.targetBoardShowRupeesToAll !== "boolean") err("targetBoardShowRupeesToAll true లేదా false గా ఉండాలి.", "targetBoardShowRupeesToAll must be true or false.");
    else update.targetBoardShowRupeesToAll = patch.targetBoardShowRupeesToAll;
  }
  if ("leadAssign" in patch) {
    const r = parseLeadAssignPatch(patch.leadAssign);
    if (!r.ok) err("ఎంక్వైరీ ఆటో అప్పగింత వివరాలు సరిగా లేవు (ఆన్ చేయాలంటే కనీసం ఒకరిని ఎంచుకోండి).", r.error);
    else update.leadAssign = r.value;
  }
  if ("leadTat" in patch) {
    const r = parseLeadTatPatch(patch.leadTat);
    if (!r.ok) err("ఎంక్వైరీ స్పందన సమయం సరిగా లేదు (5 నుండి 1440 నిమిషాలు).", r.error);
    else update.leadTat = r.value;
  }
  if ("expiryAlert" in patch) {
    const r = parseExpiryAlertPatch(patch.expiryAlert);
    if (!r.ok) err("గడువు హెచ్చరిక వివరాలు సరిగా లేవు (1 నుండి 90 రోజులు).", r.error);
    else update.expiryAlert = r.value;
  }
  if ("poApproval" in patch) {
    const r = parsePoApprovalPatch(patch.poApproval);
    if (!r.ok) err("కొనుగోలు ఆర్డర్ ఆమోదం వివరాలు సరిగా లేవు (పరిమితి 0 లేదా ఎక్కువ).", r.error);
    else update.poApproval = r.value;
  }
  if ("foodSafety" in patch) {
    const r = parseFoodSafety(patch.foodSafety);
    if (!r.ok) err(r.te, r.en);
    else update.foodSafety = r.value;
  }
  if ("allergens" in patch) {
    const r = parseAllergenList(patch.allergens);
    if (!r.ok) err(r.te, r.en);
    else update.allergens = r.value;
  }
  if ("stockAdjust" in patch) {
    const r = parseStockAdjustPatch(patch.stockAdjust);
    if (!r.ok) err("స్టాక్ సవరణ ఆమోదం వివరాలు సరిగా లేవు (0 నుండి 100 శాతం).", r.error);
    else update.stockAdjust = r.value;
  }
  if ("sod" in patch) {
    const r = parseSodPatch(patch.sod);
    if (!r.ok) err("బాధ్యతల విభజన వివరాలు సరిగా లేవు.", r.error);
    else update.sod = r.value;
  }
  if ("billMatch" in patch) {
    const r = parseBillMatchPatch(patch.billMatch);
    if (!r.ok) err("బిల్ సరిపోల్చే వివరాలు సరిగా లేవు (ధర తేడా 0 నుండి 20%).", r.error);
    else update.billMatch = r.value;
  }
  if ("uomPacks" in patch) {
    const r = parseUomPacksPatch(patch.uomPacks);
    if (!r.ok) err("కొలతల జాబితా సరిగా లేదు (పేరు 30 అక్షరాల లోపు, ఒకే పేరు రెండుసార్లు వద్దు, Kg / Gram లాంటివి ఎప్పుడూ ఉంటాయి).", r.error);
    else update.uomPacks = r.value;
  }
  if ("stockReserve" in patch) {
    const r = parseStockReservePatch(patch.stockReserve);
    if (!r.ok) err("స్టాక్ రిజర్వ్ వివరాలు సరిగా లేవు (1 నుండి 90 రోజులు).", r.error);
    else update.stockReserve = r.value;
  }
  if ("autoStockDeduct" in patch) {
    if (typeof patch.autoStockDeduct !== "boolean") err("autoStockDeduct true లేదా false గా ఉండాలి.", "autoStockDeduct must be true or false.");
    else update.autoStockDeduct = patch.autoStockDeduct;
  }
  if ("timelineDefaults" in patch) {
    if (patch.timelineDefaults === null) update.timelineDefaults = null;
    else {
      try {
        timelineMinutes(patch.timelineDefaults);
        update.timelineDefaults = patch.timelineDefaults;
      } catch (e) {
        err("Timeline నిమిషాలు సరిగా లేవు (0–600 పూర్ణ సంఖ్యలు).", e instanceof Error ? e.message : "timelineDefaults is not valid.");
      }
    }
  }
  if ("photoUrls" in patch) {
    const u = patch.photoUrls;
    if (!Array.isArray(u) || u.length > 50 || !u.every((x) => typeof x === "string" && x.length <= 2000)) err("ఫోటో links సరిగా లేవు.", "photoUrls must be a list of up to 50 URLs.");
    else update.photoUrls = u;
  }
  if ("profitMarginPct" in patch) {
    const v = patch.profitMarginPct;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) err("లాభం % 0 నుండి 100 మధ్య ఉండాలి.", "profitMarginPct must be 0–100.");
    else update.profitMarginPct = v;
  }
  if ("fixedMonthlyCosts" in patch) {
    // R10-5: { kitchenRent, other } (a plain number is still accepted and stored as { kitchenRent: 0, other })
    const v = patch.fixedMonthlyCosts;
    const ok = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
    if (typeof v === "number") {
      if (!ok(v)) err("నెలవారీ fixed ఖర్చులు 0 లేదా ఎక్కువ ఉండాలి.", "fixedMonthlyCosts must be ≥ 0.");
      else update.fixedMonthlyCosts = { kitchenRent: 0, other: v };
    } else {
      const o = asObj(v);
      if (!ok(o.kitchenRent) || !(o.other === undefined || ok(o.other))) err("వంటశాల అద్దె, ఇతర fixed ఖర్చులు 0 లేదా ఎక్కువ ఉండాలి.", "fixedMonthlyCosts must be { kitchenRent ≥ 0, other ≥ 0 }.");
      else update.fixedMonthlyCosts = { kitchenRent: o.kitchenRent, other: o.other ?? 0 };
    }
  }
  for (const k of ["priceRiseAlertPct", "vendorPriceAlertPct"]) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) err("ధర పెరుగుదల హెచ్చరిక % 0–100 మధ్య ఉండాలి.", `${k} must be 0–100.`);
    else update.vendorPriceAlertPct = update.priceRiseAlertPct = v;
  }
  if ("targetMarginPct" in patch) {
    const v = patch.targetMarginPct;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 95) err("లక్ష్య లాభం % 0–95 మధ్య ఉండాలి.", "targetMarginPct must be 0–95.");
    else update.targetMarginPct = v;
  }
  for (const k of ["labourPerPlate", "overheadPerPlate", "lunchBoxPrice"]) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100000) err(`"${k}" 0 లేదా ఎక్కువ రూపాయలు ఉండాలి.`, `${k} must be a rupee amount ≥ 0.`);
    else update[k] = v;
  }
  if ("whatsappTemplates" in patch) {
    const t = patch.whatsappTemplates;
    const entries = t && typeof t === "object" && !Array.isArray(t) ? Object.entries(t as Doc) : null;
    const valid = entries !== null && entries.length <= 50 && entries.every(([k, v]) => /^[A-Za-z0-9._-]{1,60}$/.test(k) && typeof v === "string" && (v === "" || /^[a-z0-9_]{1,512}$/.test(v)));
    if (!valid) err("WhatsApp template పేర్లు సరిగా లేవు (చిన్న అక్షరాలు, అంకెలు, _ మాత్రమే).", "whatsappTemplates must map a message type to a Meta template name (a-z, 0-9, _).");
    else update.whatsappTemplates = Object.fromEntries(entries!.filter(([, v]) => v !== ""));
  }
  if ("seasonWeights" in patch) {
    const w = patch.seasonWeights;
    if (!Array.isArray(w) || w.length !== 12 || !w.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0) || !w.some((x) => (x as number) > 0)) {
      err("12 నెలల season weights (0 లేదా ఎక్కువ, అన్నీ 0 కాకూడదు) ఇవ్వాలి.", "seasonWeights must be 12 numbers ≥ 0, not all 0.");
    } else update.seasonWeights = w;
  }
  if ("monthlyPayRules" in patch) {
    const r = asObj(patch.monthlyPayRules);
    const ok = typeof r.deductAbsences === "boolean" && typeof r.overtime === "boolean" && typeof r.freeLeaves === "number" && Number.isFinite(r.freeLeaves) && r.freeLeaves >= 0 && r.freeLeaves <= 31;
    if (!ok) err("జీతం నియమాలు సరిగా లేవు.", "monthlyPayRules must be { deductAbsences: bool, freeLeaves: 0–31, overtime: bool }.");
    else update.monthlyPayRules = { deductAbsences: r.deductAbsences, freeLeaves: r.freeLeaves, overtime: r.overtime };
  }

  // GSTIN: entering a valid 15-char GSTIN turns GST on with the rate the owner typed; clearing it turns GST off.
  if ("gstin" in patch) {
    const g = patch.gstin === null ? "" : patch.gstin;
    if (typeof g !== "string") err("GSTIN సరిగా లేదు.", "gstin must be text.");
    else {
      const gstin = g.trim().toUpperCase();
      if (gstin === "") {
        update.gstin = "";
        update.gstRegistered = false;
        update.defaultGstRate = 0;
      } else if (!GSTIN_RE.test(gstin)) {
        err("GSTIN 15 అక్షరాలు, సరైన రూపంలో ఉండాలి (ఉదా: 36ABCDE1234F1Z5).", "GSTIN must be a valid 15-character GSTIN (e.g. 36ABCDE1234F1Z5).");
      } else {
        const rateRaw = "gstRate" in patch ? patch.gstRate : current?.defaultGstRate;
        if (typeof rateRaw !== "number" || !Number.isFinite(rateRaw) || rateRaw < 0 || rateRaw > 28) {
          err("GST rate (0 నుండి 28 మధ్య) కూడా ఇవ్వండి.", "gstRate (0–28) is required with the GSTIN.");
        } else {
          update.gstin = gstin;
          update.gstRegistered = true;
          update.defaultGstRate = rateRaw;
        }
      }
    }
  } else if ("gstRate" in patch) {
    const r = patch.gstRate;
    const registered = current?.gstRegistered === true;
    if (!registered) err("ముందు GSTIN ఇవ్వండి; అప్పుడే GST rate పెట్టగలం.", "Enter the GSTIN before setting a GST rate.");
    else if (typeof r !== "number" || !Number.isFinite(r) || r < 0 || r > 28) err("GST rate 0 నుండి 28 మధ్య ఉండాలి.", "gstRate must be 0–28.");
    else update.defaultGstRate = r;
  }
  return { update, errors };
}

export interface SetupProgress {
  business: boolean;
  bank: boolean;
  signature: boolean;
  staff: boolean;
  photos: boolean;
  /** whole percent of the 5 steps done */
  pct: number;
}

/**
 * Setup wizard progress (api-contract decision 7). business = name + phone + address;
 * bank = account + IFSC, or a UPI ID; signature = signatureUrl; staff = at least one staff record;
 * photos = logo or at least one food photo URL. GST is optional and not a step.
 */
export function setupProgress(raw: Doc, hasStaff: boolean): SetupProgress {
  const s = normalizeSettings(raw);
  const photoUrls = Array.isArray(raw.photoUrls) ? raw.photoUrls.filter((u) => typeof u === "string" && u) : [];
  const steps = {
    business: !!(s.name && s.phone && s.address),
    bank: !!((s.bank.account && s.bank.ifsc) || s.upiId),
    signature: !!s.signatureUrl,
    staff: hasStaff,
    photos: !!s.logoUrl || photoUrls.length > 0,
  };
  const done = Object.values(steps).filter(Boolean).length;
  return { ...steps, pct: Math.round((done / 5) * 100) };
}

export function progressAfter(current: Doc | undefined, update: Doc, hasStaff: boolean): SetupProgress {
  return setupProgress({ ...(current ?? {}), ...update }, hasStaff);
}
