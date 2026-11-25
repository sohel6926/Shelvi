/**
 * 20 Nov 2026 — customer portal (rules: portalRules.ts).
 *  - createPortalLink { kind, id } (owner / manager) → { token, expiresAt }; revokePortalLinks { kind, id }.
 *  - portalView { token }, portalAccept { token, name }, portalPay { token, amount? } — PUBLIC (no sign-in): the long
 *    random token is the key. They return only the whitelisted fields of portalRules.portalDoc.
 * Not yet tried by a real customer; not yet protected by App Check or a request rate limit (the token is 192 bits).
 */
import { REGION } from "../setup";
import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail, guard } from "../shared/errors";
import { body, reqId, reqOneOf, reqString } from "../shared/validate";
import { asBool, asNum, asStr, Doc } from "../shared/coerce";
import { dayOfValue, todayIST } from "../shared/istDate";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { makePaymentLink, RAZORPAY_SECRETS } from "../integrations/razorpay";
import { PORTAL_DAYS, PORTAL_KINDS, PORTAL_TEXT, PortalKind, acceptProblem, cleanName, linkProblem, newToken, portalDoc, tokenLooksRight } from "./portalRules";

const collectionOf = (k: PortalKind) => (k === "quotation" ? FirestoreCollections.QUOTATIONS : FirestoreCollections.INVOICES);
const bad = (k: keyof typeof PORTAL_TEXT): never => fail("invalid-argument", PORTAL_TEXT[k].te, PORTAL_TEXT[k].en);

export const createPortalLink = callable("createPortalLink", ADMIN_MANAGER, async (data, caller) => {
  const kind = reqOneOf(data, "kind", PORTAL_KINDS);
  const id = reqId(data, "id");
  const db = getFirestore();
  const snap = await db.collection(collectionOf(kind)).doc(id).get();
  if (!snap.exists) fail("not-found", "పత్రం దొరకలేదు.", "Document not found.");
  const d = snap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(d.branchId));
  if (asBool(d.isDeleted) || ["Cancelled", "Void"].includes(asStr(d.status))) fail("failed-precondition", "రద్దు అయిన పత్రానికి లింక్ ఇవ్వలేము.", "No link for a cancelled document.");
  const token = newToken();
  const expiresAt = Date.now() + PORTAL_DAYS * 86400_000;
  await db.collection(FirestoreCollections.PORTAL_LINKS).doc(token).set({ kind, docId: id, branchId: asStr(d.branchId), expiresAt, revoked: false, createdBy: caller.uid, createdByName: caller.name, createdAt: FieldValue.serverTimestamp() });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "createPortalLink", collection: collectionOf(kind), docId: id, before: {}, after: { kind } });
  return { token, expiresAt };
});

export const revokePortalLinks = callable("revokePortalLinks", ADMIN_MANAGER, async (data, caller) => {
  const kind = reqOneOf(data, "kind", PORTAL_KINDS);
  const id = reqId(data, "id");
  const db = getFirestore();
  const snap = await db.collection(FirestoreCollections.PORTAL_LINKS).where("docId", "==", id).get();
  let n = 0;
  const batch = db.batch();
  for (const l of snap.docs) {
    const x = l.data() as Doc;
    if (asStr(x.kind) !== kind || asBool(x.revoked)) continue;
    assertAdminOrOwnBranch(caller, asStr(x.branchId));
    batch.update(l.ref, { revoked: true, revokedBy: caller.uid, revokedAt: FieldValue.serverTimestamp() });
    n += 1;
  }
  if (n) await batch.commit();
  return { revoked: n };
});

interface Opened {
  token: string;
  kind: PortalKind;
  docId: string;
  doc: Doc;
}

async function open(rawToken: unknown): Promise<Opened> {
  if (!tokenLooksRight(rawToken)) return bad("badLink");
  const db = getFirestore();
  const l = await db.collection(FirestoreCollections.PORTAL_LINKS).doc(rawToken).get();
  const x = l.exists ? (l.data() as Doc) : null;
  const problem = linkProblem(x ? { kind: asStr(x.kind), docId: asStr(x.docId), expiresAt: asNum(x.expiresAt), revoked: asBool(x.revoked) } : null, Date.now());
  if (problem) return bad(problem);
  const kind = asStr(x?.kind) as PortalKind;
  const docId = asStr(x?.docId);
  const snap = await db.collection(collectionOf(kind)).doc(docId).get();
  if (!snap.exists) return bad("badLink");
  const doc = snap.data() as Doc;
  if (asBool(doc.isDeleted) || asBool(doc.cancelled) || ["Cancelled", "Void"].includes(asStr(doc.status))) return bad("badLink");
  return { token: rawToken, kind, docId, doc };
}

