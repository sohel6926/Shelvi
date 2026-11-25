import type { LeadSource, LeadStatus } from "../../data/leadsRepository";

/** Telugu / English names shared by the leads list, the pipeline board and the auto-assign settings. */
export const SOURCE_LABEL: Record<LeadSource, { te: string; en: string }> = {
  instagram: { te: "Instagram", en: "Instagram" },
  facebook: { te: "Facebook", en: "Facebook" },
  google: { te: "Google", en: "Google" },
  referral: { te: "తెలిసినవారు", en: "Referral" },
  walkin: { te: "నేరుగా వచ్చారు", en: "Walk-in" },
  justdial: { te: "JustDial", en: "JustDial" },
  other: { te: "ఇతర", en: "Other" },
};

export const STATUS_LABEL: Record<LeadStatus, { te: string; en: string; color: "default" | "info" | "warning" | "success" | "error" }> = {
  new: { te: "కొత్తది", en: "New", color: "info" },
  assigned: { te: "అప్పగించాం", en: "Assigned", color: "info" },
  contacted: { te: "మాట్లాడాం", en: "Contacted", color: "default" },
  requirement: { te: "అవసరం తెలిసింది", en: "Requirement", color: "default" },
  tasting: { te: "రుచి చూపించాం", en: "Tasting", color: "warning" },
  qualified: { te: "బుక్ అయ్యే అవకాశం", en: "Qualified", color: "warning" },
  quoted: { te: "కొటేషన్ ఇచ్చాం", en: "Quoted", color: "warning" },
  won: { te: "బుక్ అయింది", en: "Won", color: "success" },
  lost: { te: "పోయింది", en: "Lost", color: "error" },
  duplicate: { te: "రెండోసారి వచ్చింది", en: "Duplicate", color: "default" },
  invalid: { te: "చెల్లనిది", en: "Invalid", color: "default" },
};
