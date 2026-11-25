import { useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import PaymentsIcon from "@mui/icons-material/Payments";
import { useLang } from "../../i18n/LanguageContext";
import { createPaymentLink, createPortalLink, errorText, revokePortalLinks } from "../../data/functions";
import { customerPhone, waLink } from "../bookings/bookingCancelHelpers";

/**
 * 20 Nov 2026 — staff side of the customer portal: "Customer link" makes a private link (30 days) the owner sends by
 * WhatsApp; "Payment link" makes a Razorpay link for the balance (needs the owner's Razorpay keys on the server).
 * Neither has been tried against real accounts yet.
 */
export function PortalLinkButton({ kind, id, customerId, label }: { kind: "quotation" | "invoice"; id: string; customerId: string; label: string }) {
  const { L, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await createPortalLink({ kind, id });
      setUrl(`${window.location.origin}/p/${r.token}`);
      setPhone(await customerPhone(customerId));
      setOpen(true);
    } catch (e) {
      setError(errorText(e, lang));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };
  const text = L(`${label} చూడటానికి ఈ లింక్ తెరవండి: ${url}`, `Open this link to view ${label}: ${url}`);
  return (
    <>
      <Button variant="outlined" startIcon={<LinkIcon />} onClick={() => void make()} disabled={busy}>
        {L("కస్టమర్ లింక్", "Customer link")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{L("కస్టమర్ లింక్", "Customer link")}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          {note && <Alert severity="success">{note}</Alert>}
          {url && (
            <Box sx={{ display: "grid", gap: 1.5, mt: 1 }}>
              <TextField size="small" value={url} slotProps={{ input: { readOnly: true } }} onFocus={(e) => e.target.select()} />
              <Alert severity="info">{L("ఈ లింక్ ఉన్న ఎవరైనా ఈ పత్రాన్ని చూడగలరు. 30 రోజుల్లో గడువు ముగుస్తుంది.", "Anyone with this link can see this document. It expires in 30 days.")}</Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {url && (
            <>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setNote(L("కాపీ అయింది.", "Copied."));
                  } catch {
                    setNote(null);
                  }
                }}
              >
                {L("కాపీ", "Copy")}
              </Button>
              <Button href={phone ? waLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                WhatsApp
              </Button>
              <Button
                color="warning"
                onClick={async () => {
                  try {
                    await revokePortalLinks({ kind, id });
                    setUrl("");
                    setNote(L("ఈ పత్రం లింకులన్నీ ఆపివేశాం.", "All links for this document are switched off."));
                  } catch (e) {
                    setError(errorText(e, lang));
                  }
                }}
              >
                {L("లింకులు ఆపు", "Switch links off")}
              </Button>
            </>
          )}
          <Button onClick={() => setOpen(false)}>{L("మూసివేయి", "Close")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function PaymentLinkButton({ invoiceId, customerId, balance, number }: { invoiceId: string; customerId: string; balance: number; number: string }) {
  const { L, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(String(balance));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = Number(amount);
      const r = await createPaymentLink({ invoiceId, ...(Number.isFinite(n) && n > 0 && n < balance - 0.005 ? { amount: n } : {}) });
      setUrl(r.url);
      setPhone(await customerPhone(customerId));
    } catch (e) {
      setUrl("");
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const text = L(`${number} బిల్లు చెల్లించడానికి ఈ లింక్ వాడండి: ${url}`, `Pay invoice ${number} with this link: ${url}`);
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<PaymentsIcon />}
        disabled={!(balance > 0.005)}
        onClick={() => {
          setAmount(String(balance));
          setUrl("");
          setError(null);
          setOpen(true);
        }}
      >
        {L("చెల్లింపు లింక్", "Payment link")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{L("ఆన్‌లైన్ చెల్లింపు లింక్ (Razorpay)", "Online payment link (Razorpay)")}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "grid", gap: 1.5, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField size="small" label={L("మొత్తం (₹) — బాకీ కంటే తక్కువైతే కొంత భాగం మాత్రమే", "Amount (₹) — less than the balance = part payment")} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {url && <TextField size="small" value={url} slotProps={{ input: { readOnly: true } }} onFocus={(e) => e.target.select()} />}
            {url && <Alert severity="info">{L("చెల్లింపు వచ్చినప్పుడు బిల్లులో దానంతట అదే నమోదు అవుతుంది.", "When it is paid, the payment is recorded on the invoice by itself.")}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          {!url && (
            <Button variant="contained" onClick={() => void make()} disabled={busy}>
              {L("లింక్ తయారు చేయి", "Make the link")}
            </Button>
          )}
          {url && (
            <Button href={phone ? waLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              WhatsApp
            </Button>
          )}
          <Button onClick={() => setOpen(false)}>{L("మూసివేయి", "Close")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
