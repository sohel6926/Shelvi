import { type ReactNode } from "react";
import { Box, Divider, Link, Paper, Typography } from "@mui/material";
import { type LineItem } from "../data/records";
import { docBrandLine, type BusinessSettings } from "../data/settingsRepository";
import { formatINR } from "../util/format";
import { dateLocale, useLang } from "../i18n/LanguageContext";
import { tokens } from "../theme/tokens";
import { DataTable } from "./DataTable";
import { UpiQr } from "./UpiQr";
import { SPECIAL_MEAL_LABEL } from "../data/bookingRepository";

interface TaxDoc {
  lineItems: LineItem[];
  subtotal: number;
  gstRate: number;
  isInterState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  discount: number;
  totalAmount: number;
  taxable?: number | null;
}

function Line({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5, gap: 2 }}>
      <Typography sx={{ fontWeight: bold ? 700 : 400 }}>{label}</Typography>
      <Typography sx={{ fontWeight: bold ? 700 : 400, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</Typography>
    </Box>
  );
}

export interface LetterheadProps {
  /** Printed title, e.g. the invoice's server `docTitle` ("Invoice" until GST registration) or "Quotation". */
  title: string;
  /**
   * Terms to print. Invoices pass `invoice.terms` (fallback settings.invoiceTerms); when left out the
   * quotation terms (settings.terms) are printed.
   */
  terms?: string;
  number?: string;
  date?: Date | null;
  validUntil?: Date | null;
  customerName?: string;
  business: BusinessSettings;
  /** Server-made `upi://pay?...` link (invoice `upiQrPayload`). */
  upiPayload?: string;
  notes?: string;
}

/**
 * Line items + totals exactly as saved by the server (no recalculation here). With `letterhead`
 * it becomes the printable document: business name, phone, FSSAI number (and GSTIN once GST
 * registered) on top; UPI, bank, terms and signature at the bottom. Print with window.print().
 * Summary order follows calc-spec §1: subtotal − discount = taxable, then tax, then total.
 */
