import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import { useSession } from "../../auth/AuthProvider";
import { BankReconPanel } from "./BankReconPanel";
import { MonthClosePanel } from "./MonthClosePanel";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useLang } from "../../i18n/LanguageContext";
import { cancelJournalEntry, errorText, ledgerReport, lockPeriod, saveJournalEntry, unlockPeriod, type LedgerReport, ledgerExport } from "../../data/functions";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { formatINR } from "../../util/format";

const pad = (n: number) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const prevMonth = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};
const num = (t: string) => (t.trim() === "" ? 0 : Number(t.replace(/,/g, "")));

type Draft = { account: string; debit: string; credit: string };

/** A hand-written entry: capital put in, drawings, opening balances, corrections. Debits must equal credits. */
function EntryDialog({ accounts, onClose, onSaved }: { accounts: LedgerReport["accounts"]; onClose: () => void; onSaved: () => void }) {
  const { L, lang } = useLang();
  const [day, setDay] = useState(todayIso());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Draft[]>([{ account: "1010", debit: "", credit: "" }, { account: "3000", debit: "", credit: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Draft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const debit = Math.round(lines.reduce((a, l) => a + (num(l.debit) || 0), 0) * 100) / 100;
  const credit = Math.round(lines.reduce((a, l) => a + (num(l.credit) || 0), 0) * 100) / 100;
  const lineOk = (l: Draft) => {
    const d = num(l.debit);
    const c = num(l.credit);
    return d >= 0 && c >= 0 && d > 0 !== c > 0;
  };
  const valid = day <= todayIso() && memo.trim() !== "" && lines.length >= 2 && lines.every(lineOk) && debit === credit && debit > 0;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveJournalEntry({ day, memo: memo.trim(), lines: lines.map((l) => ({ account: l.account, ...(num(l.debit) > 0 ? { debit: num(l.debit) } : { credit: num(l.credit) }) })) });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{L("చేతి ఎంట్రీ", "Hand-written entry")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Alert severity="info">
          {L(
            "బిల్లులు, చెల్లింపులు, కొనుగోళ్లు ఆటోమేటిక్‌గా పుస్తకంలోకి వస్తాయి. ఇక్కడ రాయవలసినవి: మీరు పెట్టిన పెట్టుబడి, మీరు తీసుకున్న డబ్బు, ప్రారంభ నిల్వలు, సవరణలు. ప్రతి లైన్‌లో డెబిట్ లేదా క్రెడిట్ ఒక్కటే.",
            "Bills, payments and purchases reach the books by themselves. Write here: money you put in, money you took out, opening balances, corrections. Each line has a debit or a credit, not both.",
          )}
        </Alert>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 3fr" } }}>
          <TextField size="small" type="date" label={L("తేదీ", "Date")} value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label={L("ఎందుకు (వివరం)", "What it is for")} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Box>
        {lines.map((l, i) => (
          <Box key={i} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "3fr 1fr 1fr auto" }, alignItems: "center" }}>
            <TextField select size="small" label={L("ఖాతా", "Account")} value={l.account} onChange={(e) => set(i, { account: e.target.value })}>
              {accounts.map((a) => (
                <MenuItem key={a.code} value={a.code}>
                  {a.code} · {L(a.te, a.en)}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" label={L("డెబిట్ ₹", "Debit ₹")} value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value.trim() ? "" : l.credit })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField size="small" label={L("క్రెడిట్ ₹", "Credit ₹")} value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value.trim() ? "" : l.debit })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <IconButton aria-label={L("ఈ లైన్ తీసేయి", "Remove this line")} onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length <= 2}>
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
        <Box>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setLines([...lines, { account: "5900", debit: "", credit: "" }])}>
            {L("ఇంకో లైన్", "Another line")}
          </Button>
        </Box>
        <Typography color={debit === credit ? "text.primary" : "error"} sx={{ fontWeight: 600 }}>
          {L(`డెబిట్ ${formatINR(debit)} · క్రెడిట్ ${formatINR(credit)}`, `Debit ${formatINR(debit)} · Credit ${formatINR(credit)}`)}
          {debit !== credit ? L(" — సమానంగా లేవు", " — not equal") : ""}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("వద్దు", "Cancel")}</Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("ఎంట్రీ సేవ్ చేయి", "Save entry")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const TYPE_LABEL: Record<string, { te: string; en: string }> = {
  asset: { te: "ఆస్తి", en: "Asset" },
  liability: { te: "అప్పు", en: "Liability" },
  equity: { te: "యజమాని వాటా", en: "Owner's equity" },
  income: { te: "ఆదాయం", en: "Income" },
  expense: { te: "ఖర్చు", en: "Expense" },
};

/** Module 4b — the books: the owner, and (Module 4d) the Finance Head and Accountant roles. Everything here is worked out from the CRM's own documents when the page loads. */
export function BooksPage() {
  const { L, lang } = useLang();
  const session = useSession();
  // Locking / reopening a month stays with the owner; the finance roles see the books and add entries.
  const isOwner = session.status === "loggedIn" && session.profile.role === "admin";
  const [from, setFrom] = useState(monthStart(todayIso()));
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<LedgerReport | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    async (acc: string) => {
      if (from > to) return;
      setBusy(true);
      setError(null);
      try {
        setReport(await ledgerReport({ from, to, ...(acc ? { account: acc } : {}) }));
        setAccount(acc);
      } catch (e) {
        setError(errorText(e, lang));
      } finally {
        setBusy(false);
      }
    },
    [from, to, lang],
  );
  useEffect(() => {
    void load("");
    // first load only; later loads are started by the buttons
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = (code: string) => {
    const a = report?.accounts.find((x) => x.code === code);
    return a ? `${code} · ${L(a.te, a.en)}` : code;
  };
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      await load("");
    } catch (e) {
      setError(errorText(e, lang));
    }
  };
  const lockable = prevMonth(todayIso());
  /** Plain accounting CSV (one row per journal line). Not a native Tally file — the accountant imports it with Tally / Zoho's own import. */
  const exportCsv = async () => {
    setError(null);
    try {
      const r = await ledgerExport({ from, to });
      const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const head = ["Date", "Voucher", "Type", "Account code", "Account", "Debit", "Credit", "Narration"];
      const lines = [head.map(q).join(",")].concat(r.rows.map((x) => [x.day, x.voucher, x.kind, x.account, x.accountEn, x.debit.toFixed(2), x.credit.toFixed(2), x.narration].map(q).join(",")));
      const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `books_${from}_to_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (r.truncated) setError(L("చాలా ఎక్కువ వరుసలు ఉన్నాయి — తేదీల పరిధి తగ్గించి మళ్లీ ఎగుమతి చేయండి.", "Too many rows — the file stops early. Narrow the dates and export again."));
    } catch (e) {
      setError(errorText(e, lang));
    }
  };

  const lock = () => {
    if (window.confirm(L(`${lockable} వరకు పుస్తకాలు లాక్ చేయాలా? ఆ నెల తేదీలతో చేతి ఎంట్రీలు మార్చలేరు.`, `Lock the books through ${lockable}? Hand-written entries dated in that month can no longer be changed.`))) void act(() => lockPeriod({ month: lockable }));
  };
  const unlock = () => {
    const reason = (window.prompt(L("చివరి లాక్ అయిన నెలను తిరిగి తెరవడానికి కారణం రాయండి", "Why are you reopening the last locked month?")) ?? "").trim();
    if (reason) void act(() => unlockPeriod({ reason }));
  };
  const cancelEntry = (id: string) => {
    const reason = (window.prompt(L("ఈ చేతి ఎంట్రీ రద్దు చేయడానికి కారణం రాయండి", "Why are you cancelling this hand-written entry?")) ?? "").trim();
    if (reason) void act(() => cancelJournalEntry({ id, reason }));
  };

  const bs = report?.balanceSheet;
  const pl = report?.profitAndLoss;
  return (
    <Box>
      <PageHeader
        title={L("ఖాతా పుస్తకం", "Books (ledger)")}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={!report}>
            {L("చేతి ఎంట్రీ", "Hand-written entry")}
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField size="small" type="date" label={L("నుండి", "From")} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label={L("వరకు", "To")} value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="outlined" onClick={() => void load("")} disabled={busy || from > to}>
          {busy ? L("లెక్కిస్తున్నాం…", "Working it out…") : L("చూపించు", "Show")}
        </Button>
        <Button variant="outlined" onClick={() => void exportCsv()} disabled={busy || from > to}>
          {L("CSV ఎగుమతి (అకౌంటెంట్ కోసం)", "Export CSV (for the accountant)")}
        </Button>
        {report && <Chip size="small" label={report.lockedThrough ? L(`${report.lockedThrough} వరకు లాక్`, `Locked through ${report.lockedThrough}`) : L("ఏ నెలా లాక్ కాలేదు", "No month locked")} />}
        {isOwner && report && report.lockedThrough < lockable && (
          <Button size="small" onClick={lock}>
            {L(`${lockable} వరకు లాక్ చేయి`, `Lock through ${lockable}`)}
          </Button>
        )}
        {isOwner && report?.lockedThrough && (
          <Button size="small" onClick={unlock}>
            {L("చివరి నెల తిరిగి తెరువు", "Reopen the last month")}
          </Button>
        )}
      </Box>
      {report && pl && bs && (
        <>
          {(!report.totals.balanced || !bs.balanced || report.skipped > 0) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {L("పుస్తకం సమతుల్యంగా లేదు — ఇది లోపం. Claude కి చెప్పండి.", "The books do not balance — this is a fault. Report it.")}
            </Alert>
          )}
          <StatRow>
            <StatCard label={L("ఈ కాలంలో ఆదాయం", "Income in the period")} value={formatINR(pl.income)} />
            <StatCard label={L("ఈ కాలంలో ఖర్చు", "Expenses in the period")} value={formatINR(pl.expenses)} />
            <StatCard label={L("లాభం / నష్టం", "Profit / loss")} value={formatINR(pl.profit)} tone={pl.profit >= 0 ? "good" : "warn"} />
          </StatRow>
          <StatRow>
            <StatCard label={L(`${report.to} నాటికి ఆస్తులు`, `Assets as on ${report.to}`)} value={formatINR(bs.assets)} />
            <StatCard label={L("అప్పులు", "Liabilities")} value={formatINR(bs.liabilities)} />
            <StatCard label={L("యజమాని వాటా + లాభం", "Owner's equity + profit")} value={formatINR(Math.round((bs.equity + bs.profit) * 100) / 100)} />
          </StatRow>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2, mb: 1 }}>
            {L(`ఖాతాల వారీ నిల్వ (${report.to} నాటికి)`, `Balance by account (as on ${report.to})`)}
          </Typography>
          <DataTable
            rows={report.trialBalance}
            rowKey={(r) => r.account}
            onRowClick={(r) => void load(r.account)}
            columns={[
              { label: L("ఖాతా", "Account"), render: (r) => name(r.account) },
              { label: L("రకం", "Type"), hideOnMobile: true, render: (r) => L(TYPE_LABEL[r.type].te, TYPE_LABEL[r.type].en) },
              { label: L("డెబిట్", "Debit"), align: "right", hideOnMobile: true, render: (r) => formatINR(r.debit) },
              { label: L("క్రెడిట్", "Credit"), align: "right", hideOnMobile: true, render: (r) => formatINR(r.credit) },
              { label: L("నిల్వ", "Balance"), align: "right", render: (r) => formatINR(r.balance) },
            ]}
          />
          <Typography variant="caption" color="text.secondary">
            {L(`మొత్తం డెబిట్ ${formatINR(report.totals.debit)} = మొత్తం క్రెడిట్ ${formatINR(report.totals.credit)} · ${report.entryCount} ఎంట్రీలు. ఖాతా మీద నొక్కితే ఈ కాలంలోని వివరాలు.`, `Total debit ${formatINR(report.totals.debit)} = total credit ${formatINR(report.totals.credit)} · ${report.entryCount} entries. Click an account for its lines in the period.`)}
          </Typography>
          {account && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                {L(`${name(account)} — ${report.from} నుండి ${report.to}`, `${name(account)} — ${report.from} to ${report.to}`)}
              </Typography>
              <DataTable
                rows={report.lines.map((l, i) => ({ ...l, key: `${l.collection}/${l.id}/${i}` }))}
                rowKey={(l) => l.key}
                columns={[
                  { label: L("తేదీ", "Date"), render: (l) => l.day },
                  { label: L("వివరం", "Details"), render: (l) => l.memo },
                  { label: L("డెబిట్", "Debit"), align: "right", render: (l) => (l.debit ? formatINR(l.debit) : "") },
                  { label: L("క్రెడిట్", "Credit"), align: "right", render: (l) => (l.credit ? formatINR(l.credit) : "") },
                  {
                    label: "",
                    render: (l) =>
                      l.kind === "manual" ? (
                        <Button size="small" color="error" onClick={() => cancelEntry(l.id)}>
                          {L("రద్దు", "Cancel")}
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </Box>
          )}
        </>
      )}
      <MonthClosePanel isOwner={isOwner} onLocked={() => void load("")} />
      <BankReconPanel />
      {adding && report && <EntryDialog accounts={report.accounts} onClose={() => setAdding(false)} onSaved={() => void load("")} />}
    </Box>
  );
}
