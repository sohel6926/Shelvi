import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackagePricePanel } from "./PackagePricePanel";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { useLang } from "../../i18n/LanguageContext";
import {
  SEED_MENU_COUNT,
  linkMenuOption,
  seedMenuPackages,
  subscribeMenuPackages,
  type MenuPackage,
} from "../../data/menuPackageRepository";
import { ErrorBox, rupees, ScreenTitle } from "../../components/ui";
import { subscribeDishes, type Dish } from "../../data/dishRepository";
import { addYears, formatDay, istDay } from "../../util/dates";
import { tokens } from "../../theme/tokens";
import { listImages } from "../../data/uploads";
import { PhotoUploadButton } from "../../components/PhotoUpload";
import { allOf, refreshFromServer } from "../../data/refresh";
import { liveRows, visibleRows } from "../../data/cancel";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";

/** Photos of one menu (Storage `menus/{id}/`); admin and managers may add. */
function MenuPhotos({ menuId, canUpload }: { menuId: string; canUpload: boolean }) {
  const [urls, setUrls] = useState<string[]>([]);
  const load = useCallback(
    () => listImages(`menus/${menuId}`).then((l) => setUrls(l.map((i) => i.url)), () => setUrls([])),
    [menuId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (urls.length === 0 && !canUpload) return null;
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1.5 }}>
      {urls.slice(0, 4).map((u) => (
        <Box key={u} component="a" href={u} target="_blank" rel="noopener" sx={{ width: 64, height: 48, borderRadius: 1, overflow: "hidden" }}>
          <Box component="img" src={u} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </Box>
      ))}
      {canUpload && <PhotoUploadButton folder={`menus/${menuId}`} onUploaded={() => load()} />}
    </Box>
  );
}

const MEAL_TYPES: Record<string, { te: string; en: string }> = {
  tiffin: { te: "టిఫిన్", en: "Tiffin" },
  lunch: { te: "భోజనం", en: "Lunch" },
  dinner: { te: "రాత్రి భోజనం", en: "Dinner" },
  "lunch-dinner": { te: "భోజనం + రాత్రి", en: "Lunch + dinner" },
};

/** Reminder only (calc-spec §11 priceReviewDue): 12 months after the menu's price date. */
function reviewDue(menuDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(menuDate) && istDay() >= addYears(menuDate, 1);
}