export function TaxDocumentView({
  doc,
  extra,
  letterhead,
  totalBadge,
}: {
  doc: TaxDoc;
  extra?: ReactNode;
  letterhead?: LetterheadProps;
  /** Shown under the total, e.g. the manual / automatic chip (hidden when printing). */
  totalBadge?: ReactNode;
}) {
  const { L, lang } = useLang();
  const fmtDate = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

  function itemLabel(raw: string): string {
    if (raw === "plates") return L("ప్లేట్లు", "Plates");
    if (raw === "servingBoys") return L("Serving boys (అదనం)", "Serving boys (extra)");
    if (raw === "transport") return L("రవాణా", "Transport");
    if (raw === "kids") return L("పిల్లల ప్లేట్లు", "Kids plates");
    const [kind, key] = raw.split(":");
    if (key && kind === "special") {
      const s = SPECIAL_MEAL_LABEL[key as keyof typeof SPECIAL_MEAL_LABEL];
      return `${L("ప్రత్యేక భోజనం", "Special meal")}: ${s ? L(s.te, s.en) : key}`;
    }
    if (key && kind === "replacement") return `${L("మార్పు", "Swap")}: ${key}`;
    if (key && kind === "extra") return `${L("అదనం", "Extra")}: ${key}`;
    return raw;
  }

  const hasTax = doc.cgstAmount + doc.sgstAmount + doc.igstAmount > 0;
  const b = letterhead?.business;
  const printedTerms = letterhead?.terms !== undefined ? letterhead.terms : (b?.terms ?? "");

  const table = (
    <>
      <DataTable
        rows={doc.lineItems.map((li, i) => ({ ...li, key: String(i) }))}
        rowKey={(r) => r.key}
        emptyText={L("వివరాలు లేవు.", "No line items.")}
        columns={[
          { label: L("వివరం", "Item"), render: (r) => (lang === "te" && r.descriptionTe ? r.descriptionTe : itemLabel(r.description)) },
          { label: L("సంఖ్య", "Qty"), align: "right", render: (r) => r.quantity },
          { label: L("ధర", "Rate"), align: "right", render: (r) => formatINR(r.unitPrice) },
          { label: L("మొత్తం", "Amount"), align: "right", render: (r) => formatINR(r.amount) },
        ]}
      />
      <Paper sx={{ p: 2, mt: 2, maxWidth: 420, ml: "auto", "@media print": { boxShadow: "none" } }}>
        <Line label={L("ఉప మొత్తం", "Subtotal")} value={formatINR(doc.subtotal)} />
        {doc.discount > 0 && <Line label={L("తగ్గింపు", "Discount")} value={`− ${formatINR(doc.discount)}`} />}
        {hasTax && doc.discount > 0 && typeof doc.taxable === "number" && (
          <Line label={L("పన్ను విధించే విలువ", "Taxable value")} value={formatINR(doc.taxable)} />
        )}
        {hasTax &&
          (doc.isInterState || doc.igstAmount > 0 ? (
            <Line label={`IGST (${doc.gstRate}%)`} value={formatINR(doc.igstAmount)} />
          ) : (
            <>
              <Line label={`CGST (${doc.gstRate / 2}%)`} value={formatINR(doc.cgstAmount)} />
              <Line label={`SGST (${doc.gstRate / 2}%)`} value={formatINR(doc.sgstAmount)} />
            </>
          ))}
        <Divider sx={{ my: 1 }} />
        <Line label={L("మొత్తం", "Total")} value={formatINR(doc.totalAmount)} bold />
        {totalBadge && <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.5, displayPrint: "none" }}>{totalBadge}</Box>}
        {extra}
      </Paper>
    </>
  );

  if (!letterhead || !b) return table;

  return (
    <Paper
      sx={{
        p: { xs: 2, md: 4 },
        fontFamily: tokens.font.print,
        "& .MuiTypography-root": { fontFamily: tokens.font.print },
        "@media print": { boxShadow: "none", border: "none", p: 0 },
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          {b.logoUrl && <Box component="img" src={b.logoUrl} alt="" sx={{ height: 64, maxWidth: 140, objectFit: "contain" }} />}
          <Box>
            <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
              {b.name}
            </Typography>
            {b.legalNameOnDocs && (
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {docBrandLine(b.brandName, b.legalName, true)}
              </Typography>
            )}
            {b.address && (
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {b.address}
              </Typography>
            )}
            <Typography variant="body2">
              {L("ఫోన్", "Phone")}: {b.phone}
            </Typography>
            {b.fssaiNumber && (
              <Typography variant="body2">
                FSSAI {L("లైసెన్స్", "Lic. No.")}: {b.fssaiNumber}
              </Typography>
            )}
            {b.gstRegistered && b.gstin && <Typography variant="body2">GSTIN: {b.gstin}</Typography>}
          </Box>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            {letterhead.title}
          </Typography>
          {letterhead.number && <Typography sx={{ fontWeight: 600 }}>{letterhead.number}</Typography>}
          <Typography variant="body2">
            {L("తేదీ", "Date")}: {fmtDate(letterhead.date)}
          </Typography>
          {letterhead.validUntil && (
            <Typography variant="body2">
              {L("చెల్లుబాటు", "Valid until")}: {fmtDate(letterhead.validUntil)}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider sx={{ my: 2 }} />
      {letterhead.customerName && (
        <Typography sx={{ mb: 2 }}>
          {L("వీరికి", "Bill to")}: <b>{letterhead.customerName}</b>
        </Typography>
      )}
      {table}
      {letterhead.notes && (
        <Typography variant="body2" sx={{ mt: 2, whiteSpace: "pre-line" }}>
          {letterhead.notes}
        </Typography>
      )}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, mt: 3 }}>
        <Box>
          {letterhead.upiPayload && (
            <Box sx={{ mb: 1.5 }}>
              <Typography sx={{ fontWeight: 600 }}>{L("UPI తో చెల్లించండి", "Pay by UPI")}</Typography>
              {/* R10-3: QR image of the server's payload (scan with any UPI app); prints with the invoice. */}
              <Box sx={{ my: 1 }}>
                <UpiQr payload={letterhead.upiPayload} />
              </Box>
              {b.upiId && <Typography variant="body2">UPI: {b.upiId}</Typography>}
              <Link href={letterhead.upiPayload} sx={{ displayPrint: "none" }}>
                {L("UPI app లో తెరవండి", "Open in a UPI app")}
              </Link>
            </Box>
          )}
          {!letterhead.upiPayload && b.upiId && (
            <Typography variant="body2">UPI: {b.upiId}</Typography>
          )}
          {(b.bank.name || b.bank.account) && (
            <Typography variant="body2">
              {L("బ్యాంక్", "Bank")}: {b.bank.name} · {L("ఖాతా", "A/c")} {b.bank.account} · IFSC {b.bank.ifsc}
            </Typography>
          )}
        </Box>
        <Box sx={{ textAlign: { sm: "right" } }}>
          {b.signatureUrl && <Box component="img" src={b.signatureUrl} alt="" sx={{ height: 56, maxWidth: 180, objectFit: "contain" }} />}
          <Typography variant="body2">{L("అధికార సంతకం", "Authorised signatory")}</Typography>
        </Box>
      </Box>
      {printedTerms && (
        <Box sx={{ mt: 3 }}>
          <Typography sx={{ fontWeight: 600 }}>{L("నిబంధనలు", "Terms")}</Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
            {printedTerms}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

export { Line as SummaryLine };
