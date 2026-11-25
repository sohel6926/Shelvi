import { getFirestore } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId } from "../shared/validate";
import { Doc } from "../shared/coerce";
import { effectiveGstRate, loadSettings } from "../shared/settings";
import { isValidDay, todayIST } from "../shared/istDate";
import { priceReviewDue, Quote } from "../calc/menus";
import { fullQuote } from "./fullQuote";
import { checkTransport, parseMenuPackage, parseQuoteRequest, MenuMeta, QuoteRequest } from "./menuPackage";
import { MenuPricing } from "../calc/menus";

export async function loadMenuPackage(id: string): Promise<{ pricing: MenuPricing; meta: MenuMeta; id: string }> {
  const snap = await getFirestore().collection(FirestoreCollections.MENU_PACKAGES).doc(id).get();
  if (!snap.exists) fail("not-found", "ఆ menu దొరకలేదు.", "Menu package not found.");
  return { ...parseMenuPackage(snap.data() as Doc), id };
}

export function isPriceReviewDue(meta: MenuMeta, now: Date = new Date()): boolean {
  return isValidDay(meta.menuDate) ? priceReviewDue(meta.menuDate, todayIST(now)) : false;
}

export async function computeQuote(menuPackageId: string, req: QuoteRequest) {
  const [menu, settings] = await Promise.all([loadMenuPackage(menuPackageId), loadSettings()]);
  const gstRate = effectiveGstRate(settings);
  checkTransport(menu.meta, req.transport);
  const quote: Quote = fullQuote(menu.pricing, menu.meta, { ...req, gstRate });
  return { menu, settings, gstRate, quote };
}

export const quoteMenu = callable("quoteMenu", ADMIN_MANAGER, async (data) => {
  const menuPackageId = reqId(data, "menuPackageId");
  const req = parseQuoteRequest(data);
  const { menu, quote, gstRate } = await computeQuote(menuPackageId, req);
  return { ...quote, gstRate, priceReviewDue: isPriceReviewDue(menu.meta) };
});
