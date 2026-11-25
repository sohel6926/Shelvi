import { useEffect, useState } from "react";
import { Box, Button, MenuItem, Paper, TextField } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { subscribeUsers, type AppUser } from "../../data/records";
import { HISTORY_COLLECTIONS, HistoryList } from "../../components/HistoryList";
import { ScreenTitle } from "../../components/ui";
import type { HistoryQuery } from "../../data/functions";

/** Admin: who changed what, when (getHistory). Filters: what, person, date range. */
export function HistoryPage() {
  const { L, T } = useLang();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [collection, setCollection] = useState("");
  const [by, setBy] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [applied, setApplied] = useState<HistoryQuery>({ limit: 50 });
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeUsers(setUsers), []);

  function apply() {
    setApplied({
      limit: 50,
      ...(collection ? { collection } : {}),
      ...(by ? { by } : {}),
      ...(fromDay ? { fromDay } : {}),
      ...(toDay ? { toDay } : {}),
    });
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("మార్పుల చరిత్ర", "Change history")}
        subtitle={L("ఎవరు, ఏమి, ఎప్పుడు మార్చారు", "Who changed what, and when")}
        onRefresh={async () => setTick((t) => t + 1)}
      />
      <Paper sx={{ p: 2, mb: 2, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr) auto" }, alignItems: "center" }}>
        <TextField select size="small" label={L("ఏది", "What")} value={collection} onChange={(e) => setCollection(e.target.value)}>
          <MenuItem value="">{L("అన్నీ", "All")}</MenuItem>
          {Object.entries(HISTORY_COLLECTIONS).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {T(v)}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={L("ఎవరు", "Person")} value={by} onChange={(e) => setBy(e.target.value)}>
          <MenuItem value="">{L("అందరూ", "Everyone")}</MenuItem>
          <MenuItem value="system">Server</MenuItem>
          {users.map((u) => (
            <MenuItem key={u.uid} value={u.uid}>
              {u.name || u.email}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="date"
          size="small"
          label={L("నుండి", "From")}
          value={fromDay}
          onChange={(e) => setFromDay(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          size="small"
          label={L("వరకు", "To")}
          value={toDay}
          onChange={(e) => setToDay(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button variant="contained" onClick={apply}>
          {L("చూపించు", "Show")}
        </Button>
      </Paper>
      <Paper sx={{ p: 2.5 }}>
        <HistoryList key={tick} query={applied} />
      </Paper>
    </Box>
  );
}
