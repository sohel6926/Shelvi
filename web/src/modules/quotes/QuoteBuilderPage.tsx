import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useSession } from "../../auth/AuthProvider";
import { useBusinessSettings } from "../../data/settingsRepository";
import { canOverride, MIN_REASON } from "../../data/calcMode";
import { allOf, refreshFromServer } from "../../data/refresh";
import { useBranch } from "../../session/BranchContext";

const MAX_VALID_DAYS = 90;
import { useLang } from "../../i18n/LanguageContext";
import { subscribeMenuPackages, type MenuPackage } from "../../data/menuPackageRepository";
import { subscribeCustomers, type Customer } from "../../data/customerRepository";
import { errorText, quoteMenu, saveQuotation, type Quote, type QuoteRequest } from "../../data/functions";
import { sessionName, subscribeBooking, SPECIAL_MEAL_LABEL, type Booking, type SpecialMeal } from "../../data/bookingRepository";
import { KidsSpecialEditor } from "../bookings/KidsSpecialEditor";
import { ErrorBox, parseMoney, parseWhole, rupees, rupees2, ScreenTitle } from "../../components/ui";
import { kpiCardSx, tabularNums, tokens } from "../../theme/tokens";

interface ExtraState {
  on: boolean;
  qty: string;
  price: string;
}

const NEW_EXTRA: ExtraState = { on: false, qty: "1", price: "" };

/** R7-5: the form values of one meal session (the builder edits one session at a time). */
interface SessionDraft {
  menuId: string;
  selections: number[];
  plates: string;
  servingBoys: string;
  transport: string;
  discount: string;
  replacements: string[];
  extras: Record<string, ExtraState>;
  /** R10-11 */
  kids: string;
  specials: QuoteSpecial[];
}

/** A special meal row in the builder; `extra` = owner-set extra ₹ per special plate ("" = included in the plate price). */
type QuoteSpecial = SpecialMeal & { extra?: string };

type Translate = (te: string, en: string) => string;

/** Client-side input checks + the quoteMenu request (no money maths here). */
function buildRequest(menu: MenuPackage | null, f: Omit<SessionDraft, "menuId" | "selections">, L: Translate): { request: QuoteRequest | null; problems: string[] } {
  const p: string[] = [];
  if (!menu) return { request: null, problems: p };
  const nPlates = parseWhole(f.plates);
  const nBoys = parseWhole(f.servingBoys) ?? 0;
  const nTransport = parseMoney(f.transport) ?? 0;
  const nDiscount = parseMoney(f.discount) ?? 0;
  if (nPlates === null || Number.isNaN(nPlates) || nPlates < 1) p.push(L("ప్లేట్లు 1 లేదా ఎక్కువ పూర్ణ సంఖ్య కావాలి.", "Plates must be a whole number of 1 or more."));
  if (Number.isNaN(nBoys) || nBoys < 0) p.push(L("Serving boys 0 లేదా ఎక్కువ పూర్ణ సంఖ్య.", "Serving boys must be a whole number of 0 or more."));
  if (Number.isNaN(nTransport)) p.push(L("రవాణా ఖర్చు సరిగా లేదు.", "Transport amount is not valid."));
  if (Number.isNaN(nDiscount)) p.push(L("తగ్గింపు సరిగా లేదు.", "Discount is not valid."));
  // R10-11 kids / special meals (the server checks the same and prices them).
  const nKids = parseWhole(f.kids) ?? 0;
  if (Number.isNaN(nKids) || nKids < 0) p.push(L("పిల్లల సంఖ్య 0 లేదా ఎక్కువ పూర్ణ సంఖ్య.", "Kids must be a whole number of 0 or more."));
  if (nKids > 0 && menu.kidsPrice === null) p.push(L("ఈ మెనూకి పిల్లల ప్లేట్ ధర లేదు — మెనూ ప్యాకేజీలో పెట్టండి లేదా పిల్లలని 0 చేయండి.", "This menu has no kids price — set one on the menu package or make kids 0."));
  const specials: NonNullable<QuoteRequest["specialMeals"]> = [];
  const seen = new Set<string>();
  for (const s of f.specials) {
    const label = L(SPECIAL_MEAL_LABEL[s.type].te, SPECIAL_MEAL_LABEL[s.type].en);
    if (s.count < 1) {
      p.push(L(`${label}: సంఖ్య 1 లేదా ఎక్కువ.`, `${label}: count must be 1 or more.`));
      continue;
    }
    if (s.type !== "other" && seen.has(s.type)) p.push(L(`${label} రెండుసార్లు ఉంది.`, `${label} is listed twice.`));
    seen.add(s.type);
    const extra = s.extra && s.extra.trim() ? parseMoney(s.extra) : null;
    if (extra !== null && Number.isNaN(extra)) p.push(L(`${label}: అదనపు ధర సరిగా లేదు.`, `${label}: extra price is not valid.`));
    specials.push({ type: s.type, count: s.count, ...(s.note.trim() ? { note: s.note.trim() } : {}), ...(extra ? { extraPerPlate: extra } : {}) });
  }
  if (typeof nPlates === "number" && specials.reduce((a, s) => a + s.count, 0) > nPlates) p.push(L("ప్రత్యేక భోజనాలు ప్లేట్ల కంటే ఎక్కువ ఉండకూడదు.", "Special meals cannot be more than the plates."));
  const ex: QuoteRequest["extras"] = [];
  for (const e of menu.extras) {
    const st = f.extras[e.key];
    if (!st?.on) continue;
    const qty = parseWhole(st.qty);
    if (qty === null || Number.isNaN(qty) || qty < 1) {
      p.push(L(`${e.te}: సంఖ్య 1 లేదా ఎక్కువ.`, `${e.en}: quantity must be 1 or more.`));
      continue;
    }
    if (e.price === null) {
      const price = parseMoney(st.price);
      if (price === null || Number.isNaN(price)) {
        p.push(L(`${e.te}: ధర నమోదు చేయండి.`, `${e.en}: enter the price.`));
        continue;
      }
      ex.push({ key: e.key, qty, price });
    } else {
      ex.push({ key: e.key, qty });
    }
  }
  if (p.length > 0) return { request: null, problems: p };
  return {
    request: {
      menuPackageId: menu.id,
      plates: nPlates as number,
      servingBoys: nBoys,
      transport: nTransport,
      replacements: f.replacements,
      extras: ex,
      discount: nDiscount,
      ...(nKids > 0 ? { kidsCount: nKids } : {}),
      ...(specials.length ? { specialMeals: specials } : {}),
    },
    problems: p,
  };
}

