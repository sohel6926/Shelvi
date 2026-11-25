import { REGION, TIME_ZONE } from "../setup";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { DocumentSnapshot } from "firebase-admin/firestore";
import { AgentId, runAgent } from "./agentRun";
import { AGENT_JOBS, AGENT_SCHEDULES } from "./registry";

function scheduled(agentId: AgentId) {
  const schedule = AGENT_SCHEDULES[agentId] as string;
  return onSchedule({ schedule, timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 540 }, async () => {
    await runAgent(agentId, "schedule", AGENT_JOBS[agentId]);
  });
}

export const agentMorningSummary = scheduled("morningSummary");
export const agentDuesCollector = scheduled("duesCollector");
export const agentEnquiryFollowup = scheduled("enquiryFollowup");
export const agentEventReadiness = scheduled("eventReadiness");
export const agentStockWatch = scheduled("stockWatch");
export const agentTargetPlanner = scheduled("targetPlanner");
export const agentAdsAnalyst = scheduled("adsAnalyst");
export const agentFeedbackReviews = scheduled("feedbackReviews");
export const agentBackup = scheduled("backup");
export const agentMenuPriceReview = scheduled("menuPriceReview");
export const agentIntegrityCheck = scheduled("integrityCheck");

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** Cooking learner: every cookLog write re-learns that dish (§5). */
export const agentCookingLearner = onDocumentWritten({ document: "bookings/{bookingId}/cookLog/{dishId}", region: REGION }, async (event: WriteEvent) => {
  await runAgent("cookingLearner", "event", AGENT_JOBS.cookingLearner, { bookingId: event.params.bookingId, dishId: event.params.dishId });
});

/** Price watch: a new purchase, or a purchase whose items changed. */
export const agentPriceWatch = onDocumentWritten({ document: "purchases/{purchaseId}", region: REGION }, async (event: WriteEvent) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const before = event.data?.before;
  if (before?.exists && JSON.stringify(before.data()?.items ?? null) === JSON.stringify(after.data()?.items ?? null)) return;
  await runAgent("priceWatch", "event", AGENT_JOBS.priceWatch, { purchaseId: event.params.purchaseId });
});
