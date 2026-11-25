import { useState } from "react";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { dateLocale, useLang } from "../i18n/LanguageContext";
import { OfflineError } from "../data/refresh";
import { errorText } from "../data/functions";

/**
 * Header refresh icon (docs/api-contract.md → Refresh). Calls `onRefresh` (re-read from the server /
 * re-call the screen's callables) and then shows "చివరి update: hh:mm". Offline: a Telugu message,
 * the cached data stays on screen.
 */
export function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const { L, lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<Date | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setProblem(null);
    try {
      await onRefresh();
      setAt(new Date());
    } catch (e) {
      setProblem(
        e instanceof OfflineError
          ? L("Internet లేదు — పాత సమాచారమే చూపిస్తున్నాం.", "You're offline — showing saved data.")
          : errorText(e, lang),
      );
    } finally {
      setBusy(false);
    }
  }

  const time = at?.toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" });

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, displayPrint: "none" }}>
      {(problem || time) && (
        <Typography variant="caption" color={problem ? "error" : "text.secondary"} role="status" sx={{ maxWidth: 260 }}>
          {problem ?? L(`చివరి update: ${time}`, `Last update: ${time}`)}
        </Typography>
      )}
      <Tooltip title={L("Server నుండి మళ్ళీ తీసుకురా", "Refresh from server")}>
        <span>
          <IconButton onClick={run} disabled={busy} aria-label={L("రిఫ్రెష్", "Refresh")} sx={{ width: 44, height: 44 }}>
            {busy ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