/**
 * Quote builder (calc-spec §11). The screen only collects choices; every rupee in the preview
 * comes from the quoteMenu callable, and saveQuotation recomputes the totals on the server.
 */
export function QuoteBuilderPage() {
  const { L, T, lang } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { settings, loaded: settingsLoaded } = useBusinessSettings();
  const mayOverride = canOverride(role, settings.managerCanOverride);
  const [manualOn, setManualOn] = useState(false);
  const [manualTotal, setManualTotal] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const bookingId = params.get("booking") || undefined;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [activeSession, setActiveSession] = useState(params.get("session") ?? "");
  const [drafts, setDrafts] = useState<Record<string, SessionDraft>>({});

  const [menus, setMenus] = useState<MenuPackage[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuId, setMenuId] = useState(params.get("menu") ?? "");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [selections, setSelections] = useState<number[]>([]);
  const [plates, setPlates] = useState("100");
  const [servingBoys, setServingBoys] = useState("0");
  const [transport, setTransport] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [replacements, setReplacements] = useState<string[]>([]);
  const [extras, setExtras] = useState<Record<string, ExtraState>>({});
  const [kids, setKids] = useState("0");
  const [specials, setSpecials] = useState<QuoteSpecial[]>([]);
  const [validDays, setValidDays] = useState("15");
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<Quote | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => subscribeMenuPackages((m) => setMenus(m.filter((x) => !x.cancelled)), (e) => setPreviewError(e.message)), []);
  // Quotation area in manual mode (settings) → start with the manual total switched on.
  useEffect(() => {
    if (settingsLoaded && settings.calcModes.quotation === "manual" && mayOverride) setManualOn(true);
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribeCustomers((c) => setCustomers(c.filter((x) => !x.cancelled))), []);

  const activeMenus = useMemo(() => (menus ?? []).filter((m) => m.active), [menus]);
  const menu = activeMenus.find((m) => m.id === menuId) ?? null;

  // R7-5: the linked booking (customer, and its meal sessions).
  useEffect(() => (bookingId ? subscribeBooking(bookingId, setBooking) : undefined), [bookingId]);
  const liveSessions = useMemo(() => (booking?.sessions ?? []).filter((s) => s.status !== "cancelled"), [booking]);
  const usesSessions = liveSessions.length > 0;
  useEffect(() => {
    if (!booking || customer) return;
    const c = customers.find((x) => x.id === booking.customerId);
    if (c) setCustomer(c);
  }, [booking, customers, customer]);

  const snapshot = (): SessionDraft => ({ menuId, selections, plates, servingBoys, transport, discount, replacements, extras, kids, specials });
  const defaultDraft = (sid: string): SessionDraft => {
    const s = liveSessions.find((x) => x.id === sid);
    const m = activeMenus.find((x) => x.id === s?.packageId);
    return {
      menuId: m?.id ?? "",
      selections: m ? m.groups.map(() => 0) : [],
      plates: String(s ? s.guestCountConfirmed || s.guests : 100),
      servingBoys: "0",
      transport: "0",
      discount: "0",
      replacements: [],
      extras: {},
      kids: String(s?.kidsCount ?? 0),
      specials: (s?.specialMeals ?? []).map((m) => ({ ...m })),
    };
  };
  const skipMenuReset = useRef(false);
  const loadDraft = (d: SessionDraft) => {
    skipMenuReset.current = true;
    setMenuId(d.menuId);
    setSelections(d.selections);
    setPlates(d.plates);
    setServingBoys(d.servingBoys);
    setTransport(d.transport);
    setDiscount(d.discount);
    setReplacements(d.replacements);
    setExtras(d.extras);
    setKids(d.kids);
    setSpecials(d.specials);
    setPreview(null);
  };
  // R10-11: a one-meal booking brings its kids / special meals once.
  // QA fix 5: … and its menu package and guest count (not the lunch-1 / 100 defaults).
  const prefilledFor = useRef("");
  useEffect(() => {
    if (!booking || booking.sessions.length > 0 || prefilledFor.current === booking.id || menus === null) return;
    prefilledFor.current = booking.id;
    const pkg = !params.get("menu") && booking.packageId ? activeMenus.find((m) => m.id === booking.packageId) : undefined;
    if (pkg) setMenuId(pkg.id);
    const guests = booking.guestCountConfirmed || booking.guestCount;
    if (guests > 0) setPlates(String(guests));
    setKids(String(booking.kidsCount || 0));
    setSpecials(booking.specialMeals.map((m) => ({ ...m })));
  }, [booking, menus]); // eslint-disable-line react-hooks/exhaustive-deps
  // First session (or the one in the URL) once the booking and menus are loaded.
  useEffect(() => {
    if (!usesSessions || menus === null) return;
    const sid = liveSessions.some((s) => s.id === activeSession) ? activeSession : liveSessions[0].id;
    if (drafts[sid]) return;
    setActiveSession(sid);
    const d = defaultDraft(sid);
    setDrafts((all) => ({ ...all, [sid]: d }));
    loadDraft(d);
  }, [usesSessions, menus === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchSession = (sid: string) => {
    if (sid === activeSession) return;
    const next = drafts[sid] ?? defaultDraft(sid);
    setDrafts((all) => ({ ...all, [activeSession]: snapshot(), [sid]: next }));
    setActiveSession(sid);
    loadDraft(next);
  };

  // New menu → first option in every group, no swaps / extras.
  useEffect(() => {
    if (!menu) return;
    if (skipMenuReset.current) {
      skipMenuReset.current = false;
      return;
    }
    setSelections(menu.groups.map(() => 0));
    setReplacements([]);
    setExtras({});
    setPreview(null);
  }, [menu?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- build the quoteMenu request + client-side input checks (not money maths) ----
  const { request, problems } = useMemo(
    () => buildRequest(menu, { plates, servingBoys, transport, discount, replacements, extras, kids, specials }, L),
    [menu, plates, servingBoys, transport, discount, replacements, extras, kids, specials, L],
  );

  const requestKey = request ? JSON.stringify(request) : "";

  // ---- live preview from the server (debounced) ----
  useEffect(() => {
    const seq = ++requestSeq.current;
    if (!request) {
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      quoteMenu(request)
        .then((q) => {
          if (seq !== requestSeq.current) return;
          setPreview(q);
          setPreviewError(null);
        })
        .catch((e) => {
          if (seq !== requestSeq.current) return;
          setPreview(null);
          setPreviewError(errorText(e, lang));
        })
        .finally(() => seq === requestSeq.current && setPreviewing(false));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [requestKey, refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const nPlates = parseWhole(plates);
  const belowMinimum = preview?.belowMinimum ?? (!!menu && typeof nPlates === "number" && nPlates < menu.minOrder);
  const freeBoysHint = menu?.servingBoy.freeRule === "per50" && typeof nPlates === "number" && nPlates > 0 ? Math.floor(nPlates / 50) : 0;
  const previewStale = previewing || !request;

  function lineLabel(item: string): string {
    if (item === "plates") return L("ప్లేట్లు", "Plates");
    if (item === "servingBoys") return L("Serving boys (అదనం)", "Serving boys (extra)");
    if (item === "transport") return L("రవాణా", "Transport");
    if (item === "kids") return L("పిల్లల ప్లేట్లు", "Kids plates");
    const [kind, key] = item.split(":");
    if (kind === "special" && key in SPECIAL_MEAL_LABEL) return `${L("ప్రత్యేక భోజనం", "Special meal")}: ${T(SPECIAL_MEAL_LABEL[key as SpecialMeal["type"]])}`;
    if (kind === "replacement") {
      const r = menu?.replacements.find((x) => x.key === key);
      return `${L("మార్పు", "Swap")}: ${r ? T(r) : key}`;
    }
    if (kind === "extra") {
      const e = menu?.extras.find((x) => x.key === key);
      return `${L("అదనం", "Extra")}: ${e ? T(e) : key}`;
    }
    return item;
  }

  async function save() {
    setSaveError(null);
    if (!customer) {
      setSaveError(L("ముందు customer ని ఎంచుకోండి.", "Choose a customer first."));
      return;
    }
    if (!menu || !request) {
      setSaveError(problems[0] ?? L("మెనూ ఎంచుకోండి.", "Choose a menu."));
      return;
    }
    const days = parseWhole(validDays);
    if (days === null || Number.isNaN(days) || days < 1 || days > MAX_VALID_DAYS) {
      setSaveError(L("చెల్లుబాటు 1 నుండి 90 రోజులు.", "Validity must be 1 to 90 days."));
      return;
    }
    if (!bookingId && !currentBranchId) {
      setSaveError(L("ముందు పైన శాఖ (branch) ఎంచుకోండి.", "Select a branch first."));
      return;
    }
    let manual: { total: number; reason: string } | undefined;
    if (manualOn && mayOverride) {
      const t = parseMoney(manualTotal);
      if (t === null || Number.isNaN(t)) {
        setSaveError(L("చేతితో పెట్టే మొత్తం సరిగా ఇవ్వండి.", "Enter a valid manual total."));
        return;
      }
      if (manualReason.trim().length < MIN_REASON) {
        setSaveError(L("చేతితో మార్చడానికి కారణం రాయండి (కనీసం 3 అక్షరాలు).", "Write a reason for the manual total (at least 3 characters)."));
        return;
      }
      manual = { total: t, reason: manualReason.trim() };
    }
    // R7-5: one quotation for all meal sessions of the booking (lines labelled by session).
    let sessionsPayload: { sessionId: string; menuPackageId: string; selections: number[]; quote: QuoteRequest }[] | undefined;
    if (usesSessions) {
      const all = { ...drafts, [activeSession]: snapshot() };
      sessionsPayload = [];
      for (const s of liveSessions) {
        const d = all[s.id] ?? defaultDraft(s.id);
        const m = activeMenus.find((x) => x.id === d.menuId) ?? null;
        if (!m) {
          setSaveError(L(`"${sessionName(s, lang)}" కి మెనూ ఎంచుకోండి.`, `Choose a menu for "${sessionName(s, lang)}".`));
          return;
        }
        const built = buildRequest(m, d, L);
        if (!built.request) {
          setSaveError(`${sessionName(s, lang)}: ${built.problems[0] ?? ""}`);
          return;
        }
        sessionsPayload.push({ sessionId: s.id, menuPackageId: m.id, selections: d.selections, quote: built.request });
      }
    }
    setSaving(true);
    try {
      const res = await saveQuotation({
        ...(sessionsPayload ? { sessions: sessionsPayload } : {}),
        customerId: customer.id,
        // Booking-less quotations carry the selected branch (contract audit fix 9).
        ...(bookingId ? { bookingId } : { branchId: currentBranchId ?? undefined }),
        menuPackageId: menu.id,
        selections,
        quote: request,
        validDays: days,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(manual ? { manual } : {}),
      });
      navigate(`/quotations/${res.quotationId}`);
    } catch (e) {
      setSaveError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  function setExtra(key: string, patch: Partial<ExtraState>) {
    setExtras((prev) => ({ ...prev, [key]: { ...(prev[key] ?? NEW_EXTRA), ...patch } }));
  }

  if (menus === null) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <ScreenTitle
        title={L("కొత్త కొటేషన్", "New quotation")}
        subtitle={L("మెనూ, ప్లేట్లు ఎంచుకోండి — ధర server లెక్కించి వెంటనే చూపిస్తుంది.", "Choose the menu and plates — the server prices it live.")}
        onRefresh={async () => {
          await refreshFromServer(allOf("menuPackages"), allOf("customers"));
          setRefreshTick((t) => t + 1);
        }}
      />
      {activeMenus.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {L("మెనూ ప్యాకేజీలు ఇంకా లేవు. 'మెనూ ప్యాకేజీలు' పేజీలో ఎక్కించండి.", "No menu packages yet. Load them on the Menu packages page.")}
        </Alert>
      )}

      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 3fr) minmax(320px, 2fr)" }, alignItems: "start" }}>
        {/* ---------------- left: choices ---------------- */}
        <Box sx={{ display: "grid", gap: 2 }}>
          <Paper sx={{ p: 2.5, display: "grid", gap: 2 }}>
            <Autocomplete
              options={customers}
              value={customer}
              onChange={(_e, v) => setCustomer(v)}
              getOptionLabel={(c) => `${c.name}${c.phone ? " · " + c.phone : ""}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} label={L("కస్టమర్", "Customer")} />}
            />
            <TextField select label={L("మెనూ", "Menu")} value={menu ? menu.id : ""} onChange={(e) => setMenuId(e.target.value)}>
              {activeMenus.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {L(m.nameTe || m.nameEn, m.nameEn || m.nameTe)} — {rupees(m.pricePerPlate)}/{L("ప్లేట్", "plate")}
                </MenuItem>
              ))}
            </TextField>
            {bookingId && (
              <Typography variant="body2" color="text.secondary">
                {L("ఈ కొటేషన్ బుకింగ్‌కి జత అవుతుంది", "This quotation will be linked to the booking")}
                {booking ? ` — ${booking.customerNameSnapshot}` : ` (${bookingId})`}
              </Typography>
            )}
            {usesSessions && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  {L("ఏ భోజనం ధర చూస్తున్నారు", "Which meal you are pricing")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {liveSessions.map((s) => (
                    <Chip
                      key={s.id}
                      clickable
                      color={s.id === activeSession ? "primary" : "default"}
                      variant={s.id === activeSession ? "filled" : "outlined"}
                      label={`${sessionName(s, lang)}${drafts[s.id]?.menuId || s.id === activeSession ? " ✓" : ""}`}
                      onClick={() => switchSession(s.id)}
                    />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {L(
                    "ప్రతి భోజనానికి వేరే మెనూ, ప్లేట్లు. Save చేస్తే అన్నీ కలిపి ఒకే కొటేషన్ (లైన్లు భోజనం పేరుతో).",
                    "Each meal has its own menu and plates. Saving makes one quotation with lines labelled by meal.",
                  )}
                </Typography>
              </Box>
            )}
          </Paper>

          {menu && (
            <>
              <Paper sx={{ p: 2.5 }}>
                <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                  {L("వంటకాలు ఎంచుకోండి", "Choose the dishes")}
                </Typography>
                <Box sx={{ display: "grid", gap: 1.5 }}>
                  {menu.groups.map((group, gi) =>
                    group.length <= 1 ? (
                      <Typography key={gi} sx={{ pl: 0.5 }}>
                        • {T(group[0])}
                      </Typography>
                    ) : (
                      <Box key={gi} role="radiogroup" aria-label={L(`గుంపు ${gi + 1}: ఒకటి ఎంచుకోండి`, `Group ${gi + 1}: choose one`)}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          {L("ఒకటి ఎంచుకోండి", "Choose one")}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          {group.map((opt, oi) => {
                            const on = (selections[gi] ?? 0) === oi;
                            return (
                              <Chip
                                key={oi}
                                role="radio"
                                aria-checked={on}
                                clickable
                                label={T(opt)}
                                color={on ? "primary" : "default"}
                                variant={on ? "filled" : "outlined"}
                                onClick={() => setSelections((s) => s.map((v, i) => (i === gi ? oi : v)))}
                                sx={{ minHeight: 44, fontSize: "1rem" }}
                              />
                            );
                          })}
                        </Box>
                      </Box>
                    ),
                  )}
                </Box>
              </Paper>

              <Paper sx={{ p: 2.5, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <TextField
                  label={L("ప్లేట్లు", "Plates")}
                  value={plates}
                  onChange={(e) => setPlates(e.target.value)}
                  inputMode="numeric"
                  error={belowMinimum}
                  helperText={L(`కనీసం ${menu.minOrder}`, `Minimum ${menu.minOrder}`)}
                />
                <TextField
                  label={L("Serving boys (మొత్తం)", "Serving boys (total)")}
                  value={servingBoys}
                  onChange={(e) => setServingBoys(e.target.value)}
                  inputMode="numeric"
                  helperText={
                    menu.servingBoy.freeRule === "per50"
                      ? L(
                          `50 ప్లేట్లకి 1 ఉచితం (${freeBoysHint} ఉచితం); అదనపు వారికి ${rupees(menu.servingBoy.chargePerPerson)}`,
                          `1 free per 50 plates (${freeBoysHint} free); extra ${rupees(menu.servingBoy.chargePerPerson)} each`,
                        )
                      : L(`ఒక్కొక్కరికి ${rupees(menu.servingBoy.chargePerPerson)}`, `${rupees(menu.servingBoy.chargePerPerson)} each`)
                  }
                />
                <TextField
                  label={L("రవాణా (₹)", "Transport (₹)")}
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  inputMode="decimal"
                  helperText={menu.transportCharged ? L("ఈ మెనూకి రవాణా అదనం", "Transport is extra for this menu") : " "}
                />
                <TextField
                  label={L("తగ్గింపు (₹)", "Discount (₹)")}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  inputMode="decimal"
                  helperText=" "
                />
              </Paper>

              {/* R10-11 kids plates (package kidsPrice) and special meals (inside the plates; owner may add an extra). */}
              <Paper sx={{ p: 2.5, display: "grid", gap: 1 }}>
                <Typography variant="h6" component="h2">
                  {L("పిల్లలు & ప్రత్యేక భోజనాలు", "Kids & special meals")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {menu.kidsPrice === null
                    ? L("ఈ మెనూకి పిల్లల ప్లేట్ ధర లేదు (పిల్లల ప్లేట్లు ఇవ్వము).", "This menu has no kids price (kids plates not offered).")
                    : L(`పిల్లల ప్లేట్ ${rupees2(menu.kidsPrice)} — ప్లేట్లకి అదనంగా.`, `Kids plate ${rupees2(menu.kidsPrice)} — on top of the plates.`)}{" "}
                  {L("ప్రత్యేక భోజనాలు ప్లేట్లలోనే లెక్క (వంటగదికి గుర్తు).", "Special meals are counted inside the plates (a note for the kitchen).")}
                </Typography>
                <KidsSpecialEditor
                  kidsCount={parseWhole(kids) || 0}
                  specialMeals={specials}
                  onChange={(k, m) => {
                    setKids(String(k));
                    setSpecials(m as QuoteSpecial[]);
                  }}
                />
                {role === "admin" && specials.length > 0 && (
                  <Box sx={{ display: "grid", gap: 1, mt: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {L("ప్రత్యేక ప్లేటుకి అదనపు ధర (ఖాళీ = ప్లేట్ ధరలోనే)", "Extra per special plate (empty = included)")}
                    </Typography>
                    {specials.map((s, i) => (
                      <TextField
                        key={i}
                        size="small"
                        label={`${T(SPECIAL_MEAL_LABEL[s.type])} ₹`}
                        value={s.extra ?? ""}
                        onChange={(e) => setSpecials(specials.map((x, j) => (j === i ? { ...x, extra: e.target.value } : x)))}
                        inputMode="decimal"
                        sx={{ maxWidth: 260 }}
                      />
                    ))}
                  </Box>
                )}
              </Paper>

              {(menu.replacements.length > 0 || menu.extras.length > 0) && (
                <Paper sx={{ p: 2.5, display: "grid", gap: 1 }}>
                  {menu.replacements.length > 0 && (
                    <>
                      <Typography variant="h6" component="h2">
                        {L("మార్పులు (ప్లేట్‌కి అదనం)", "Swaps (extra per plate)")}
                      </Typography>
                      {menu.replacements.map((r) => (
                        <FormControlLabel
                          key={r.key}
                          control={
                            <Checkbox
                              checked={replacements.includes(r.key)}
                              onChange={(e) =>
                                setReplacements((prev) =>
                                  e.target.checked ? [...prev, r.key] : prev.filter((k) => k !== r.key),
                                )
                              }
                            />
                          }
                          label={`${T(r)} (+${rupees(r.extraPerPlate)} ${L("ప్లేట్‌కి", "per plate")})`}
                        />
                      ))}
                    </>
                  )}
                  {menu.extras.length > 0 && (
                    <>
                      <Typography variant="h6" component="h2" sx={{ mt: 1 }}>
                        {L("అదనపు వస్తువులు", "Extras")}
                      </Typography>
                      {menu.extras.map((e) => {
                        const st = extras[e.key] ?? NEW_EXTRA;
                        return (
                          <Box key={e.key} sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                            <FormControlLabel
                              sx={{ minWidth: 220 }}
                              control={<Checkbox checked={st.on} onChange={(ev) => setExtra(e.key, { on: ev.target.checked })} />}
                              label={`${T(e)} — ${e.price === null ? L("ధర మీరు చెప్పాలి", "you set the price") : rupees(e.price)}`}
                            />
                            {st.on && (
                              <>
                                <TextField
                                  size="small"
                                  label={L("సంఖ్య", "Qty")}
                                  value={st.qty}
                                  onChange={(ev) => setExtra(e.key, { qty: ev.target.value })}
                                  inputMode="numeric"
                                  sx={{ width: 100 }}
                                />
                                {e.price === null && (
                                  <TextField
                                    size="small"
                                    required
                                    label={L("ఒక్కదాని ధర (₹)", "Price each (₹)")}
                                    value={st.price}
                                    onChange={(ev) => setExtra(e.key, { price: ev.target.value })}
                                    inputMode="decimal"
                                    error={!st.price.trim()}
                                    sx={{ width: 160 }}
                                  />
                                )}
                              </>
                            )}
                          </Box>
                        );
                      })}
                    </>
                  )}
                </Paper>
              )}

              <Paper sx={{ p: 2.5, display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "160px 1fr" } }}>
                <TextField
                  label={L("చెల్లుబాటు (రోజులు)", "Valid for (days)")}
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  inputMode="numeric"
                  error={(() => {
                    const d = parseWhole(validDays);
                    return d === null || Number.isNaN(d) || d < 1 || d > MAX_VALID_DAYS;
                  })()}
                  helperText={L("1–90 రోజులు", "1–90 days")}
                  slotProps={{ htmlInput: { min: 1, max: MAX_VALID_DAYS } }}
                />
                <TextField label={L("గమనికలు", "Notes")} value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={1} />
              </Paper>
            </>
          )}
        </Box>

        {/* ---------------- right: live preview ---------------- */}
        <Box sx={{ position: { lg: "sticky" }, top: { lg: 80 }, display: "grid", gap: 2 }}>
          {menu ? (
            <Paper sx={{ ...kpiCardSx(belowMinimum ? "warning" : "brand"), opacity: previewStale && preview ? 0.7 : 1, transition: "opacity 150ms" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="section" component="h2">
                  {L("కొటేషన్ ముందుచూపు", "Live preview")}
                </Typography>
                {previewing && <CircularProgress size={18} aria-label={L("లెక్కిస్తోంది", "Calculating")} />}
              </Box>

              {problems.length > 0 && (
                <Alert severity="warning" sx={{ my: 1 }}>
                  {problems.map((p) => (
                    <div key={p}>{p}</div>
                  ))}
                </Alert>
              )}
              {belowMinimum && (
                <Alert severity="warning" sx={{ my: 1 }}>
                  {L(
                    `కనీస order ${menu.minOrder} ప్లేట్ల కంటే తక్కువ. ఓనర్‌తో మాట్లాడి ఇవ్వండి.`,
                    `Below the minimum order of ${menu.minOrder} plates. Check with the owner.`,
                  )}
                </Alert>
              )}
              {preview?.priceReviewDue && (
                <Alert severity="info" sx={{ my: 1 }}>
                  {L("ఈ మెనూ ధర 12 నెలల పాతది — ధర సమీక్షించండి.", "This menu's price is 12+ months old — review the price.")}
                </Alert>
              )}
              <ErrorBox message={previewError} />

              {preview && (
                <>
                  <Typography variant="kpi" component="p" sx={{ fontSize: "2.5rem", my: 1 }}>
                    {rupees2(preview.totals.total)}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                    <Chip color="info" label={L(`${preview.platesToCook} ప్లేట్లకి వండాలి`, `Cook for ${preview.platesToCook} plates`)} />
                    {preview.freePlates > 0 && (
                      <Chip color="success" label={L(`${preview.freePlates} ప్లేట్లు ఉచితం`, `${preview.freePlates} free plates`)} />
                    )}
                    {preview.freeServingBoys > 0 && (
                      <Chip color="success" label={L(`${preview.freeServingBoys} serving boys ఉచితం`, `${preview.freeServingBoys} free serving boys`)} />
                    )}
                  </Box>
                  <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", ...tabularNums }}>
                    <tbody>
                      {preview.lines.map((l) => (
                        <Box component="tr" key={l.item} sx={{ borderBottom: `1px solid ${tokens.color.border}` }}>
                          <Box component="td" sx={{ py: 0.75, pr: 1 }}>
                            {lineLabel(l.item)}
                            <Typography variant="caption" component="div" color="text.secondary">
                              {l.qty} × {rupees2(l.rate)}
                            </Typography>
                          </Box>
                          <Box component="td" sx={{ py: 0.75, textAlign: "right", whiteSpace: "nowrap" }}>
                            {rupees2(l.amount)}
                          </Box>
                        </Box>
                      ))}
                    </tbody>
                  </Box>
                  <Box sx={{ mt: 1.5, display: "grid", gap: 0.5 }}>
                    <SumLine label={L("ఉప మొత్తం", "Subtotal")} value={rupees2(preview.subtotal)} />
                    {preview.subtotal - preview.totals.taxable > 0 && (
                      <SumLine label={L("తగ్గింపు", "Discount")} value={`− ${rupees2(preview.subtotal - preview.totals.taxable)}`} />
                    )}
                    {preview.totals.tax > 0 && (
                      <>
                        <SumLine label={L("పన్ను విధించే విలువ", "Taxable value")} value={rupees2(preview.totals.taxable)} />
                        {preview.totals.igst > 0 ? (
                          <SumLine label="IGST" value={rupees2(preview.totals.igst)} />
                        ) : (
                          <>
                            <SumLine label="CGST" value={rupees2(preview.totals.cgst)} />
                            <SumLine label="SGST" value={rupees2(preview.totals.sgst)} />
                          </>
                        )}
                      </>
                    )}
                    <Divider sx={{ my: 0.5 }} />
                    <SumLine label={L("మొత్తం", "Total")} value={rupees2(preview.totals.total)} strong />
                  </Box>
                </>
              )}
            </Paper>
          ) : (
            <Paper sx={{ p: 2.5 }}>
              <Typography color="text.secondary">{L("ముందుచూపు కోసం మెనూ ఎంచుకోండి.", "Choose a menu to see the preview.")}</Typography>
            </Paper>
          )}

          {menu && mayOverride && (
            <Paper sx={{ p: 2, display: "grid", gap: 1.5 }}>
              <FormControlLabel
                control={<Switch checked={manualOn} onChange={(e) => setManualOn(e.target.checked)} />}
                label={L("మొత్తం చేతితో పెడతాను", "I'll enter the total by hand")}
              />
              {manualOn && (
                <>
                  <TextField
                    label={L("చేతితో మొత్తం (₹)", "Manual total (₹)")}
                    value={manualTotal}
                    onChange={(e) => setManualTotal(e.target.value)}
                    inputMode="decimal"
                    helperText={preview ? L(`ఆటోమేటిక్ లెక్క: ${rupees2(preview.totals.total)}`, `Automatic: ${rupees2(preview.totals.total)}`) : " "}
                  />
                  <TextField
                    label={L("కారణం (తప్పనిసరి)", "Reason (required)")}
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    multiline
                  />
                  <Typography variant="body2" color="text.secondary">
                    {L("ఆటోమేటిక్ లెక్క కూడా దాచి ఉంచుతాం; కొటేషన్ మీద 'మాన్యువల్' అని కనిపిస్తుంది.", "The automatic value is kept; the quotation shows it as manual.")}
                  </Typography>
                </>
              )}
            </Paper>
          )}
          <ErrorBox message={saveError} />
          <Button
            variant="contained"
            size="large"
            onClick={save}
            disabled={saving || !menu || !request || !preview || previewing}
          >
            {saving ? L("Save అవుతోంది…", "Saving…") : L("కొటేషన్ save చేయి", "Save quotation")}
          </Button>
          <Typography variant="body2" color="text.secondary">
            {L("Save చేసేటప్పుడు server మళ్ళీ లెక్కించి కొటేషన్ నంబర్ ఇస్తుంది.", "On save the server recalculates and assigns the quotation number.")}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function SumLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography sx={{ fontWeight: strong ? 600 : 400 }}>{label}</Typography>
      <Typography sx={{ ...tabularNums, fontWeight: strong ? 600 : 400 }}>{value}</Typography>
    </Box>
  );
}
