import { useEffect, useMemo, useState } from "react";
import { Box, Chip, FormControlLabel, Switch, TextField } from "@mui/material";
import { useBranch } from "../../session/BranchContext";
import { useSession } from "../../auth/AuthProvider";
import { roleSees } from "../../data/roles";
import { useLang } from "../../i18n/LanguageContext";
import { can } from "../../auth/roles";
import { fetchStaffWages, subscribeStaff, type Staff } from "../../data/records";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { formatDate, formatINR } from "../../util/format";
import { CancelButton, CancelledChip } from "../../components/CancelControls";
import { StaffDetailDialog } from "./StaffDetailDialog";
import type { Who } from "../../data/staffWorkRepository";
import { istMonth } from "../../util/dates";

export function StaffPage() {
  const { currentBranchId } = useBranch();
  const session = useSession();
  const { L, lang } = useLang();
  // Salaries are admin-only (managers and staff don't see wages).
  const showWages = session.status === "loggedIn" && can.seeSalaries(session.profile.role) && roleSees("salary", session.profile.role, session.profile.jobRole);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  /** R10-1 / R10-2: tap a row → advances, shifts, ratings. */
  const [selected, setSelected] = useState<Staff | null>(null);
  const profile = session.status === "loggedIn" ? session.profile : null;
  const who = useMemo<Who>(
    () => ({ role: profile?.role ?? "staff", branchId: profile?.role === "admin" ? currentBranchId : profile?.branchId ?? null, staffId: profile?.staffId ?? "", uid: profile?.uid ?? "" }),
    [profile?.role, profile?.branchId, profile?.staffId, profile?.uid, currentBranchId],
  );
  const month = istMonth();

  useEffect(() => subscribeStaff(currentBranchId, setStaff), [currentBranchId]);
  // Module 4d: wages are kept in a private document only the owner reads
  const [wages, setWages] = useState<Record<string, number>>({});
  const staffIds = staff.map((s) => s.id).join(",");
  useEffect(() => {
    if (!showWages || !staffIds) return;
    let live = true;
    void fetchStaffWages(staffIds.split(",")).then((w) => live && setWages(w));
    return () => {
      live = false;
    };
  }, [showWages, staffIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter(
      (s) =>
        (showInactive || (s.active && !s.cancelled)) &&
        (!q || s.name.toLowerCase().includes(q) || s.phone.includes(q) || s.jobRole.toLowerCase().includes(q)),
    );
  }, [staff, search, showInactive]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader title={L("సిబ్బంది", "Staff")} onRefresh={() => refreshFromServer(branchQuery("staff", currentBranchId))} />
      <StatRow>
        <StatCard label={L("పనిలో ఉన్నవారు", "Active staff")} value={staff.filter((s) => s.active && !s.cancelled).length} />
        <StatCard label={L("ఆపివేసినవారు", "Inactive")} value={staff.filter((s) => !s.active || s.cancelled).length} />
      </StatRow>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder={L("పేరు / ఫోన్ / పని వెతకండి", "Search name, phone or role")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 240px" }}
        />
        <FormControlLabel
          control={<Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />}
          label={L("ఆపివేసినవారిని / రద్దైనవి చూపించు", "Show inactive / cancelled")}
        />
      </Box>
      <DataTable
        rows={filtered}
        rowKey={(s) => s.id}
        onRowClick={(s) => setSelected(staff.find((x) => x.id === s.id) ?? s)}
        emptyText={L("సిబ్బంది లేరు.", "No staff.")}
        columns={[
          { label: L("పేరు", "Name"), render: (s) => s.name },
          { label: L("పని", "Role"), render: (s) => s.jobRole || "—" },
          { label: L("ఫోన్", "Phone"), hideOnMobile: true, render: (s) => (s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : "—") },
          ...(showWages
            ? [{ label: L("రోజు కూలీ", "Daily wage"), align: "right" as const, hideOnMobile: true, render: (s: Staff) => formatINR(wages[s.id] ?? s.dailyWage) }]
            : []),
          { label: L("చేరిన తేదీ", "Joined"), hideOnMobile: true, render: (s) => formatDate(s.joinedDate, lang) },
          {
            label: L("ఈ నెల ★", "★ this month"),
            align: "right" as const,
            render: (s: Staff) => {
              const r = s.ratings[month];
              return r && r.avg !== null ? `★ ${r.avg} (${r.count})` : "—";
            },
          },
          {
            label: "",
            render: (s) =>
              s.cancelled ? (
                <CancelledChip archived reason={s.cancelReason} />
              ) : (
                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                  {!s.active && <Chip size="small" label={L("ఆపివేశారు", "Inactive")} />}
                  <span onClick={(e) => e.stopPropagation()}>
                    <CancelButton collection="staff" id={s.id} what={s.name} />
                  </span>
                </Box>
              ),
          },
        ]}
      />
      <StaffDetailDialog staff={selected} who={who} onClose={() => setSelected(null)} />
    </Box>
  );
}
