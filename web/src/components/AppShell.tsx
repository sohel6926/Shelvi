import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { navAllowedForRole, roleOpensPath } from "../data/roles";
import { signOut } from "firebase/auth";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LogoutIcon from "@mui/icons-material/Logout";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import MenuIcon from "@mui/icons-material/Menu";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import BadgeIcon from "@mui/icons-material/Badge";
import StorefrontIcon from "@mui/icons-material/Storefront";
import AssessmentIcon from "@mui/icons-material/Assessment";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import LunchDiningIcon from "@mui/icons-material/LunchDining";
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import ContactPhoneIcon from "@mui/icons-material/ContactPhone";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import FlagIcon from "@mui/icons-material/Flag";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import CampaignIcon from "@mui/icons-material/Campaign";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SettingsIcon from "@mui/icons-material/Settings";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import TranslateIcon from "@mui/icons-material/Translate";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import HistoryIcon from "@mui/icons-material/History";
import LinkIcon from "@mui/icons-material/Link";
import ShoppingBasketIcon from "@mui/icons-material/ShoppingBasket";
import SoupKitchenIcon from "@mui/icons-material/SoupKitchen";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import KitchenIcon from "@mui/icons-material/Kitchen";
import NotificationsIcon from "@mui/icons-material/Notifications";
import RamenDiningIcon from "@mui/icons-material/RamenDining";
import EventNoteIcon from "@mui/icons-material/EventNote";
import Badge from "@mui/material/Badge";
import { subscribeNotifications } from "../data/notificationsRepository";
import FeedbackIcon from "@mui/icons-material/Feedback";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import RequestPageIcon from "@mui/icons-material/RequestPage";
import {
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Chip,
  Menu,
  MenuItem,
  IconButton,
  Button,
  ListSubheader,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { auth } from "../firebase";
import { useSession } from "../auth/AuthProvider";
import { useBranch } from "../session/BranchContext";
import { subscribeActiveBranches, type Branch } from "../data/branchRepository";
import { useLang, LANG_NAME, nextLang } from "../i18n/LanguageContext";
import type { Role } from "../auth/roles";

const DRAWER_WIDTH = 232;

interface NavItem {
  path: string;
  te: string;
  en: string;
  icon: ReactNode;
  /** Who sees the item. Default: everyone. */
  roles?: Role[];
}

const AM: Role[] = ["admin", "manager"];
const A: Role[] = ["admin"];

/** Nav groups (Telugu first). Keep `roles` in step with the routes in routes/AppRouter.tsx. */
const NAV_GROUPS: { te: string; en: string; items: NavItem[] }[] = [
  {
    te: "ఈవెంట్లు",
    en: "Events",
    items: [
      { path: "/targets/board", te: "లక్ష్య బోర్డు", en: "Target board", icon: <EmojiEventsIcon /> },
      { path: "/dashboard", te: "డ్యాష్‌బోర్డ్", en: "Dashboard", icon: <DashboardIcon />, roles: AM },
      { path: "/leads", te: "ఎంక్వైరీలు (Leads)", en: "Leads", icon: <ContactPhoneIcon />, roles: AM },
      { path: "/customers", te: "కస్టమర్లు", en: "Customers", icon: <PeopleIcon />, roles: AM },
      { path: "/complaints", te: "ఫిర్యాదులు", en: "Complaints", icon: <FeedbackIcon />, roles: AM },
      { path: "/bookings", te: "బుకింగ్‌లు", en: "Bookings", icon: <CalendarMonthIcon /> },
      { path: "/menus/packages", te: "మెనూ ప్యాకేజీలు", en: "Menu packages", icon: <MenuBookIcon /> },
      { path: "/menu", te: "మెనూ ఐటమ్స్", en: "Menu items", icon: <RestaurantMenuIcon /> },
      { path: "/gallery", te: "ఆహార ఫోటోలు", en: "Food photos", icon: <PhotoLibraryIcon />, roles: AM },
      { path: "/lunch-boxes", te: "లంచ్ బాక్సులు", en: "Lunch boxes", icon: <LunchDiningIcon /> },
    ],
  },
  {
    te: "డబ్బు",
    en: "Money",
    items: [
      { path: "/quotes/new", te: "కొత్త కొటేషన్", en: "New quote", icon: <NoteAddIcon />, roles: AM },
      { path: "/quotations", te: "కొటేషన్లు", en: "Quotations", icon: <RequestQuoteIcon />, roles: AM },
      { path: "/invoices", te: "ఇన్వాయిస్‌లు", en: "Invoices", icon: <ReceiptLongIcon />, roles: AM },
      { path: "/expenses", te: "ఖర్చులు", en: "Expenses", icon: <PaymentsIcon /> },
      { path: "/purchases", te: "కొనుగోళ్లు", en: "Purchases", icon: <ShoppingCartIcon /> },
      { path: "/outside-orders", te: "బయటి ఆర్డర్లు", en: "Outside orders", icon: <LocalShippingIcon />, roles: AM },
      { path: "/vendor-dues", te: "సరఫరాదారుల బాకీలు", en: "Vendor dues", icon: <RequestPageIcon />, roles: A },
      { path: "/vendor-prices", te: "సరఫరాదారుల ధరలు", en: "Vendor prices", icon: <PriceCheckIcon />, roles: AM },
      { path: "/reports", te: "రిపోర్టులు", en: "Reports", icon: <AssessmentIcon />, roles: AM },
      { path: "/cancellations", te: "రద్దైన ఆర్డర్లు", en: "Cancelled orders", icon: <EventBusyIcon />, roles: AM },
    ],
  },
  {
    te: "లక్ష్యాలు & లాభం",
    en: "Targets & profit",
    items: [
      { path: "/targets", te: "సంవత్సర లక్ష్యం", en: "Year target", icon: <FlagIcon />, roles: A },
      { path: "/pnl", te: "లాభ నష్టాలు", en: "Profit & loss", icon: <TrendingUpIcon />, roles: A },
      { path: "/books", te: "ఖాతా పుస్తకం", en: "Books (ledger)", icon: <AccountBalanceWalletIcon />, roles: A },
      { path: "/ads", te: "ప్రకటనల ఖర్చు", en: "Ads spend", icon: <CampaignIcon />, roles: A },
      { path: "/content-plan", te: "కంటెంట్ ప్లాన్", en: "Content plan", icon: <EditCalendarIcon />, roles: AM },
      { path: "/calendar-notes", te: "పండుగలు & నోట్లు", en: "Festivals & notes", icon: <CalendarMonthIcon />, roles: AM },
    ],
  },
  {
    te: "వంటగది & టీమ్",
    en: "Kitchen & team",
    items: [
      { path: "/tasks", te: "ఈరోజు పనులు", en: "Today's tasks", icon: <TaskAltIcon /> },
      { path: "/day-plan", te: "రోజు వంట plan", en: "Day plan", icon: <EventNoteIcon />, roles: AM },
      { path: "/dishes", te: "వంటకాలు (నేర్చుకునేవి)", en: "Dishes (learning)", icon: <RamenDiningIcon />, roles: AM },
      { path: "/cooking", te: "వంట లెక్క", en: "Cooking plan", icon: <SoupKitchenIcon /> },
      { path: "/grocery", te: "సరుకుల లెక్క", en: "Grocery list", icon: <ShoppingBasketIcon /> },
      { path: "/inventory", te: "సరుకుల నిల్వ", en: "Inventory", icon: <Inventory2Icon /> },
      { path: "/food-safety", te: "ఫుడ్ సేఫ్టీ", en: "Food safety", icon: <Inventory2Icon /> },
      { path: "/dispatch", te: "ప్యాకింగ్ & పంపిణీ", en: "Packing & dispatch", icon: <LocalShippingIcon /> },
      { path: "/packed", te: "ప్యాక్ ఉత్పత్తులు", en: "Packed products", icon: <Inventory2Icon />, roles: AM },
      { path: "/procurement", te: "కొనుగోలు అభ్యర్థనలు & ఆర్డర్లు", en: "Purchase requests & orders", icon: <ShoppingBasketIcon /> },
      { path: "/equipment", te: "పాత్రలు & సామాను", en: "Vessels & equipment", icon: <KitchenIcon />, roles: AM },
      { path: "/vehicles", te: "వాహనాలు", en: "Vehicles", icon: <DirectionsCarIcon />, roles: AM },
      { path: "/grocery-items", te: "సరుకుల జాబితా", en: "Grocery items", icon: <LinkIcon />, roles: A },
      { path: "/staff", te: "సిబ్బంది", en: "Staff", icon: <BadgeIcon />, roles: AM },
      { path: "/payroll", te: "జీతాలు", en: "Payroll", icon: <AccountBalanceWalletIcon />, roles: A },
      { path: "/vendors", te: "సరఫరాదారులు", en: "Vendors", icon: <StorefrontIcon /> },
    ],
  },
  {
    te: "సెటప్",
    en: "Setup",
    items: [
      { path: "/agents", te: "ఆటో సహాయకులు (Agents)", en: "Agents", icon: <SmartToyIcon />, roles: A },
      { path: "/settings", te: "వ్యాపార వివరాలు", en: "Business settings", icon: <SettingsIcon />, roles: A },
      { path: "/masters", te: "కంపెనీ · బ్రాండ్ · శాఖలు", en: "Company · Brands · Branches", icon: <SettingsIcon />, roles: A },
      { path: "/settings/import", te: "Excel దిగుమతి", en: "Excel import", icon: <UploadFileIcon />, roles: A },
      { path: "/users", te: "వినియోగదారులు", en: "Users", icon: <ManageAccountsIcon />, roles: A },
      { path: "/history", te: "మార్పుల చరిత్ర", en: "Change history", icon: <HistoryIcon />, roles: A },
    ],
  },
];

/** The nav item that best matches the URL (longest path), so /targets/board doesn't also light up /targets. */
function activePath(pathname: string): string | null {
  let best: string | null = null;
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      const p = item.path;
      if ((pathname === p || pathname.startsWith(p + "/")) && (!best || p.length > best.length)) best = p;
    }
  }
  return best;
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const { currentBranchId, selectBranch } = useBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const { L, uiLang, toggle } = useLang();

  useEffect(() => subscribeActiveBranches(setBranches), []);
  const [unread, setUnread] = useState(0);
  const sessionRole = session.status === "loggedIn" ? session.profile.role : null;
  const sessionUid = session.status === "loggedIn" ? session.profile.uid : "";
  useEffect(
    () =>
      sessionRole === "admin" || sessionRole === "manager"
        ? subscribeNotifications(sessionRole, (rows) => setUnread(rows.filter((n) => !n.readBy.includes(sessionUid)).length), () => setUnread(0))
        : undefined,
    [sessionRole, sessionUid],
  );

  if (session.status !== "loggedIn") return null;
  const role = session.profile.role;
  const isAdmin = role === "admin";
  const selectedPath = activePath(location.pathname);
  const roleLabel = role === "admin" ? L("యజమాని", "Admin") : role === "manager" ? L("మేనేజర్", "Manager") : L("సిబ్బంది", "Staff");
  const currentBranchName = branches.find((b) => b.id === currentBranchId)?.name;

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1, displayPrint: "none" }} color="primary">
        <Toolbar sx={{ justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            {!isDesktop && (
              <IconButton color="inherit" edge="start" aria-label={L("మెనూ తెరవండి", "Open menu")} onClick={() => setMobileOpen(true)}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="h6" noWrap>
              {L("సుశీల క్యాటరింగ్స్ CRM", "Suseela Caterings CRM")}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {(role === "admin" || role === "manager") && (
              <IconButton color="inherit" aria-label={L("సందేశాలు", "Notifications")} onClick={() => navigate("/notifications")}>
                <Badge badgeContent={unread} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            )}
            <Button
              color="inherit"
              variant="outlined"
              size="small"
              startIcon={<TranslateIcon />}
              onClick={toggle}
              aria-label={`Switch language: ${LANG_NAME[nextLang(uiLang)]}`}
              lang={nextLang(uiLang)}
              sx={{ backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.7)", color: "#FFFFFF", "&:hover": { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "#FFFFFF" } }}
            >
              {LANG_NAME[nextLang(uiLang)]}
            </Button>
            <Chip label={roleLabel} size="small" color="secondary" sx={{ display: { xs: "none", sm: "flex" } }} />
            <Typography variant="body2" sx={{ display: { xs: "none", sm: "block" } }}>
              {session.profile.name || session.profile.email}
            </Typography>
            <ListItemButton
              onClick={() => signOut(auth)}
              sx={{ color: "inherit", width: "auto", borderRadius: 1 }}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 32 }}>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              {L("బయటకు", "Sign out")}
            </ListItemButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isDesktop ? "permanent" : "temporary"}
        open={isDesktop || mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          displayPrint: "none",
          width: { md: DRAWER_WIDTH },
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ p: 1 }}>
          {isAdmin ? (
            <ListItemButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <LocationOnIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={currentBranchName ?? L("అన్ని శాఖలు", "All Branches")} />
              <ArrowDropDownIcon fontSize="small" />
            </ListItemButton>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, py: 1 }}>
              <LocationOnIcon fontSize="small" />
              <Typography variant="body2">{currentBranchName ?? L("శాఖ ఇంకా ఇవ్వలేదు", "No branch assigned")}</Typography>
            </Box>
          )}
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
            <MenuItem
              onClick={() => {
                selectBranch(null);
                setAnchorEl(null);
              }}
            >
              {L("అన్ని శాఖలు", "All Branches")}
            </MenuItem>
            {branches.map((b) => (
              <MenuItem
                key={b.id}
                onClick={() => {
                  selectBranch(b.id);
                  setAnchorEl(null);
                }}
              >
                {b.name}
              </MenuItem>
            ))}
          </Menu>
        </Box>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => (!item.roles || item.roles.includes(role) || roleOpensPath(item.path, role, session.profile.jobRole)) && navAllowedForRole(item.path, role, session.profile.jobRole));
          if (items.length === 0) return null;
          return (
            <List key={group.en} dense subheader={<ListSubheader disableSticky>{L(group.te, group.en)}</ListSubheader>}>
              {items.map((item) => (
                <ListItemButton
                  key={item.path}
                  selected={selectedPath === item.path}
                  onClick={() => {
                    navigate(item.path);
                    setMobileOpen(false);
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={L(item.te, item.en)} />
                </ListItemButton>
              ))}
            </List>
          );
        })}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: "grey.50", minHeight: "100vh", "@media print": { bgcolor: "#fff" } }}>
        <Toolbar sx={{ displayPrint: "none" }} />
        {children}
      </Box>
    </Box>
  );
}
