/** X10 — leadReminderWatch: every 5 minutes, tells the person who has a lead that its follow-up time has come. */
import { REGION, TIME_ZONE } from "../setup";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FirestoreCollections } from "../shared/firestorePaths";
import { asStr, Doc } from "../shared/coerce";
import { istDay, istTime } from "../shared/istDate";
import { reminderDue, reminderKey } from "./reminderRules";

export const leadReminderWatch = onSchedule({ schedule: "every 5 minutes", timeZone: TIME_ZONE, region: REGION, timeoutSeconds: 120 }, async () => {
  const db = getFirestore();
  const now = new Date();
  const today = istDay(now);
  const nowTime = istTime(now);
  const snap = await db.collection(FirestoreCollections.LEADS).where("followUpDate", "==", today).get();
  for (const d of snap.docs) {
    const lead = d.data() as Doc;
    if (!reminderDue({ status: asStr(lead.status, "new"), cancelled: lead.cancelled === true || lead.archived === true, followUpDate: lead.followUpDate, followUpTime: lead.followUpTime, sentFor: lead.reminderSentFor }, today, nowTime)) continue;
    const key = reminderKey(lead.followUpDate, lead.followUpTime);
    const name = asStr(lead.name) || asStr(lead.phone);
    const assignedTo = asStr(lead.assignedTo);
    const batch = db.batch();
    batch.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`leadReminder_${d.id}_${key}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 300)), {
      kind: "leadReminder",
      audienceRoles: assignedTo ? [] : ["admin", "manager"],
      recipientUids: assignedTo ? [assignedTo] : [],
      title: { te: `ఇప్పుడు మాట్లాడాలి: ${name} (${key.split(" ")[1]})`, en: `Follow up now: ${name} (${key.split(" ")[1]})` },
      link: "/leads",
      leadId: d.id,
      branchId: asStr(lead.branchId),
      readBy: [],
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(d.ref, { reminderSentFor: key });
    await batch.commit();
  }
});
