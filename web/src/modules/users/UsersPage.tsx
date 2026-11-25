import { useEffect, useState } from "react";
import { Alert, Box, Chip, MenuItem, Switch, TextField, Typography } from "@mui/material";
import { rolesForLevel } from "../../data/roles";
import { useSession } from "../../auth/AuthProvider";
import { useLang } from "../../i18n/LanguageContext";
import { subscribeUsers, updateUser, type AppUser } from "../../data/records";
import { subscribeActiveBranches, type Branch } from "../../data/branchRepository";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { allOf, refreshFromServer } from "../../data/refresh";
import { formatDate } from "../../util/format";

/**
 * Admin screen to approve new sign-ups (they start inactive), and set each user's role and branch.
 * Mirrors ui/users/UserManagementScreen.kt on Android.
 */
export function UsersPage() {
  const session = useSession();
  const { L, lang } = useLang();
  const myUid = session.status === "loggedIn" ? session.profile.uid : "";
  const [users, setUsers] = useState<AppUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => subscribeUsers(setUsers, () => setError(L("వినియోగదారులను యజమాని మాత్రమే మార్చగలరు.", "Only admins can manage users."))),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => subscribeActiveBranches(setBranches), []);

  async function change(uid: string, changes: Partial<Pick<AppUser, "active" | "role" | "branchId" | "jobRole">>) {
    setError(null);
    try {
      await updateUser(uid, changes);
    } catch {
      setError(L("ఈ వినియోగదారుని మార్చలేకపోయాం.", "Could not update this user."));
    }
  }

  const pending = users.filter((u) => !u.active && u.role !== "admin");

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader title={L("వినియోగదారులు", "Users")} onRefresh={() => refreshFromServer(allOf("users"), allOf("branches"))} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <StatRow>
        <StatCard label={L("అనుమతి కోసం ఎదురుచూస్తున్నవారు", "Waiting for approval")} value={pending.length} tone={pending.length ? "warn" : "good"} />
        <StatCard label={L("పనిచేస్తున్న వినియోగదారులు", "Active users")} value={users.filter((u) => u.active).length} />
      </StatRow>
      {pending.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {L(
            "కొత్తగా చేరినవారికి శాఖ ఇచ్చి 'పని చేస్తున్నారు' ఆన్ చేసేవరకు ఏ data కనిపించదు.",
            "New sign-ups cannot see any data until you set their branch and turn on Active.",
          )}
        </Alert>
      )}
      <DataTable
        rows={users}
        rowKey={(u) => u.uid}
        emptyText={L("వినియోగదారులు లేరు.", "No users.")}
        columns={[
          {
            label: L("వినియోగదారు", "User"),
            render: (u) => (
              <>
                <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
                  {u.name || L("(పేరు లేదు)", "(no name)")} {u.uid === myUid && <Chip size="small" label={L("మీరు", "You")} sx={{ ml: 0.5 }} />}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {u.email}
                </Typography>
              </>
            ),
          },
          { label: L("చేరిన తేదీ", "Joined"), hideOnMobile: true, render: (u) => formatDate(u.createdAt, lang) },
          {
            label: L("పాత్ర", "Role"),
            render: (u) => (
              <TextField
                select
                size="small"
                value={u.role}
                disabled={u.uid === myUid}
                onChange={(e) => change(u.uid, { role: e.target.value as AppUser["role"], jobRole: "" })}
              >
                <MenuItem value="staff">{L("సిబ్బంది", "Staff")}</MenuItem>
                <MenuItem value="manager">{L("మేనేజర్", "Manager")}</MenuItem>
                <MenuItem value="admin">{L("యజమాని (Admin)", "Admin")}</MenuItem>
              </TextField>
            ),
          },
          {
            label: L("పని పాత్ర", "Job role"),
            render: (u) =>
              u.role === "admin" ? (
                L("యజమాని / CEO", "Owner / CEO")
              ) : (
                <TextField select size="small" value={rolesForLevel(u.role).some((r) => r.code === u.jobRole) ? u.jobRole : ""} onChange={(e) => change(u.uid, { jobRole: e.target.value })} sx={{ minWidth: 170 }}>
                  <MenuItem value="">{u.role === "manager" ? L("ఇవ్వలేదు (అన్ని పనులు)", "Not given (all work)") : L("ఇవ్వలేదు (సిబ్బంది)", "Not given (staff)")}</MenuItem>
                  {rolesForLevel(u.role).map((r) => (
                    <MenuItem key={r.code} value={r.code}>
                      {L(r.te, r.en)}
                    </MenuItem>
                  ))}
                </TextField>
              ),
          },
          {
            label: L("శాఖ", "Branch"),
            render: (u) => (
              <TextField
                select
                size="small"
                value={u.branchId}
                onChange={(e) => change(u.uid, { branchId: e.target.value })}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="">
                  <em>{L("ఏదీ లేదు", "None")}</em>
                </MenuItem>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            ),
          },
          {
            label: L("పని చేస్తున్నారు", "Active"),
            render: (u) => (
              <Switch
                checked={u.active}
                disabled={u.uid === myUid}
                onChange={(e) => change(u.uid, { active: e.target.checked })}
              />
            ),
          },
        ]}
      />
    </Box>
  );
}
