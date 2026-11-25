/**
 * X38 — safetyCheckWatch: every 15 minutes, tells the owner and managers about a food-safety checklist that the owner
 * wants done daily by a time and that nobody has filled in yet today. One notice per checklist, branch and day.
 * Nothing is watched until the owner sets a "daily by" time on a checklist. Rule: safetyRules.ts missedChecks.
 */
import { REGION, TIME_ZONE } from "../setup";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { istDay, istTime } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { missedChecks } from "./safetyRules";

export const safetyCheckWatch = onSchedule({ schedule: "every 15 minutes", timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 120 }, async () => {
  const settings = await loadSettings();
  if (!settings.foodSafety.checklists.some((l) => l.active && l.dailyBy)) return;
  const db = getFirestore();
  const now = new Date();
  const day = istDay(now);
  const [branches, checks] = await Promise.all([db.collection(FirestoreCollections.BRANCHES).get(), db.collection(FirestoreCollections.SAFETY_CHECKS).where("day", "==", day).get()]);
  const branchIds = branches.docs.filter((b) => (b.data() as Doc).active !== false).map((b) => b.id);
  const done = new Set(checks.docs.map((c) => `${asStr((c.data() as Doc).branchId)}|${asStr((c.data() as Doc).checklistId)}`));
  for (const m of missedChecks(settings.foodSafety, branchIds, done, istTime(now))) {
    try {
      await db.collection(FirestoreCollections.NOTIFICATIONS).doc(`safetyMissed_${day}_${m.branchId}_${m.checklistId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300)).create({
        kind: "safetyCheckMissed", audienceRoles: ["admin", "manager"], recipientUids: [], branchId: m.branchId,
        title: { te: `ఈరోజు తనిఖీ ఇంకా చేయలేదు: ${m.te} (${m.dailyBy} లోపు)`, en: `Today's check is not done yet: ${m.en} (due by ${m.dailyBy})` },
        link: "/food-safety", readBy: [], createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e; // 6 = already exists: this one was told today
    }
  }
});