/** Admin: link a menu option to a dish (Round 8 plans use these links). */
function LinkDishDialog({ target, dishes, onClose }: { target: { pkg: MenuPackage; gi: number; oi: number } | null; dishes: Dish[]; onClose: () => void }) {
  const { L, T, lang } = useLang();
  const opt = target ? target.pkg.groups[target.gi]?.[target.oi] : undefined;
  const [dishId, setDishId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [pieces, setPieces] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opt) return;
    // Suggest a dish with the same name when the option is not linked yet.
    const norm = (x: string) => x.trim().toLowerCase();
    const guess = opt.dishId ?? dishes.find((d) => (d.nameEn && norm(d.nameEn) === norm(opt.en)) || (d.nameTe && norm(d.nameTe) === norm(opt.te)))?.id ?? "";
    setDishId(guess);
    setVariantId(opt.variantId ?? "");
    setPieces(opt.piecesPerPlate ? String(opt.piecesPerPlate) : "");
    setError(null);
  }, [opt, dishes]);

  if (!target || !opt) return null;
  const dish = dishes.find((d) => d.id === dishId);

  const save = async (unlink = false) => {
    setBusy(true);
    setError(null);
    try {
      await linkMenuOption(
        target.pkg.id,
        target.gi,
        target.oi,
        unlink ? null : { dishId, ...(variantId ? { variantId } : {}), piecesPerPlate: pieces.trim() && Number(pieces) > 0 ? Number(pieces) : null },
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>
        {L("వంటకంతో జత చేయి", "Link to a dish")} — {T(opt)}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">
          {L("ఈ మెనూ ఐటమ్ ఏ వంటకమో చెబితే, ఈ మెనూ ఉన్న ప్రతి event కి వంట plan వస్తుంది.", "Tell which dish this menu item is and every event with this menu gets a cooking plan.")}
        </Typography>
        <TextField select size="small" label={L("వంటకం", "Dish")} value={dishId} onChange={(e) => { setDishId(e.target.value); setVariantId(""); }}>
          {dishes.length === 0 && (
            <MenuItem value="" disabled>
              {L("ముందు \"వంటకాలు\" పేజీలో వంటకం చేర్చండి", "Add dishes on the Dishes page first")}
            </MenuItem>
          )}
          {dishes.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe}
            </MenuItem>
          ))}
        </TextField>
        {dish && dish.variants.length > 0 && (
          <TextField select size="small" label={L("రకం", "Variant")} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <MenuItem value="">{L("సాధారణం", "Plain")}</MenuItem>
            {dish.variants.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {lang === "te" ? v.nameTe || v.nameEn : v.nameEn || v.nameTe}
              </MenuItem>
            ))}
          </TextField>
        )}
        {dish?.unit === "pcs" && (
          <TextField size="small" label={L("ఒక్కొక్కరికి ఎన్ని (ఐచ్ఛికం)", "Pieces per plate (optional)")} value={pieces} onChange={(e) => setPieces(e.target.value)} />
        )}
      </DialogContent>
      <DialogActions>
        {opt.dishId && (
          <Button color="error" onClick={() => save(true)} disabled={busy} sx={{ mr: "auto" }}>
            {L("జత తీసేయి", "Unlink")}
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          {L("వద్దు", "Back")}
        </Button>
        <Button variant="contained" onClick={() => save()} disabled={busy || !dishId}>
          {L("జత చేయి", "Link")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function MenuPackagesPage() {
  const { L, T, lang } = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const uid = session.status === "loggedIn" ? session.profile.uid : "";
  const [menus, setMenus] = useState<MenuPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState<number | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [linking, setLinking] = useState<{ pkg: MenuPackage; gi: number; oi: number } | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  useEffect(() => subscribeDishes((d) => setDishes(d.filter((x) => !x.cancelled && !x.isSubRecipe)), () => setDishes([])), []);
  const dishName = (id: string) => {
    const d = dishes.find((x) => x.id === id);
    return d ? L(d.nameTe || d.nameEn, d.nameEn || d.nameTe) : id;
  };

  useEffect(() => subscribeMenuPackages(setMenus, (e) => setError(e.message)), []);

  async function seed() {
    setSeeding(true);
    setError(null);
    try {
      setSeeded(await seedMenuPackages(uid, new Set((menus ?? []).filter((m) => m.cancelled).map((m) => m.id)), menus ?? []));
      setConfirmSeed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <ScreenTitle
        title={L("మెనూ ప్యాకేజీలు", "Menu packages")}
        subtitle={L("ప్రతి \"/\" గుంపులో customer ఒకటి ఎంచుకుంటారు.", "In each \"/\" group the customer picks one option.")}
        onRefresh={() => refreshFromServer(allOf("menuPackages"))}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {can.quote(role) && (
              <Button variant="contained" startIcon={<NoteAddIcon />} onClick={() => navigate("/quotes/new")}>
                {L("కొత్త కొటేషన్", "New quote")}
              </Button>
            )}
            {role === "admin" && (
              <Button variant={linkMode ? "contained" : "outlined"} onClick={() => setLinkMode((v) => !v)}>
                {linkMode ? L("జత చేయడం అయిపోయింది", "Done linking") : L("🔗 వంటకాలు జత చేయి", "🔗 Link dishes")}
              </Button>
            )}
            {role === "admin" && (
              <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => setConfirmSeed(true)}>
                {L("యజమాని మెనూలు ఎక్కించు", "Load owner's menus")}
              </Button>
            )}
          </Box>
        }
      />
      <ErrorBox message={error} />
      {seeded !== null && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {L(`${seeded} మెనూలు ఎక్కించాం.`, `${seeded} menus loaded.`)}
        </Alert>
      )}
      {menus === null ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : menus.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography>
            {L("ఇంకా మెనూ ప్యాకేజీలు లేవు.", "No menu packages yet.")}{" "}
            {role === "admin" &&
              L(
                `పైన "యజమాని మెనూలు ఎక్కించు" నొక్కితే ${SEED_MENU_COUNT} మెనూలు వస్తాయి.`,
                `Press "Load owner's menus" above to add the ${SEED_MENU_COUNT} menus.`,
              )}
          </Typography>
        </Paper>
      ) : (
        <>
        <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={menus.length - liveRows(menus).length} />
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          {visibleRows(menus, showCancelled).map((m) => (
            <Paper key={m.id} sx={{ p: 2.5, opacity: m.active && !m.cancelled ? 1 : 0.6 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start" }}>
                <Box>
                  <Typography variant="h6" component="h2">
                    {L(m.nameTe || m.nameEn, m.nameEn || m.nameTe)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {T(MEAL_TYPES[m.mealType]) || m.mealType}
                    {m.deliveryWindow && ` · ${L("సమయం", "Delivery")} ${m.deliveryWindow}`}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="kpi" component="p" sx={{ fontSize: "1.75rem", lineHeight: 1.2 }}>
                    {rupees(m.pricePerPlate)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {L("ఒక ప్లేట్‌కి", "per plate")}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", my: 1.5 }}>
                <Chip size="small" label={L(`కనీసం ${m.minOrder} ప్లేట్లు`, `Min ${m.minOrder} plates`)} />
                {m.freePlates && (
                  <Chip
                    size="small"
                    color="success"
                    label={L(
                      `ప్రతి ${m.freePlates.perPlates} కి ${m.freePlates.extraPlates} ఉచితం`,
                      `${m.freePlates.extraPlates} free per ${m.freePlates.perPlates}`,
                    )}
                  />
                )}
                {m.servingBoy.freeRule === "per50" && (
                  <Chip size="small" color="success" label={L("50 ప్లేట్లకి 1 serving boy ఉచితం", "1 free serving boy per 50")} />
                )}
                <Chip size="small" label={L(`Serving boy ${rupees(m.servingBoy.chargePerPerson)}`, `Serving boy ${rupees(m.servingBoy.chargePerPerson)}`)} />
                {m.transportCharged && <Chip size="small" color="info" label={L("రవాణా అదనం", "Transport extra")} />}
                {!m.active && <Chip size="small" label={L("ఆపివేయబడింది", "Inactive")} />}
                {m.cancelled && <CancelledChip archived reason={m.cancelReason} />}
                {reviewDue(m.menuDate) && (
                  <Chip size="small" color="warning" label={L("ధర సమీక్ష సమయం", "Price review due")} />
                )}
              </Box>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {m.groups.map((g, i) => (
                  <Box component="li" key={i} sx={{ py: 0.25 }}>
                    {g.map((o, j) => (
                      <Box component="span" key={j}>
                        {j > 0 && " / "}
                        {T(o)}
                        {o.dishId ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            color="success"
                            label={`🔗 ${dishName(o.dishId)}${o.piecesPerPlate ? ` · ${o.piecesPerPlate}` : ""}`}
                            onClick={role === "admin" && !m.cancelled ? () => setLinking({ pkg: m, gi: i, oi: j }) : undefined}
                            sx={{ ml: 0.5, height: 22 }}
                          />
                        ) : linkMode && role === "admin" && !m.cancelled ? (
                          <Chip size="small" variant="outlined" label="🔗" onClick={() => setLinking({ pkg: m, gi: i, oi: j })} sx={{ ml: 0.5, height: 22 }} />
                        ) : null}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
              {(m.replacements.length > 0 || m.extras.length > 0) && (
                <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${tokens.color.border}` }}>
                  {m.replacements.map((r) => (
                    <Typography key={r.key} variant="body2">
                      {L("మార్పు", "Swap")}: {T(r)} (+{rupees(r.extraPerPlate)} {L("ప్లేట్‌కి", "/plate")})
                    </Typography>
                  ))}
                  {m.extras.map((e) => (
                    <Typography key={e.key} variant="body2">
                      {L("అదనం", "Extra")}: {T(e)} — {e.price === null ? L("ధర అడగాలి", "price on request") : rupees(e.price)}
                    </Typography>
                  ))}
                </Box>
              )}
              {role !== "staff" && <PackagePricePanel pkg={m} role={role} />}
              <MenuPhotos menuId={m.id} canUpload={can.uploadPhotos(role)} />
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2, gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {L("ధర తేదీ", "Price date")}: {formatDay(m.menuDate, lang)}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {can.quote(role) && m.active && !m.cancelled && (
                    <Button size="small" onClick={() => navigate(`/quotes/new?menu=${encodeURIComponent(m.id)}`)}>
                      {L("ఈ మెనూతో కొటేషన్", "Quote this menu")}
                    </Button>
                  )}
                  {!m.cancelled && <CancelButton collection="menuPackages" id={m.id} what={L(m.nameTe || m.nameEn, m.nameEn || m.nameTe)} />}
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
        </>
      )}

      <LinkDishDialog target={linking} dishes={dishes} onClose={() => setLinking(null)} />
      <Dialog open={confirmSeed} onClose={() => !seeding && setConfirmSeed(false)}>
        <DialogTitle>{L("యజమాని మెనూలు ఎక్కించాలా?", "Load the owner's menus?")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {L(
              `${SEED_MENU_COUNT} మెనూలు (టిఫిన్ 1–5, డిన్నర్ 1–3, లంచ్, లంచ్/డిన్నర్) ఎక్కుతాయి. ఇదివరకే ఉన్న అదే code మెనూలు మళ్ళీ ఈ ధరలతో మారుతాయి.`,
              `This adds ${SEED_MENU_COUNT} menus (Tiffin 1–5, Dinner 1–3, Lunch, Lunch/Dinner). Menus with the same code are overwritten with these prices.`,
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSeed(false)} disabled={seeding}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={seed} disabled={seeding}>
            {seeding ? L("ఎక్కిస్తున్నాం…", "Loading…") : L("ఎక్కించు", "Load menus")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
