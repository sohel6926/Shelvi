import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import { dateLocale, useLang } from "../i18n/LanguageContext";
import { errorText } from "../data/functions";
import { MIN_REASON, type CalcMeta } from "../data/calcMode";
import { tokens } from "../theme/tokens";
import { rupees2 } from "./ui";

interface ChipProps {
  meta: CalcMeta;
  /** The value shown on screen (manual or automatic). */
  value: number;
  format?: (n: number) => string;
  /** Whether this user may switch the value (admin; manager when allowed). */
  canChange?: boolean;
  onSwitchToAuto?: () => Promise<unknown>;
  onEnterManual?: () => void;
}

/**
 * `ఆటోమేటిక్` (green) or `మాన్యువల్ · name` (gold outline). Tap → automatic value, difference,
 * reason, and "Switch to automatic" / "Enter manually" when allowed.
 */
export function CalcModeChip({ meta, value, format = rupees2, canChange, onSwitchToAuto, onEnterManual }: ChipProps) {
  const { L, lang } = useLang();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manual = meta.calcMode === "manual";
  const who = meta.overriddenBy?.name || L("ఎవరో", "someone");
  const diff = manual && meta.autoValue !== null ? value - meta.autoValue : null;

  async function switchToAuto() {
    if (!onSwitchToAuto) return;
    setBusy(true);
    setError(null);
    try {
      await onSwitchToAuto();
      setAnchor(null);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Chip
        size="small"
        clickable
        onClick={(e) => setAnchor(e.currentTarget)}
        label={manual ? `${L("మాన్యువల్", "Manual")} · ${who}` : L("ఆటోమేటిక్", "Automatic")}
        variant={manual ? "outlined" : "filled"}
        color={manual ? "default" : "success"}
        sx={
          manual
            ? { borderColor: tokens.color.gold, borderWidth: 2, color: tokens.color.goldDeep, fontWeight: 600, displayPrint: "none" }
            : { displayPrint: "none" }
        }
        aria-haspopup="dialog"
      />
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <Box sx={{ p: 2, maxWidth: 320, display: "grid", gap: 1 }}>
          {manual ? (
            <>
              <Typography sx={{ fontWeight: 600 }}>
                {L(`${who} చేతితో పెట్టిన విలువ`, `Entered by hand by ${who}`)}
              </Typography>
              <Row label={L("ఇప్పటి విలువ", "Current value")} value={format(value)} />
              <Row label={L("ఆటోమేటిక్ లెక్క", "Automatic value")} value={meta.autoValue === null ? "—" : format(meta.autoValue)} />
              {diff !== null && (
                <Row
                  label={L("తేడా", "Difference")}
                  value={`${diff > 0 ? "+" : diff < 0 ? "−" : ""}${format(Math.abs(diff))}`}
                />
              )}
              {meta.overrideReason && (
                <Typography variant="body2">
                  <b>{L("కారణం", "Reason")}:</b> {meta.overrideReason}
                </Typography>
              )}
              {meta.overriddenAt && (
                <Typography variant="caption" color="text.secondary">
                  {meta.overriddenAt.toLocaleString(dateLocale(lang), { dateStyle: "medium", timeStyle: "short" })}
                </Typography>
              )}
              {canChange && onSwitchToAuto && (
                <Button variant="contained" onClick={switchToAuto} disabled={busy}>
                  {L("ఆటోమేటిక్‌కి మార్చు", "Switch to automatic")}
                </Button>
              )}
            </>
          ) : (
            <Typography variant="body2">
              {L("ఈ విలువ server దానంతట అదే లెక్కించింది.", "The server calculated this value automatically.")}
            </Typography>
          )}
          {canChange && onEnterManual && (
            <Button
              variant="outlined"
              onClick={() => {
                setAnchor(null);
                onEnterManual();
              }}
            >
              {L("చేతితో నమోదు చేయి", "Enter manually")}
            </Button>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </Popover>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography variant="body2">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Box>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  label: string;
  initial: number | null;
  /** Lowest allowed value (e.g. an invoice total can't go below what was already paid). */
  min?: number;
  onClose: () => void;
  onSubmit: (value: number, reason: string) => Promise<unknown>;
}

/** "Enter manually": a value + a required reason (≥ 3 characters). The server validates again. */
export function ManualValueDialog({ open, title, label, initial, min = 0, onClose, onSubmit }: DialogProps) {
  const { L, lang } = useLang();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initial === null ? "" : String(initial));
    setReason("");
    setError(null);
  }, [open, initial]);

  async function submit() {
    setError(null);
    const t = value.trim().replace(/,/g, "");
    const n = Number(t);
    if (!t || !/^\d+(\.\d{1,2})?$/.test(t) || !Number.isFinite(n)) {
      setError(L("సరైన సంఖ్య ఇవ్వండి (పైసలు 2 అంకెల వరకు).", "Enter a valid number (up to 2 decimals)."));
      return;
    }
    if (n < min) {
      setError(L(`${min} కంటే తక్కువ ఉండకూడదు.`, `Can't be less than ${min}.`));
      return;
    }
    if (reason.trim().length < MIN_REASON) {
      setError(L("కారణం రాయండి (కనీసం 3 అక్షరాలు).", "Write a reason (at least 3 characters)."));
      return;
    }
    setBusy(true);
    try {
      await onSubmit(n, reason.trim());
      setReason("");
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <TextField label={label} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus />
        <TextField
          label={L("కారణం (తప్పనిసరి)", "Reason (required)")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          minRows={2}
          required
        />
        <Typography variant="body2" color="text.secondary">
          {L(
            "ఆటోమేటిక్ లెక్క కూడా దాచి ఉంచుతాం; ఎవరు, ఎందుకు మార్చారో అందరికీ కనిపిస్తుంది.",
            "The automatic value is kept; everyone can see who changed it and why.",
          )}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Cancel")}
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy}>
          {busy ? L("Save అవుతోంది…", "Saving…") : L("Save చేయి", "Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
