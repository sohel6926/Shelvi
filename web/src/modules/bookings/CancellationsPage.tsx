import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { errorText, getCancellationReport, type CancellationReport } from "../../data/functions";
import { formatMoney } from "../../util/format";
import { formatDay, istMonth } from "../../util/dates";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { kpiCardSx, tabularNums, tokens } from "../../theme/tokens";
import { reasonLabel } from "./bookingCancelHelpers";

/** Round 9 getCancellationReport for one month (admin: current branch or all; manager: own branch on the server). */
function useCancellationReport(month: string) {
  const { lang } = useLang();
  const { currentBranchId } = useBranch();
  const [data, setData] = useState<CancellationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    () => getCancellationReport({ month, ...(currentBranchId ? { branchId: currentBranchId } : {}) }),
    [month, currentBranchId],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorText(e, lang)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, lang]);

  const refresh = async () => {
    setData(await load());
    setError(null);
  };
  return { data, error, loading, refresh };
}

/** Dashboard card: "ఈ నెల రద్దులు: N, తిరిగి ఇచ్చింది ₹A, ఉంచుకున్నది ₹B". */
export function CancellationsCard() {
  const { L } = useLang();
  const navigate = useNavigate();
  const { data, error, loading } = useCancellationReport(istMonth());
  return (
    <Paper sx={{ ...kpiCardSx("bad"), p: 2.5, height: "100%" }}>
      <Typography variant="body2" color="text.secondary">
        {L("ఈ నెల రద్దులు", "Cancelled this month")}
      </Typography>
      {loading && !data ? (
        <CircularProgress size={22} sx={{ mt: 1 }} />
      ) : error ? (
        <Typography variant="body2" sx={{ color: tokens.color.bad }}>
          {error}
        </Typography>
      ) : data ? (
        <>
          <Typography variant="h4" sx={{ fontWeight: 600, ...tabularNums }}>
            {data.count}
          </Typography>
          <Typography variant="body2" sx={tabularNums}>
            {L("తిరిగి ఇచ్చింది", "Refunded")} {formatMoney(data.refunded)}, {L("ఉంచుకున్నది", "kept")} {formatMoney(data.kept)}
          </Typography>
          <Button size="small" sx={{ mt: 1, px: 0 }} onClick={() => navigate("/cancellations")}>
            {L("కారణాలు చూడండి", "See reasons")}
          </Button>
        </>
      ) : null}
    </Paper>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "bad" | "warning" | "good" | "neutral" }) {
  return (
    <Paper sx={{ ...kpiCardSx(tone), p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 600, ...tabularNums }}>
        {value}
      </Typography>
    </Paper>
  );
}

/** /cancellations — reasons report and the cancelled-orders list with loss. */
export function CancellationsPage() {
  const { L, lang } = useLang();
  const session = useSession();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const [month, setMonth] = useState(istMonth());
  const { data, error, loading, refresh } = useCancellationReport(month);
  const num = { ...tabularNums, textAlign: "right" as const };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("రద్దైన ఆర్డర్లు", "Cancelled orders")}
        subtitle={L("కారణాలు, తిరిగి ఇచ్చిన డబ్బు, ఉంచుకున్న చార్జీ — లెక్కలు server నుండి", "Reasons, refunds and kept charges — figures from the server")}
        onRefresh={refresh}
        action={
          <TextField
            type="month"
            size="small"
            label={L("నెల", "Month")}
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        }
      />
      <ErrorBox message={error} />
      {loading && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {data && (
        <Box sx={{ display: "grid", gap: 2, opacity: loading ? 0.6 : 1 }}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: isAdmin ? "repeat(4, 1fr)" : "repeat(3, 1fr)" } }}>
            <Kpi label={L("రద్దులు", "Cancellations")} value={String(data.count)} tone="bad" />
            <Kpi label={L("తిరిగి ఇచ్చింది", "Refunded")} value={formatMoney(data.refunded)} tone="warning" />
            <Kpi label={L("ఉంచుకున్నది (రద్దు చార్జీ)", "Kept (cancellation charge)")} value={formatMoney(data.kept)} tone="good" />
            {isAdmin && <Kpi label={L("రద్దైన event ఖర్చు (నష్టం)", "Cost of cancelled events (loss)")} value={formatMoney(data.lossOnCancelled)} tone="bad" />}
          </Box>

          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              {L("కారణాల వారీగా", "By reason")}
            </Typography>
            {data.reasons.length === 0 ? (
              <Typography color="text.secondary">{L("ఈ నెల రద్దులు లేవు.", "No cancellations this month.")}</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{L("కారణం", "Reason")}</TableCell>
                      <TableCell sx={num}>{L("ఎన్ని", "Count")}</TableCell>
                      <TableCell sx={num}>{L("తిరిగి", "Refunded")}</TableCell>
                      <TableCell sx={num}>{L("ఉంచుకున్నది", "Kept")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.reasons.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell>{reasonLabel(r.code, r.te, L)}</TableCell>
                        <TableCell sx={num}>{r.count}</TableCell>
                        <TableCell sx={num}>{formatMoney(r.refunded)}</TableCell>
                        <TableCell sx={num}>{formatMoney(r.kept)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>

          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              {L("రద్దైన ఆర్డర్ల జాబితా", "Cancelled orders list")}
            </Typography>
            {data.bookings.length === 0 ? (
              <Typography color="text.secondary">{L("ఏమీ లేవు.", "None.")}</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{L("కస్టమర్", "Customer")}</TableCell>
                      <TableCell>{L("Event తేదీ", "Event date")}</TableCell>
                      <TableCell>{L("రద్దు తేదీ", "Cancelled on")}</TableCell>
                      <TableCell>{L("కారణం", "Reason")}</TableCell>
                      <TableCell>{L("ఎవరు", "By")}</TableCell>
                      <TableCell sx={num}>{L("తిరిగి", "Refunded")}</TableCell>
                      <TableCell sx={num}>{L("ఉంచుకున్నది", "Kept")}</TableCell>
                      {isAdmin && <TableCell sx={num}>{L("నష్టం", "Loss")}</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.bookings.map((b) => (
                      <TableRow key={b.id} hover>
                        <TableCell>
                          <Link component={RouterLink} to={`/bookings/${b.id}`}>
                            {b.customer || L("పేరు లేదు", "Unnamed")}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDay(b.eventDay, lang)}</TableCell>
                        <TableCell>{formatDay(b.cancelledDay, lang)}</TableCell>
                        <TableCell>
                          {reasonLabel(b.reasonCode, "", L)}
                          {b.reason ? (
                            <Typography variant="body2" color="text.secondary">
                              {b.reason}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>{b.by || "—"}</TableCell>
                        <TableCell sx={num}>{formatMoney(b.refund)}</TableCell>
                        <TableCell sx={num}>{formatMoney(b.charge)}</TableCell>
                        {isAdmin && <TableCell sx={{ ...num, color: b.loss > 0 ? tokens.color.bad : undefined }}>{formatMoney(b.loss)}</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
