import { getFirestore } from "firebase-admin/firestore";
import { FirestoreCollections } from "../../shared/firestorePaths";
import { asArr, asNum, asObj, asStr, Doc } from "../../shared/coerce";
import { formatDayTe } from "../../shared/istDate";
import { alertOwner } from "../../shared/outbox";
import { formatRupees } from "../../shared/templates";
import { rateChangePct } from "../../calc/ops";
import { recomputeDishLearned, syncDishFromCookLog } from "../../kitchen/cookLearning";
import { AgentJob } from "../agentRun";
import { expiringFefo, isLowStock, purchaseItemKey, purchaseTime, vehicleExpiries } from "../helpers";
import { docsOf } from "./common";

/** Event run: one cookLog line (input bookingId/dishId). Manual run: recompute every dish. */
export const cookingLearner: AgentJob = async (ctx) => {
  if (ctx.input.bookingId && ctx.input.dishId) {
    const l = await syncDishFromCookLog(ctx.input.bookingId, ctx.input.dishId);
    return { summary: l ? `dish ${ctx.input.dishId}: ${l.advice} (${l.changePct}%)` : `dish ${ctx.input.dishId} not found`, itemsHandled: 1, alerts: [] };
  }
  const dishes = await getFirestore().collection(FirestoreCollections.DISHES).get();
  let n = 0;
  for (const d of dishes.docs) if (await recomputeDishLearned(d.id)) n++;
  return { summary: `${n} dishes recomputed`, itemsHandled: n, alerts: [] };
};

export const stockWatch: AgentJob = async (ctx) => {
  const [items, vehicles] = await Promise.all([docsOf(getFirestore().collection(FirestoreCollections.INVENTORY)), docsOf(getFirestore().collection(FirestoreCollections.VEHICLES))]);
  const papers = vehicleExpiries(vehicles, ctx.today).alertNow;
  const low = items.filter((i) => isLowStock(i.data));
  const expiring = expiringFefo(items, ctx.today, 3);
  const lines = [
    ...low.map((i) => `• తక్కువ: ${asStr(i.data.name)} — ${asNum(i.data.quantityInStock)} ${asStr(i.data.unit)} (కనీసం ${asNum(i.data.reorderLevel)})`),
    ...expiring.map((e) => `• ${e.daysLeft < 0 ? "గడువు దాటింది" : e.daysLeft === 0 ? "ఈ రోజే గడువు" : `${e.daysLeft} రోజుల్లో గడువు`}: ${e.name} ${e.quantity} ${e.unit} (${formatDayTe(e.expiryDay)}) — ముందు ఇదే వాడండి`),
    ...papers.map((p) => `• వాహనం ${p.number}: ${p.te} ${p.daysLeft < 0 ? "గడువు దాటింది" : p.daysLeft === 0 ? "ఈ రోజే గడువు" : `${p.daysLeft} రోజుల్లో గడువు`} (${formatDayTe(p.day)})`),
  ];
  if (lines.length) await alertOwner(ctx.settings.ownerPhone, ctx.agentId, "Stock హెచ్చరిక", lines.slice(0, 30).join("\n"), `stock_${ctx.today}`);
  return { summary: `${low.length} low, ${expiring.length} expiring batches, ${papers.length} vehicle papers`, itemsHandled: items.length + vehicles.length, alerts: lines.slice(0, 10) };
};

/** Rate rise vs the previous purchase of the same item → which menu items / packages are affected. */
export const priceWatch: AgentJob = async (ctx) => {
  const db = getFirestore();
  const recent = await docsOf(db.collection(FirestoreCollections.PURCHASES).orderBy("purchaseDate", "desc").limit(200));
  const live = recent.filter((p) => p.data.isDeleted !== true);
  const targets = ctx.input.purchaseId ? live.filter((p) => p.id === ctx.input.purchaseId) : live.slice(0, 20);
  const [menuItems, packages] = await Promise.all([docsOf(db.collection(FirestoreCollections.MENU_ITEMS)), docsOf(db.collection(FirestoreCollections.MENU_PACKAGES))]);
  const lines: string[] = [];
  for (const p of targets) {
    const t = purchaseTime(p.data);
    const earlier = live.filter((q) => q.id !== p.id && purchaseTime(q.data) <= t);
    for (const it of asArr(p.data.items).map(asObj)) {
      const rate = asNum(it.unitPrice);
      if (!(rate > 0)) continue;
      const key = purchaseItemKey(it);
      let prev: Doc | undefined;
      for (const q of earlier) {
        prev = asArr(q.data.items).map(asObj).find((x) => purchaseItemKey(x) === key && asNum(x.unitPrice) > 0);
        if (prev) break;
      }
      if (!prev) continue;
      const rise = rateChangePct(asNum(prev.unitPrice), rate);
      if (rise < ctx.settings.vendorPriceAlertPct) continue;
      const invId = asStr(it.inventoryItemId);
      const affectedItems = invId ? menuItems.filter((m) => asArr(m.data.recipeIngredients).some((r) => asStr(asObj(r).inventoryItemId) === invId)).map((m) => asStr(m.data.name)) : [];
      const affectedPackages = invId ? packages.filter((m) => asArr(m.data.inventoryItemIds).map(String).includes(invId)).map((m) => asStr(m.data.nameTe) || asStr(m.data.code)) : [];
      const affected = [...affectedPackages, ...affectedItems];
      lines.push(`• ${asStr(it.description)}: ${formatRupees(asNum(prev.unitPrice))} → ${formatRupees(rate)} / ${asStr(it.unit)} (+${rise}%) — ${asStr(p.data.vendorNameSnapshot)}${affected.length ? `\n  ప్రభావం: ${affected.slice(0, 6).join(", ")}` : ""}`);
    }
  }
  if (lines.length) {
    const key = ctx.input.purchaseId ? `price_${ctx.input.purchaseId}` : `price_${ctx.today}_${ctx.runId}`;
    await alertOwner(ctx.settings.ownerPhone, ctx.agentId, "సరుకుల ధర పెరిగింది", lines.slice(0, 20).join("\n"), key);
  }
  return { summary: `${targets.length} purchases checked, ${lines.length} price rises`, itemsHandled: targets.length, alerts: lines.slice(0, 10) };
};
