import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, Paper, Typography } from "@mui/material";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { markNotificationRead, subscribeNotifications, type AppNotification } from "../../data/notificationsRepository";
import { PageHeader } from "../../components/DataTable";
import { RefreshButton } from "../../components/RefreshButton";
import { refreshFromServer } from "../../data/refresh";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { qtyText } from "../kitchen/PlanViews";

const KIND_LABEL: Record<string, { te: string; en: string; color: "success" | "warning" | "info" }> = {
  "plan-ready": { te: "Plan సిద్ధం", en: "Plan ready", color: "success" },
  "plan-changed": { te: "Plan మారింది", en: "Plan changed", color: "warning" },
  "plan-tomorrow": { te: "రేపటి plan", en: "Tomorrow's plan", color: "info" },
  "date-changed": { te: "తేదీ మారింది", en: "Date changed", color: "warning" },
};

/** Round 8: kitchen notifications (plan ready / changed / tomorrow) with a link to the Day plan. */
export function NotificationsPage() {
  const { L, T, lang } = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const [rows, setRows] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => (profile ? subscribeNotifications(profile.role, setRows, (e) => setError(e.message)) : undefined), [profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (n: AppNotification) => {
    if (profile && !n.readBy.includes(profile.uid)) {
      try {
        await markNotificationRead(n.id, profile.uid);
      } catch {
        /* reading still works */
      }
    }
    if (n.link) navigate(n.link);
  };

  const unread = (rows ?? []).filter((n) => profile && !n.readBy.includes(profile.uid));
  const markAll = async () => {
    if (!profile) return;
    await Promise.all(unread.map((n) => markNotificationRead(n.id, profile.uid).catch(() => undefined)));
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <PageHeader
        title={L("సందేశాలు (వంట plan)", "Notifications (cooking plans)")}
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {/* R10-15: Refresh re-reads the same query from the server (the list is live anyway). */}
            {profile && (
              <RefreshButton
                onRefresh={() => refreshFromServer(query(collection(db, "notifications"), where("audienceRoles", "array-contains", profile.role)))}
              />
            )}
            {unread.length > 0 && (
              <Button size="small" onClick={markAll}>
                {L("అన్నీ చదివాను", "Mark all read")}
              </Button>
            )}
          </Box>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {rows !== null && rows.length === 0 && (
        <Typography color="text.secondary">
          {L(
            "ఇంకా సందేశాలు లేవు. ఒక బుకింగ్ కి వంట plan మొదటిసారి తయారైనప్పుడు, మెనూ / అతిథులు మారి plan మారినప్పుడు, ముందు రోజు సాయంత్రం 6 కి ఇక్కడ సందేశం వస్తుంది.",
            "No notifications yet. You get one when a booking's plan is first ready, when a menu / guest change moves a number, and at 6 PM the day before.",
          )}
        </Typography>
      )}
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {(rows ?? []).map((n) => {
          const isUnread = profile ? !n.readBy.includes(profile.uid) : false;
          const kind = KIND_LABEL[n.kind];
          return (
            <Paper
              key={n.id}
              onClick={() => open(n)}
              sx={{ p: 2, cursor: n.link ? "pointer" : "default", borderLeft: 4, borderColor: isUnread ? "primary.main" : "transparent" }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  {kind && <Chip size="small" color={kind.color} label={T(kind)} />}
                  {isUnread && <Chip size="small" variant="outlined" label={L("కొత్తది", "New")} />}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {n.createdAt?.toLocaleString(dateLocale(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </Typography>
              </Box>
              <Typography sx={{ mt: 1, fontWeight: isUnread ? 600 : 400, whiteSpace: "pre-line" }}>{T(n.title)}</Typography>
              {n.changes.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {n.changes.map((c) => (
                    <Typography component="li" variant="body2" key={c.key}>
                      {lang === "te" ? c.nameTe || c.nameEn : c.nameEn || c.nameTe}: {qtyText(c.old)} → <b>{qtyText(c.now)}</b> {c.unit}
                    </Typography>
                  ))}
                </Box>
              )}
              {n.link && (
                <Typography variant="body2" color="primary" sx={{ mt: 0.5 }}>
                  {n.link.startsWith("/day-plan") ? L("రోజు plan తెరువు", "Open the day plan") : L("తెరువు", "Open it")}
                </Typography>
              )}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
