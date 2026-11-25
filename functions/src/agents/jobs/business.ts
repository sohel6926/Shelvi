import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { FirestoreCollections } from "../../shared/firestorePaths";
import { asNum, asStr, Doc } from "../../shared/coerce";
import { addDays, daysInMonth } from "../../shared/istDate";
import { alertOwner } from "../../shared/outbox";
import { formatRupees } from "../../shared/templates";
import { adsResult } from "../../calc/health";
import { dailyNeeded } from "../../calc/targets";
import { round2 } from "../../calc/util";
import { parseMenuPackage } from "../../menus/menuPackage";
import { isPriceReviewDue } from "../../menus/quoteMenu";
import { readTargetDoc, saveYearPlan } from "../../targets/plan";
import { AgentJob } from "../agentRun";
import { buildExportRequest } from "../helpers";
import { docsOf } from "./common";

/** 1st of the month 06:00: replan §4 / §4b with last month's actual income (typed months kept). */
export const targetPlanner: AgentJob = async (ctx) => {
  const db = getFirestore();
  const year = Number(ctx.today.slice(0, 4));
  const years = ctx.today.slice(5, 7) === "01" ? [year - 1, year] : [year];
  const done: string[] = [];
  const kept: string[] = [];
  for (const y of years) {
    const t = readTargetDoc((await db.collection(FirestoreCollections.TARGETS).doc(String(y)).get()).data() as Doc | undefined);
    if (!t) continue;
    // §4b: typed months stay as the owner typed them; only automatic (null) months are re-planned.
    const plan = await saveYearPlan(y, t.yearTarget, t.profitMarginPct, t.weights ?? ctx.settings.seasonWeights, ctx.now, t.manualMonths);
    done.push(String(y));
    if (t.calcMode === "manual") kept.push(`${y}: ${t.manualMonths.filter((v) => v !== null).length} typed months kept`);
    if (y === year) {
      const month = ctx.today.slice(0, 7);
      const mt = plan.months[Number(month.slice(5, 7)) - 1].revised;
      const behind = plan.aheadOrBehind;
      await alertOwner(
        ctx.settings.ownerPhone,
        ctx.agentId,
        "ఈ నెల target",
        `${month} target: ${formatRupees(mt)}\nరోజుకి సుమారు: ${formatRupees(dailyNeeded(mt, 0, daysInMonth(month)))}\nసంవత్సరం లెక్కలో: ${behind >= 0 ? "ముందు" : "వెనుక"} ${formatRupees(Math.abs(behind))}`,
        `target_${month}`,
      );
    }
  }
  const parts = [done.length ? `replanned ${done.join(", ")}` : "", kept.join("; ")].filter(Boolean);
  return { summary: parts.join("; ") || "no year target set", itemsHandled: done.length, alerts: [] };
};

/** Sunday 09:00: last 7 days of ad spend per platform → ROAS / cost per booking (§8 adsResult). */
export const adsAnalyst: AgentJob = async (ctx) => {
  const from = addDays(ctx.today, -7);
  const rows = await docsOf(getFirestore().collection(FirestoreCollections.AD_SPEND).where("date", ">=", from).where("date", "<", ctx.today));
  const byPlatform = new Map<string, { spend: number; revenue: number; bookings: number; leads: number }>();
  for (const r of rows) {
    const k = asStr(r.data.platform, "other") || "other";
    const v = byPlatform.get(k) ?? { spend: 0, revenue: 0, bookings: 0, leads: 0 };
    v.spend = round2(v.spend + Math.max(0, asNum(r.data.amount)));
    v.revenue = round2(v.revenue + Math.max(0, asNum(r.data.revenue)));
    v.bookings += Math.max(0, asNum(r.data.bookings));
    v.leads += Math.max(0, asNum(r.data.leads));
    byPlatform.set(k, v);
  }
  const lines: string[] = [];
  const alerts: string[] = [];
  for (const [platform, v] of byPlatform) {
    const a = adsResult(v.spend, v.revenue, v.bookings);
    const verdict = a.band === "good" ? "బాగుంది" : a.band === "warn" ? "పర్వాలేదు" : a.band === "bad" ? "డబ్బు వృథా అవుతోంది" : "-";
    lines.push(`• ${platform}: ఖర్చు ${formatRupees(v.spend)}, ఆదాయం ${formatRupees(v.revenue)}, ROAS ${a.roas ?? "-"}, ఒక booking కి ${a.costPerBooking === null ? "-" : formatRupees(a.costPerBooking)} — ${verdict}`);
    if (a.band === "bad") alerts.push(`${platform} ROAS ${a.roas}`);
  }
  if (lines.length) await alertOwner(ctx.settings.ownerPhone, ctx.agentId, "గత 7 రోజుల ads ఫలితం", lines.join("\n"), `ads_${ctx.today}`);
  return { summary: `${byPlatform.size} platforms, ${alerts.length} wasting money`, itemsHandled: rows.length, alerts };
};

/** Daily 08:00: remind the owner when a menu's price date is 12 months old (once per menu per month). */
export const menuPriceReview: AgentJob = async (ctx) => {
  const menus = await docsOf(getFirestore().collection(FirestoreCollections.MENU_PACKAGES));
  const due: string[] = [];
  for (const m of menus) {
    if (m.data.active === false) continue;
    try {
      const { meta } = parseMenuPackage(m.data);
      if (isPriceReviewDue(meta, ctx.now)) due.push(`• ${meta.nameTe || meta.nameEn} (ధర తేదీ ${meta.menuDate})`);
    } catch {
      due.push(`• ${asStr(m.data.nameTe) || m.id}: menu వివరాల్లో తప్పు ఉంది — సరిచూడండి`);
    }
  }
  if (due.length) await alertOwner(ctx.settings.ownerPhone, ctx.agentId, "Menu ధరలు సమీక్షించే సమయం (12 నెలలు అయ్యింది)", `${due.join("\n")}\nధర మార్చిన తర్వాత menu తేదీ కూడా మార్చండి.`, `menuPrice_${ctx.today.slice(0, 7)}`);
  return { summary: `${due.length} menus due for price review`, itemsHandled: menus.length, alerts: [] };
};

function projectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return String(JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "");
  } catch {
    return "";
  }
}

/** 02:00: Firestore managed export to gs://<default bucket>/backups/firestore/<date> (admin REST API). */
export const backup: AgentJob = async (ctx) => {
  const pid = projectId();
  if (!pid) throw new Error("project id not found");
  const bucket = getStorage().bucket().name;
  const req = buildExportRequest(pid, bucket, ctx.today);
  const tokenRes = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-account/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!tokenRes.ok) throw new Error(`metadata token HTTP ${tokenRes.status}`);
  const token = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!token) throw new Error("no access token");
  const res = await fetch(req.url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
  const json = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`export failed: ${json.error?.message ?? res.status}`);
  return { summary: `export started → ${req.body.outputUriPrefix} (operation ${json.name ?? "?"})`, itemsHandled: 1, alerts: [] };
};
