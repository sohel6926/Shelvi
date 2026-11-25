import { collection, limit, onSnapshot, orderBy, query, where, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import type { Bilingual } from "../i18n/LanguageContext";

/** The 13 agents of docs/api-contract.md, with owner-facing names. */
export const AGENTS: { id: string; name: Bilingual; about: Bilingual }[] = [
  { id: "morningSummary", name: { te: "ఉదయం సారాంశం", en: "Morning summary" }, about: { te: "రోజు మొదట్లో నిన్నటి లెక్కలు, ఈరోజు events", en: "Yesterday's numbers and today's events, every morning" } },
  { id: "duesCollector", name: { te: "బాకీల వసూలు", en: "Dues collector" }, about: { te: "బాకీ ఉన్న customers కి గుర్తు (మీ అనుమతితో)", en: "Reminds customers with dues (after your approval)" } },
  { id: "enquiryFollowup", name: { te: "Enquiry follow-up", en: "Enquiry follow-up" }, about: { te: "కొత్త leads కి సమయానికి follow-up", en: "Follows up new leads on time" } },
  { id: "eventReadiness", name: { te: "Event సిద్ధత", en: "Event readiness" }, about: { te: "Event ముందు staff, సరుకులు, వాహనం సిద్ధమా అని చూస్తుంది", en: "Checks staff, stock and vehicle before each event" } },
  { id: "cookingLearner", name: { te: "వంట లెక్క నేర్చుకోవడం", en: "Cooking learner" }, about: { te: "మిగిలిన ఆహారం బట్టి ఎంత వండాలో నేర్చుకుంటుంది", en: "Learns how much to cook from leftovers" } },
  { id: "stockWatch", name: { te: "సరుకుల కాపలా", en: "Stock watch" }, about: { te: "తక్కువ stock, గడువు దగ్గర పడిన సరుకులు", en: "Low stock and items near expiry" } },
  { id: "priceWatch", name: { te: "ధరల కాపలా", en: "Price watch" }, about: { te: "Vendor ధరలు పెరిగితే హెచ్చరిక", en: "Warns when vendor prices rise" } },
  { id: "targetPlanner", name: { te: "Target planner", en: "Target planner" }, about: { te: "నెల ముగియగానే మిగతా నెలల targets మళ్ళీ పంచుతుంది", en: "Re-plans the remaining months after each month" } },
  { id: "adsAnalyst", name: { te: "Ads విశ్లేషణ", en: "Ads analyst" }, about: { te: "ఏ ad కి డబ్బు వృథా అవుతోందో చెబుతుంది", en: "Shows which ads waste money" } },
  { id: "feedbackReviews", name: { te: "Feedback & reviews", en: "Feedback & reviews" }, about: { te: "Event తర్వాత feedback, Google review అడగడం", en: "Asks for feedback and Google reviews after events" } },
  { id: "backup", name: { te: "Backup", en: "Backup" }, about: { te: "రోజూ రాత్రి data backup", en: "Nightly data backup" } },
  { id: "menuPriceReview", name: { te: "Menu ధర సమీక్ష", en: "Menu price review" }, about: { te: "Menu తేదీ నుండి 12 నెలలకి ధర గుర్తు", en: "Reminds you to review prices 12 months after the menu date" } },
  { id: "integrityCheck", name: { te: "లెక్కల check", en: "Integrity check" }, about: { te: "రాత్రి invoices, payments సరిపోతున్నాయో చూస్తుంది", en: "Checks invoices and payments add up, every night" } },
];

export interface AgentSetting {
  enabled: boolean;
  schedule: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: string;
  summary: string;
  itemsHandled: number;
}

export interface OutboxMessage {
  id: string;
  channel: string;
  to: string;
  template: string;
  params: Record<string, unknown>;
  relatedType: string;
  relatedId: string;
  status: string;
  createdAt: Date | null;
  /** R10-8: held because no Meta template is set ("template-missing" / holdTe "template కావాలి"). */
  holdReason: string;
  holdTe: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
}

export function subscribeAgentSettings(
  onData: (byId: Record<string, AgentSetting>) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, "agentSettings"),
    (snap) => {
      const map: Record<string, AgentSetting> = {};
      for (const d of snap.docs) {
        const data = d.data();
        // Missing / anything but false = on (contract audit fix 7).
        map[d.id] = { enabled: data.enabled !== false, schedule: str(data.schedule) };
      }
      onData(map);
    },
    (e) => onError?.(e),
  );
}

/** Latest run per agent, from the most recent 200 runs. */
export function subscribeLatestRuns(
  onData: (byAgent: Record<string, AgentRun>) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "agentRuns"), orderBy("startedAt", "desc"), limit(200)),
    (snap) => {
      const map: Record<string, AgentRun> = {};
      for (const d of snap.docs) {
        const data = d.data();
        const agentId = str(data.agentId);
        if (!agentId || map[agentId]) continue;
        map[agentId] = {
          id: d.id,
          agentId,
          startedAt: toDate(data.startedAt),
          finishedAt: toDate(data.finishedAt),
          status: str(data.status),
          summary: str(data.summary),
          itemsHandled: num(data.itemsHandled),
        };
      }
      onData(map);
    },
    (e) => onError?.(e),
  );
}

export function subscribeApprovals(onData: (rows: OutboxMessage[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "messagesOutbox"), where("status", "==", "needs-approval")),
    (snap) =>
      onData(
        snap.docs
          .map((d) => {
            const m: DocumentData = d.data();
            return {
              id: d.id,
              channel: str(m.channel) || "whatsapp",
              to: str(m.to),
              template: str(m.template),
              params: m.params && typeof m.params === "object" ? (m.params as Record<string, unknown>) : {},
              relatedType: str(m.relatedType),
              relatedId: str(m.relatedId),
              status: str(m.status),
              createdAt: toDate(m.createdAt),
              holdReason: str(m.holdReason),
              holdTe: str(m.holdTe),
            };
          })
          .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
      ),
    (e) => onError?.(e),
  );
}
