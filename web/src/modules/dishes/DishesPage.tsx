import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import { CATEGORY_LABEL, DISH_CATEGORIES, ROLE_LABEL, learnBadge, subscribeDishes, type Dish, type DishCategory } from "../../data/dishRepository";
import { liveRows, visibleRows } from "../../data/cancel";
import { allOf, refreshFromServer } from "../../data/refresh";
import { DataTable, PageHeader } from "../../components/DataTable";
import { CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { LearnChip, qtyText } from "../kitchen/PlanViews";

/** Round 8 dish master list: category, role, learning badge, per-100. */
export function DishesPage() {
  const { L, T, lang } = useLang();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Dish[] | null>(null);
  const [cat, setCat] = useState<DishCategory | "">("");
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeDishes(setRows, (e) => setError(e.message)), []);

  const all = useMemo(() => rows ?? [], [rows]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleRows(all, showCancelled).filter(
      (d) => (!cat || d.category === cat) && (!q || d.nameTe.toLowerCase().includes(q) || d.nameEn.toLowerCase().includes(q)),
    );
  }, [all, cat, search, showCancelled]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of liveRows(all)) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [all]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("వంటకాలు (నేర్చుకునే లెక్క)", "Dishes (learning)")}
        onRefresh={() => refreshFromServer(allOf("dishes"))}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/dishes/new")}>
            {L("కొత్త వంటకం", "New dish")}
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {rows !== null && all.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {L(
            "ఇంకా వంటకాలు లేవు. మొదట మీరు చేసే వంటకాలు (పులిహోర, సాంబారు, పుల్కా…) చేర్చండి — రకం, యూనిట్, 100 మందికి మీ అంచనా. తర్వాత ప్రతి event అయ్యాక వంట నమోదు చేస్తే CRM నేర్చుకుంటుంది.",
            "No dishes yet. Add the dishes you make (pulihora, sambar, pulka…) with category, unit and your guess per 100 guests. Then log each event's cooking and the CRM learns.",
          )}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Chip label={L(`అన్నీ (${liveRows(all).length})`, `All (${liveRows(all).length})`)} color={!cat ? "primary" : "default"} onClick={() => setCat("")} />
        {DISH_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
          <Chip key={c} label={`${T(CATEGORY_LABEL[c])} (${counts.get(c)})`} color={cat === c ? "primary" : "default"} onClick={() => setCat(c)} />
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField size="small" placeholder={L("వెతకండి", "Search")} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 220px" }} />
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={all.length - liveRows(all).length} />
      </Box>
      <DataTable
        rows={shown}
        rowKey={(d) => d.id}
        onRowClick={(d) => navigate(`/dishes/${d.id}`)}
        emptyText={rows === null ? L("లోడ్ అవుతోంది…", "Loading…") : L("వంటకాలు లేవు.", "No dishes.")}
        columns={[
          { label: L("వంటకం", "Dish"), render: (d) => `${lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe}${d.isSubRecipe ? L(" · బేస్", " · base") : ""}` },
          { label: L("రకం", "Category"), hideOnMobile: true, render: (d) => T(CATEGORY_LABEL[d.category]) },
          { label: L("పాత్ర", "Role"), hideOnMobile: true, render: (d) => T(ROLE_LABEL[d.role]).split(" (")[0] },
          {
            label: L("100 మందికి", "Per 100"),
            align: "right",
            render: (d) => {
              const v = d.learned?.per100 ?? d.basePer100;
              return v === null || v === undefined ? "—" : `${qtyText(v)} ${d.unit}`;
            },
          },
          {
            label: L("నేర్చుకోవడం", "Learning"),
            render: (d) => (d.cancelled ? <CancelledChip archived reason={d.cancelReason} /> : <LearnChip {...learnBadge(d.learned?.eventsUsed ?? 0)} />),
          },
        ]}
      />
    </Box>
  );
}
