import { AgentId, AgentJob } from "./agentRun";
import { integrityCheck, morningSummary } from "./jobs/summary";
import { duesCollector, enquiryFollowup, eventReadiness, feedbackReviews } from "./jobs/customers";
import { cookingLearner, priceWatch, stockWatch } from "./jobs/kitchen";
import { adsAnalyst, backup, menuPriceReview, targetPlanner } from "./jobs/business";

export const AGENT_JOBS: Record<AgentId, AgentJob> = {
  morningSummary,
  duesCollector,
  enquiryFollowup,
  eventReadiness,
  cookingLearner,
  stockWatch,
  priceWatch,
  targetPlanner,
  adsAnalyst,
  feedbackReviews,
  backup,
  menuPriceReview,
  integrityCheck,
};

/** Cron (Asia/Kolkata). cookingLearner / priceWatch are event-driven (Firestore triggers). */
export const AGENT_SCHEDULES: Partial<Record<AgentId, string>> = {
  morningSummary: "30 7 * * *",
  duesCollector: "0 10 * * *", // all dues on Mondays, due-today invoices other days
  enquiryFollowup: "0 9 * * *",
  eventReadiness: "0 18 * * *",
  stockWatch: "0 18 * * *",
  targetPlanner: "0 6 1 * *",
  adsAnalyst: "0 9 * * 0",
  feedbackReviews: "0 11 * * *",
  backup: "0 2 * * *",
  menuPriceReview: "0 8 * * *",
  integrityCheck: "0 3 * * *",
};
