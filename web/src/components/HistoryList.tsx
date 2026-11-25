import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import { useLang } from "../i18n/LanguageContext";
import { errorText, getHistory, type HistoryEntry, type HistoryQuery } from "../data/functions";
import { useSession } from "../auth/AuthProvider";
import { subscribeUsers } from "../data/records";
import { historySentence } from "../i18n/historyText";

export { HISTORY_COLLECTIONS } from "../i18n/historyText";

/** uid → name for history entries the server sent without byName (admin can read users). */
function useUserNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(
    () =>
      subscribeUsers(
        (users) => setNames(Object.fromEntries(users.map((u) => [u.uid, u.name || u.email]))),
        () => {},
      ),
    [],
  );
  return names;
}

/** Paged list of history entries for a query (admin only — the callable rejects others). */
export function HistoryList({ query, dense }: { query: HistoryQuery; dense?: boolean }) {
  const { L, lang } = useLang();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = useUserNames();
  const key = JSON.stringify(query);

  const load = useCallback(
    async (startAfter?: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await getHistory({ ...query, limit: query.limit ?? 50, ...(startAfter ? { startAfter } : {}) });
        setEntries((prev) => (startAfter && prev ? [...prev, ...res.entries] : res.entries));
        setCursor(res.nextCursor);
      } catch (e) {
        setError(errorText(e, lang));
        if (!startAfter) setEntries([]);
      } finally {
        setBusy(false);
      }
    },
    [key, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {entries === null ? (
        <CircularProgress size={22} />
      ) : entries.length === 0 ? (
        <Typography color="text.secondary">{L("మార్పుల చరిత్ర ఇంకా లేదు.", "No changes recorded yet.")}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: dense ? 0.5 : 1 }}>
          {entries.map((e) => (
            <Box component="li" key={e.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
              {e.kind === "override" && <Chip size="small" variant="outlined" label={L("మాన్యువల్", "Manual")} />}
              <Typography variant={dense ? "body2" : "body1"}>{historySentence(e, lang, names)}</Typography>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
        {cursor && (
          <Button size="small" onClick={() => load(cursor)} disabled={busy}>
            {L("ఇంకా చూపించు", "Show more")}
          </Button>
        )}
        <Button size="small" onClick={() => load()} disabled={busy}>
          {L("మళ్ళీ తీసుకురా", "Reload")}
        </Button>
      </Box>
    </Box>
  );
}

/** "చరిత్ర / History" card for a detail page; renders nothing for non-admins. */
export function HistorySection({ collection, docId }: { collection: string; docId: string }) {
  const { L } = useLang();
  const session = useSession();
  if (session.status !== "loggedIn" || session.profile.role !== "admin" || !docId) return null;
  return (
    <Paper sx={{ p: 2.5, mt: 3, displayPrint: "none" }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L("చరిత్ర", "History")}
      </Typography>
      <HistoryList query={{ collection, docId, limit: 30 }} dense />
    </Paper>
  );
}
