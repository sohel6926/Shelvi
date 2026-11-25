import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import ArchiveIcon from "@mui/icons-material/Archive";
import { useLang } from "../i18n/LanguageContext";
import { useSession } from "../auth/AuthProvider";
import { can } from "../auth/roles";
import { cancelRecord, errorText, type CancelCollection } from "../data/functions";

/** Master data is archived, transactions are cancelled (contract R7-3). */
const ARCHIVED: ReadonlySet<CancelCollection> = new Set<CancelCollection>([
  "customers",
  "staff",
  "inventory",
  "vendors",
  "menuPackages",
  "menuItems",
  "dishes",
  "groceryItems",
  "equipment",
  "vehicles",
]);

function isArchiveCollection(c: CancelCollection): boolean {
  return ARCHIVED.has(c);
}

/** Reason dialog → cancelRecord. Used by CancelButton and by detail pages with their own button. */
export function CancelDialog({
  open,
  collection,
  id,
  what,
  onClose,
  onDone,
}: {
  open: boolean;
  collection: CancelCollection;
  id: string;
  /** What is being cancelled, e.g. the bill number or name (shown in the title). */
  what?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { L, lang } = useLang();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archive = isArchiveCollection(collection);
  const ok = reason.trim().length >= 3;

  const close = () => {
    if (busy) return;
    setReason("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelRecord({ collection, id, reason: reason.trim() });
      setReason("");
      onDone?.();
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>
        {archive ? L("పక్కన పెట్టాలా (archive)?", "Archive?") : L("రద్దు చేయాలా?", "Cancel this?")}
        {what ? ` — ${what}` : ""}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {archive
            ? L(
                "ఇది తొలగించబడదు. జాబితాల్లో కనిపించదు, పాత లెక్కలు అలాగే ఉంటాయి. \"రద్దైనవి చూపించు\" తో మళ్ళీ చూడవచ్చు.",
                "Nothing is deleted. It is hidden from lists; old records stay. Use \"Show cancelled\" to see it.",
              )
            : L(
                "ఇది తొలగించబడదు — రద్దు అని గుర్తు పెడతాం, లెక్కల్లో కలవదు. Stock ఉంటే తిరిగి సరిచేస్తాం.",
                "Nothing is deleted — it is marked cancelled and left out of totals. Stock is put back where needed.",
              )}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label={L("కారణం (తప్పనిసరి)", "Reason (required)")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText={!ok && reason ? L("కనీసం 3 అక్షరాలు", "At least 3 characters") : " "}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          {L("వద్దు", "Back")}
        </Button>
        <Button color="error" variant="contained" onClick={submit} disabled={!ok || busy}>
          {archive ? L("పక్కన పెట్టు", "Archive") : L("రద్దు చేయి", "Cancel it")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Icon (table rows) or text button that opens the reason dialog. Hidden for roles that may not cancel this collection. */
export function CancelButton({
  collection,
  id,
  what,
  variant = "icon",
  onDone,
}: {
  collection: CancelCollection;
  id: string;
  what?: string;
  variant?: "icon" | "button";
  onDone?: () => void;
}) {
  const { L } = useLang();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  if (!can.cancel(role, collection)) return null;
  const archive = isArchiveCollection(collection);
  const label = archive ? L("పక్కన పెట్టు", "Archive") : L("రద్దు చేయి", "Cancel");
  return (
    <>
      {variant === "icon" ? (
        <Tooltip title={label}>
          <IconButton
            size="small"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            {archive ? <ArchiveIcon fontSize="small" /> : <BlockIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      ) : (
        <Button color="error" variant="outlined" startIcon={archive ? <ArchiveIcon /> : <BlockIcon />} onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      {/* stopPropagation: the dialog is rendered inside clickable table rows. */}
      <span onClick={(e) => e.stopPropagation()}>
        <CancelDialog open={open} collection={collection} id={id} what={what} onClose={() => setOpen(false)} onDone={onDone} />
      </span>
    </>
  );
}

/** "రద్దైనవి చూపించు" switch for lists. */
export function ShowCancelledSwitch({ checked, onChange, count }: { checked: boolean; onChange: (v: boolean) => void; count?: number }) {
  const { L } = useLang();
  return (
    <FormControlLabel
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={`${L("రద్దైనవి చూపించు", "Show cancelled")}${count ? ` (${count})` : ""}`}
    />
  );
}

/** Small chip for a cancelled / archived row; the reason shows on hover. */
export function CancelledChip({ reason, archived }: { reason?: string; archived?: boolean }) {
  const { L } = useLang();
  const chip = <Chip size="small" variant="outlined" color="default" label={archived ? L("పక్కన పెట్టారు", "Archived") : L("రద్దు", "Cancelled")} />;
  return reason ? <Tooltip title={reason}>{chip}</Tooltip> : chip;
}
