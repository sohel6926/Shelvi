import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Container, FormControlLabel, Link, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { LANG_NAME, nextLang, useLang } from "../../i18n/LanguageContext";
import { errorText, portalAccept, portalPay, portalView, type PortalView } from "../../data/functions";
import { formatINR } from "../../util/format";
import { UpiQr } from "../../components/UpiQr";

/**
 * 20 Nov 2026 — the page a customer opens from the link the owner sends (/p/<token>), with no sign-in.
 * A quotation can be accepted (typed name); an invoice shows how to pay (UPI QR, and the online link when the owner
 * has Razorpay). Only the fields the server sends are shown. Not yet tried by a real customer.
 */
export function PortalPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { L, lang, uiLang, toggle } = useLang();
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = async () => {
    try {
      setView(await portalView({ token }));
      setError(null);
    } catch (e) {
      setView(null);
      setError(errorText(e, lang));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await portalAccept({ token, name });
      setDone(true);
      await load();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const payOnline = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await portalPay({ token });
      window.location.href = r.url;
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };

  if (!view && !error) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  const d = view?.doc;
  const isQuote = d?.kind === "quotation";
  const canAccept = isQuote && d?.status === "Sent";
  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <Button size="small" onClick={toggle}>
          {LANG_NAME[nextLang(uiLang)]}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {view && d && (
        <Paper variant="outlined" sx={{ p: 2.5, display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            {view.business.logoUrl && <Box component="img" src={view.business.logoUrl} alt="" sx={{ height: 56, maxWidth: 120, objectFit: "contain" }} />}
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">{view.business.name}</Typography>
              {view.business.phone && <Typography variant="body2">{view.business.phone}</Typography>}
            </Box>
            <Chip label={d.status} size="small" />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {isQuote ? L("కొటేషన్", "Quotation") : L("బిల్లు", "Invoice")} {d.number}
            </Typography>
            <Typography variant="body2">
              {L("కస్టమర్", "Customer")}: {d.customerName} · {d.issueDate}
              {isQuote && d.validUntil ? ` · ${L("చెల్లుబాటు", "Valid until")} ${d.validUntil}` : ""}
            </Typography>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{L("అంశం", "Item")}</TableCell>
                <TableCell align="right">{L("సంఖ్య", "Qty")}</TableCell>
                <TableCell align="right">{L("మొత్తం", "Amount")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {d.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.name}</TableCell>
                  <TableCell align="right">{l.quantity}</TableCell>
                  <TableCell align="right">{formatINR(l.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Box sx={{ display: "grid", gap: 0.5, justifyItems: "end" }}>
            {d.discount > 0 && <Typography variant="body2">{L("తగ్గింపు", "Discount")}: −{formatINR(d.discount)}</Typography>}
            {d.tax > 0 && <Typography variant="body2">{L("GST", "GST")}: {formatINR(d.tax)}</Typography>}
            <Typography variant="h6">{L("మొత్తం", "Total")}: {formatINR(d.total)}</Typography>
            {!isQuote && (
              <>
                <Typography variant="body2">{L("చెల్లించినది", "Paid")}: {formatINR(d.amountPaid)}</Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {L("ఇంకా చెల్లించాల్సింది", "Balance due")}: {formatINR(d.balanceDue)}
                </Typography>
              </>
            )}
          </Box>
          {d.notes && <Typography variant="body2">{d.notes}</Typography>}
          {d.terms && (
            <Typography variant="caption" sx={{ whiteSpace: "pre-wrap" }}>
              {d.terms}
            </Typography>
          )}

          {isQuote && d.status === "Accepted" && (
            <Alert severity="success">
              {L("ఈ కొటేషన్ ఒప్పుకున్నారు", "This quotation was accepted")}
              {d.acceptedBy ? ` — ${d.acceptedBy}` : ""}
              {d.acceptedAt ? `, ${d.acceptedAt}` : ""}. {L("ధన్యవాదాలు!", "Thank you!")}
            </Alert>
          )}
          {canAccept && (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <TextField size="small" label={L("మీ పేరు (ఒప్పుకోవడానికి)", "Your name (to accept)")} value={name} onChange={(e) => setName(e.target.value)} />
              <FormControlLabel control={<Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} />} label={L("ఈ కొటేషన్ మొత్తం, నిబంధనలకు నేను ఒప్పుకుంటున్నాను", "I accept this quotation and its terms")} />
              <Button variant="contained" disabled={busy || !agree || name.trim().length < 2} onClick={() => void accept()}>
                {L("ఒప్పుకుంటున్నాను", "Accept")}
              </Button>
            </Box>
          )}
          {done && !error && <Alert severity="success">{L("ఒప్పుకున్నందుకు ధన్యవాదాలు. మేము మిమ్మల్ని సంప్రదిస్తాం.", "Thank you for accepting. We will be in touch.")}</Alert>}

          {view.pay && (
            <Box sx={{ display: "grid", gap: 1.5 }}>
              <Typography sx={{ fontWeight: 600 }}>{L("చెల్లించే విధానం", "How to pay")}</Typography>
              {view.pay.onlineUrl && (
                <Button variant="contained" disabled={busy} onClick={() => (window.location.href = view.pay!.onlineUrl)}>
                  {L("ఆన్‌లైన్ లో చెల్లించండి", "Pay online")}
                </Button>
              )}
              {!view.pay.onlineUrl && (
                <Button variant="outlined" disabled={busy} onClick={() => void payOnline()}>
                  {L("ఆన్‌లైన్ చెల్లింపు లింక్ తెరవండి", "Open the online payment link")}
                </Button>
              )}
              {view.pay.upiPayload && (
                <Box>
                  <Typography variant="body2">{L("లేదా UPI తో స్కాన్ చేయండి", "Or scan with any UPI app")}</Typography>
                  <UpiQr payload={view.pay.upiPayload} />
                  <Link href={view.pay.upiPayload}>{L("UPI app లో తెరవండి", "Open in a UPI app")}</Link>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      )}
    </Container>
  );
}
