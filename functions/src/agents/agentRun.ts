import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { FirestoreCollections } from "../shared/firestorePaths";
import { BusinessSettings, loadSettings } from "../shared/settings";
import { todayIST } from "../shared/istDate";

export const AGENT_IDS = [
  "morningSummary",
  "duesCollector",
  "enquiryFollowup",
  "eventReadiness",
  "cookingLearner",
  "stockWatch",
  "priceWatch",
  "targetPlanner",
  "adsAnalyst",
  "feedbackReviews",
  "backup",
  "menuPriceReview",
  "integrityCheck",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type RunTrigger = "schedule" | "manual" | "event";

export interface AgentContext {
  agentId: AgentId;
  runId: string;
  trigger: RunTrigger;
  now: Date;
  today: string;
  settings: BusinessSettings;
  /** extra input for event-driven runs (e.g. the purchase id for priceWatch) */
  input: Record<string, string>;
}

export interface AgentResult {
  summary: string;
  itemsHandled: number;
  alerts: string[];
}

export type AgentJob = (ctx: AgentContext) => Promise<AgentResult>;

export async function isAgentEnabled(agentId: AgentId): Promise<boolean> {
  const snap = await getFirestore().collection(FirestoreCollections.AGENT_SETTINGS).doc(agentId).get();
  return snap.data()?.enabled !== false; // default: on
}

/**
 * Runs one agent and records it in agentRuns. Scheduled / event runs respect
 * agentSettings/{id}.enabled; a manual "run now" from the owner always runs.
 * Never throws (a failing agent is recorded as failed).
 */
export async function runAgent(agentId: AgentId, trigger: RunTrigger, job: AgentJob, input: Record<string, string> = {}): Promise<string> {
  const db = getFirestore();
  const ref = db.collection(FirestoreCollections.AGENT_RUNS).doc();
  const now = new Date();
  if (trigger !== "manual" && !(await isAgentEnabled(agentId))) {
    await ref.set({ agentId, trigger, status: "skipped", summary: "disabled in agentSettings", startedAt: FieldValue.serverTimestamp(), finishedAt: FieldValue.serverTimestamp(), itemsHandled: 0, alerts: [] });
    return ref.id;
  }
  await ref.set({ agentId, trigger, status: "running", startedAt: FieldValue.serverTimestamp(), input });
  try {
    const settings = await loadSettings();
    const r = await job({ agentId, runId: ref.id, trigger, now, today: todayIST(now), settings, input });
    await ref.update({ status: "ok", summary: r.summary, itemsHandled: r.itemsHandled, alerts: r.alerts, finishedAt: FieldValue.serverTimestamp() });
    await recordLastRun(agentId, ref.id, "ok");
  } catch (e) {
    logger.error(`agent ${agentId} failed`, e);
    await ref.update({ status: "failed", summary: e instanceof Error ? e.message : String(e), finishedAt: FieldValue.serverTimestamp(), itemsHandled: 0, alerts: [] });
    await recordLastRun(agentId, ref.id, "failed");
  }
  return ref.id;
}

/** agentSettings/{id}.lastRun — lets the morning summary report e.g. a failed backup without a query index. */
async function recordLastRun(agentId: AgentId, runId: string, status: "ok" | "failed"): Promise<void> {
  await getFirestore()
    .collection(FirestoreCollections.AGENT_SETTINGS)
    .doc(agentId)
    .set({ lastRun: { runId, status, at: FieldValue.serverTimestamp() } }, { merge: true });
}