const dayOf = (v: unknown): string => dayOfValue(v) ?? "";

async function businessOf(doc: Doc): Promise<{ name: string; logoUrl: string; phone: string }> {
  const s = await loadSettings();
  let name = s.name;
  let logoUrl = s.logoUrl;
  const bookingId = asStr(doc.bookingId);
  if (bookingId) {
    const db = getFirestore();
    const b = (await db.collection(FirestoreCollections.BOOKINGS).doc(bookingId).get()).data() as Doc | undefined;
    const brandId = asStr(b?.brandId);
    if (brandId) {
      const br = (await db.collection("brands").doc(brandId).get()).data() as Doc | undefined;
      if (br) {
        name = asStr(br.invoiceDisplayName) || asStr(br.name) || name;
        logoUrl = asStr(br.logoUrl) || logoUrl;
      }
    }
  }
  return { name, logoUrl, phone: s.phone };
}

export const portalView = onCall({ region: REGION }, (request: CallableRequest) =>
  guard(async () => {
    const { kind, doc, token } = await open(body(request.data ?? {}).token);
    const view = portalDoc(kind, doc, dayOf);
    const link = (doc.paymentLink ?? null) as Doc | null;
    const canPay = kind === "invoice" && asNum(view.balanceDue) > 0.005;
    return {
      doc: view,
      business: await businessOf(doc),
      pay: canPay ? { upiPayload: asStr(doc.upiQrPayload), onlineUrl: link && asNum(link.expireBy) * 1000 > Date.now() ? asStr(link.url) : "" } : null,
      token,
    };
  }),
);

export const portalAccept = onCall({ region: REGION }, (request: CallableRequest) =>
  guard(async () => {
    const data = body(request.data ?? {});
    const { kind, doc, docId } = await open(data.token);
    if (kind !== "quotation") return bad("notAQuotation");
    const name = cleanName(reqString(data, "name", 80));
    const problem = acceptProblem({ status: asStr(doc.status), cancelled: asBool(doc.cancelled), validUntilDay: dayOf(doc.validUntil) }, todayIST(), name);
    if (problem) return bad(problem);
    const db = getFirestore();
    const ref = db.collection(FirestoreCollections.QUOTATIONS).doc(docId);
    const ip = String(request.rawRequest?.ip ?? "");
    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as Doc;
      if (asStr(cur.status) !== "Sent") bad("notOpen");
      tx.update(ref, { status: "Accepted", portalAcceptedAt: FieldValue.serverTimestamp(), portalAcceptedBy: name, portalAcceptedIp: ip, updatedBy: "portal", updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection(FirestoreCollections.NOTIFICATIONS).doc(`portalAccepted_${docId}`), {
        kind: "portalAccepted",
        audienceRoles: ["admin", "manager"],
        recipientUids: [],
        branchId: asStr(cur.branchId),
        title: { te: `కస్టమర్ కొటేషన్ ఒప్పుకున్నారు: ${asStr(cur.quotationNumber)} (${name})`, en: `Customer accepted quotation ${asStr(cur.quotationNumber)} (${name})` },
        link: `/quotations/${docId}`,
        readBy: [],
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await writeAuditEntry({ uid: "portal", role: "customer", action: "portalAccept", collection: FirestoreCollections.QUOTATIONS, docId, before: { status: "Sent" }, after: { status: "Accepted", by: name } });
    return { ok: true };
  }),
);

export const portalPay = onCall({ region: REGION, secrets: RAZORPAY_SECRETS }, (request: CallableRequest) =>
  guard(async () => {
    const data = body(request.data ?? {});
    const { kind, docId } = await open(data.token);
    if (kind !== "invoice") return bad("notAnInvoice");
    const amount = typeof data.amount === "number" && data.amount > 0 ? data.amount : undefined;
    const link = await makePaymentLink(docId, amount, { uid: "portal" });
    return { url: link.url, amount: link.amount };
  }),
);
