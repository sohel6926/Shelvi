import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { useLang } from "../../i18n/LanguageContext";
import { customerStatement, errorText, type CustomerStatement, type StatementLine } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";
import { ErrorBox } from "../../components/ui";
import { RefreshButton } from "../../components/RefreshButton";
import { formatMoney } from "../../util/format";
import { formatDay } from "../../util/dates";
import { waLink } from "../bookings/bookingCancelHelpers";
import { tabularNums, tokens } from "../../theme/tokens";

const KIND: Record<StatementLine["kind"], { te: string; en: string }> = {
  booking: { te: "బుకింగ్", en: "Booking" },
  invoice: { te: "బిల్లు", en: "Invoice" },
  "cancellation-charge": { te: "రద్దు చార్జీ", en: "Cancellation charge" },
  payment: { te: "చెల్లింపు", en: "Payment" },
  refund: { te: "తిరిగి ఇచ్చింది", en: "Refund" },
};

/** R10-7 customer statement (customerStatement): running balance, print and WhatsApp copy — all numbers from the server. */
export function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { L, T, lang } = useLang();
  const { settings } = useBusinessSettings();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<CustomerStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  /** `rethrow` lets the header Refresh button show its own error / "last update" time. */
  const load = useCallback(async (rethrow = false) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setData(await customerStatement({ customerId: id, ...(from ? { from } : {}), ...(to ? { to } : {}) }));
    } catch (e) {
      setError(errorText(e, lang));
      if (rethrow) throw e;
    } finally {
      setLoading(false);
    }
  }, [id, from, to, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const num = { ...tabularNums, textAlign: "right" as const };
  const bal = (n: number) => (n > 0.005 ? L(`${formatMoney(n)} బాకీ`, `${formatMoney(n)} due`) : n < -0.005 ? L(`${formatMoney(-n)} ఎక్కువ కట్టారు`, `${formatMoney(-n)} in credit`) : formatMoney(0));

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 2, displayPrint: "none" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(id ? `/customers/${id}/edit` : "/customers")}>
          {L("కస్టమర్", "Customer")}
        </Button>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <TextField type="date" size="small" label={L("నుండి", "From")} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" size="small" label={L("వరకు", "To")} value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <RefreshButton onRefresh={() => load(true)} />
          <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!data}>
            {L("ప్రింట్ / PDF", "Print / PDF")}
          </Button>
          {data && (
            <>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.whatsappText);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? L("కాపీ అయింది", "Copied") : L("కాపీ", "Copy")}
              </Button>
              <Button variant="contained" color="success" startIcon={<WhatsAppIcon />} href={waLink(data.phone, data.whatsappText)} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </Button>
            </>
          )}
        </Box>
      </Box>
      <ErrorBox message={error} />
      {loading && !data && <CircularProgress />}
      {data && (
        <Paper sx={{ p: { xs: 2, md: 4 }, fontFamily: tokens.font.print, "@media print": { boxShadow: "none", p: 0 } }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
            <Box>
              <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
                {settings.brandName || settings.name}
              </Typography>
              <Typography variant="body2">
                {L("ఫోన్", "Phone")}: {settings.phone}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                {L("ఖాతా వివరాలు", "Statement of account")}
              </Typography>
              <Typography variant="body2">
                {data.from || data.to ? `${data.from ? formatDay(data.from, lang) : "…"} – ${data.to ? formatDay(data.to, lang) : "…"}` : L("మొత్తం కాలం", "All time")}
              </Typography>
            </Box>
          </Box>
          <Typography sx={{ mt: 2 }}>
            {L("కస్టమర్", "Customer")}: <b>{data.customerName}</b>
            {data.phone ? ` · ${data.phone}` : ""}
          </Typography>
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{L("తేదీ", "Date")}</TableCell>
                  <TableCell>{L("వివరం", "Details")}</TableCell>
                  <TableCell sx={num}>{L("మొత్తం", "Amount")}</TableCell>
                  <TableCell sx={num}>{L("బాకీ", "Balance")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data.from || data.opening !== 0) && (
                  <TableRow>
                    <TableCell />
                    <TableCell sx={{ fontWeight: 600 }}>{L("ముందు బాకీ", "Opening balance")}</TableCell>
                    <TableCell />
                    <TableCell sx={{ ...num, fontWeight: 600 }}>{formatMoney(data.opening)}</TableCell>
                  </TableRow>
                )}
                {data.lines.map((l, i) => (
                  <TableRow key={`${l.ref}-${i}`}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDay(l.day, lang)}</TableCell>
                    <TableCell>
                      {/* the server text already names the kind ("చెల్లింపు (Cash) — …"); the kind is the fallback */}
                      {L(l.te || l.en, l.en || l.te) || T(KIND[l.kind])}
                    </TableCell>
                    <TableCell sx={{ ...num, color: l.amount < 0 ? tokens.color.good : undefined }}>{l.amount === 0 ? "—" : formatMoney(l.amount)}</TableCell>
                    <TableCell sx={num}>{formatMoney(l.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ maxWidth: 360, ml: "auto", mt: 2, display: "grid", gridTemplateColumns: "1fr auto", columnGap: 2, rowGap: 0.5, ...tabularNums }}>
            <span>{L("బిల్లులు", "Invoiced")}</span>
            <span>{formatMoney(data.invoiced)}</span>
            <span>{L("చెల్లించింది", "Paid")}</span>
            <span>{formatMoney(data.paid)}</span>
            <b>{L("ఇప్పుడు", "Now")}</b>
            <b>{bal(data.closing)}</b>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
