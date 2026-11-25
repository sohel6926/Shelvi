import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Alert, Box, CircularProgress } from "@mui/material";
import { useSession } from "../auth/AuthProvider";
import { LoginPage } from "../auth/LoginPage";
import { PendingApproval } from "../auth/PendingApproval";
import { AppShell } from "../components/AppShell";
import { useLang } from "../i18n/LanguageContext";
import type { Role } from "../auth/roles";
import { roleOpensPath } from "../data/roles";

/**
 * Every page is loaded on demand (code-splitting), so the login screen and dashboard download
 * quickly instead of the whole CRM arriving in one large file.
 */
function page<K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}

const DashboardPage = page(() => import("../modules/dashboard/DashboardPage"), "DashboardPage");
const CustomersListPage = page(() => import("../modules/customers/CustomersListPage"), "CustomersListPage");
const CustomerFormPage = page(() => import("../modules/customers/CustomerFormPage"), "CustomerFormPage");
const BookingsListPage = page(() => import("../modules/bookings/BookingsListPage"), "BookingsListPage");
const BookingDetailPage = page(() => import("../modules/bookings/BookingDetailPage"), "BookingDetailPage");
const BookingFormPage = page(() => import("../modules/bookings/BookingFormPage"), "BookingFormPage");
const MenuListPage = page(() => import("../modules/menu/MenuListPage"), "MenuListPage");
const MenuFormPage = page(() => import("../modules/menu/MenuFormPage"), "MenuFormPage");
const QuotationsPage = page(() => import("../modules/quotations/QuotationsPage"), "QuotationsPage");
const QuotationDetailPage = page(() => import("../modules/quotations/QuotationsPage"), "QuotationDetailPage");
const InvoicesPage = page(() => import("../modules/invoices/InvoicesPage"), "InvoicesPage");
const InvoiceDetailPage = page(() => import("../modules/invoices/InvoicesPage"), "InvoiceDetailPage");
const ExpensesPage = page(() => import("../modules/expenses/ExpensesPage"), "ExpensesPage");
const PurchasesPage = page(() => import("../modules/purchases/PurchasesPage"), "PurchasesPage");
const InventoryPage = page(() => import("../modules/inventory/InventoryPage"), "InventoryPage");
const PackedProductsPage = page(() => import("../modules/packed/PackedProductsPage"), "PackedProductsPage");
const ProcurementPage = page(() => import("../modules/procure/ProcurementPage"), "ProcurementPage");
const StaffPage = page(() => import("../modules/staff/StaffPage"), "StaffPage");
const VendorsPage = page(() => import("../modules/vendors/VendorsPage"), "VendorsPage");
const UsersPage = page(() => import("../modules/users/UsersPage"), "UsersPage");
const ReportsPage = page(() => import("../modules/reports/ReportsPage"), "ReportsPage");
const TargetBoardPage = page(() => import("../modules/targets/TargetBoardPage"), "TargetBoardPage");
const TargetsPage = page(() => import("../modules/targets/TargetsPage"), "TargetsPage");
const PnlPage = page(() => import("../modules/pnl/PnlPage"), "PnlPage");
const BooksPage = page(() => import("../modules/books/BooksPage"), "BooksPage");
const MastersPage = page(() => import("../modules/masters/MastersPage"), "MastersPage");
const FoodSafetyPage = page(() => import("../modules/safety/FoodSafetyPage"), "FoodSafetyPage");
const DispatchPage = page(() => import("../modules/dispatch/DispatchPage"), "DispatchPage");
const MenuPackagesPage = page(() => import("../modules/menus/MenuPackagesPage"), "MenuPackagesPage");
const QuoteBuilderPage = page(() => import("../modules/quotes/QuoteBuilderPage"), "QuoteBuilderPage");
const SettingsPage = page(() => import("../modules/settings/SettingsPage"), "SettingsPage");
const ImportPage = page(() => import("../modules/settings/ImportPage"), "ImportPage");
const LeadsPage = page(() => import("../modules/leads/LeadsPage"), "LeadsPage");
const AdsPage = page(() => import("../modules/ads/AdsPage"), "AdsPage");
const AgentsPage = page(() => import("../modules/agents/AgentsPage"), "AgentsPage");
const GroceryPage = page(() => import("../modules/kitchen/GroceryPage"), "GroceryPage");
const CookingPage = page(() => import("../modules/kitchen/CookingPage"), "CookingPage");
const HistoryPage = page(() => import("../modules/history/HistoryPage"), "HistoryPage");
const GroceryLinksPage = page(() => import("../modules/grocery/GroceryLinksPage"), "GroceryLinksPage");
const GalleryPage = page(() => import("../modules/gallery/GalleryPage"), "GalleryPage");
const PayrollPage = page(() => import("../modules/payroll/PayrollPage"), "PayrollPage");
const PurchaseFormPage = page(() => import("../modules/purchases/PurchaseFormPage"), "PurchaseFormPage");
const ExpenseFormPage = page(() => import("../modules/expenses/ExpenseFormPage"), "ExpenseFormPage");
const OutsideOrdersPage = page(() => import("../modules/outside/OutsideOrdersPage"), "OutsideOrdersPage");
const EquipmentPage = page(() => import("../modules/assets/EquipmentPage"), "EquipmentPage");
const VehiclesPage = page(() => import("../modules/assets/VehiclesPage"), "VehiclesPage");
const ComplaintsPage = page(() => import("../modules/complaints/ComplaintsPage"), "ComplaintsPage");
const DishesPage = page(() => import("../modules/dishes/DishesPage"), "DishesPage");
const DishPage = page(() => import("../modules/dishes/DishPage"), "DishPage");
const DayPlanPage = page(() => import("../modules/kitchen/DayPlanPage"), "DayPlanPage");
const NotificationsPage = page(() => import("../modules/notifications/NotificationsPage"), "NotificationsPage");
const VendorDuesPage = page(() => import("../modules/vendordues/VendorDuesPage"), "VendorDuesPage");
const CancellationsPage = page(() => import("../modules/bookings/CancellationsPage"), "CancellationsPage");
const ContentPlanPage = page(() => import("../modules/marketing/ContentPlanPage"), "ContentPlanPage");
const TasksPage = page(() => import("../modules/staff/TasksPage"), "TasksPage");
const VendorPricesPage = page(() => import("../modules/vendors/VendorPricesPage"), "VendorPricesPage");
const CustomerStatementPage = page(() => import("../modules/customers/CustomerStatementPage"), "CustomerStatementPage");
const CalendarNotesPage = page(() => import("../modules/marketing/CalendarNotesPage"), "CalendarNotesPage");
const PortalPage = page(() => import("../modules/portal/PortalPage"), "PortalPage");
const LunchBoxesPage = page(() => import("../modules/lunchboxes/LunchBoxesPage"), "LunchBoxesPage");

const spinner = (
  <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
    <CircularProgress />
  </Box>
);

const A: Role[] = ["admin"];
const AM: Role[] = ["admin", "manager"];

/**
 * `roles` limits a page to those roles (adminOnly = ["admin"]). Hiding a nav item is only a
 * convenience — Firestore rules and the callables' role checks are the real guard.
 */
function ProtectedRoute({ children, roles, path }: { children: ReactNode; roles?: Role[]; path?: string }) {
  const session = useSession();
  const { L } = useLang();
  if (session.status === "loading") return spinner;
  if (session.status === "loggedOut") {
    return <Navigate to="/login" replace />;
  }
  const isAdmin = session.profile.role === "admin";
  if (!session.profile.active && !isAdmin) {
    return <PendingApproval name={session.profile.name} />;
  }
  const allowed = !roles || roles.includes(session.profile.role) || (!!path && roleOpensPath(path, session.profile.role, session.profile.jobRole));
  return (
    <AppShell>
      {!allowed ? (
        <Alert severity="info" sx={{ m: 3 }}>
          {roles && roles.length === 1
            ? L("ఈ పేజీ యజమాని (admin) మాత్రమే తెరవగలరు.", "Only admins can open this page.")
            : L("ఈ పేజీ తెరవడానికి మీకు అనుమతి లేదు.", "You don't have access to this page.")}
        </Alert>
      ) : (
        <Suspense fallback={spinner}>{children}</Suspense>
      )}
    </AppShell>
  );
}

/**
 * Keep in step with NAV_GROUPS in components/AppShell.tsx.
 * QA fix: staff (cook / helper / driver) never see customer lists, quotations, reports, the staff
 * register or the dashboard (customer names, money) — their start page is the Target Board.
 */
const ROUTES: { path: string; element: ReactNode; roles?: Role[] }[] = [
  { path: "/targets/board", element: <TargetBoardPage /> },
  { path: "/dashboard", element: <DashboardPage />, roles: AM },
  { path: "/leads", element: <LeadsPage />, roles: AM },
  { path: "/customers", element: <CustomersListPage />, roles: AM },
  { path: "/customers/new", element: <CustomerFormPage />, roles: AM },
  { path: "/customers/:id/edit", element: <CustomerFormPage />, roles: AM },
  { path: "/customers/:id/statement", element: <CustomerStatementPage />, roles: AM },
  { path: "/bookings", element: <BookingsListPage /> },
  { path: "/bookings/new", element: <BookingFormPage /> },
  { path: "/bookings/:id", element: <BookingDetailPage /> },
  { path: "/bookings/:id/edit", element: <BookingFormPage /> },
  { path: "/quotes/new", element: <QuoteBuilderPage />, roles: AM },
  { path: "/quotations", element: <QuotationsPage />, roles: AM },
  { path: "/quotations/:id", element: <QuotationDetailPage />, roles: AM },
  { path: "/invoices", element: <InvoicesPage />, roles: AM },
  { path: "/invoices/:id", element: <InvoiceDetailPage />, roles: AM },
  { path: "/expenses", element: <ExpensesPage /> },
  { path: "/expenses/new", element: <ExpenseFormPage /> },
  { path: "/expenses/:id/edit", element: <ExpenseFormPage /> },
  { path: "/purchases", element: <PurchasesPage /> },
  { path: "/purchases/new", element: <PurchaseFormPage /> },
  { path: "/purchases/:id/edit", element: <PurchaseFormPage /> },
  { path: "/outside-orders", element: <OutsideOrdersPage />, roles: AM },
  { path: "/vendor-dues", element: <VendorDuesPage />, roles: A },
  { path: "/equipment", element: <EquipmentPage />, roles: AM },
  { path: "/complaints", element: <ComplaintsPage />, roles: AM },
  { path: "/dishes", element: <DishesPage />, roles: AM },
  { path: "/dishes/new", element: <DishPage />, roles: AM },
  { path: "/dishes/:id", element: <DishPage />, roles: AM },
  { path: "/day-plan", element: <DayPlanPage />, roles: AM },
  { path: "/notifications", element: <NotificationsPage />, roles: AM },
  { path: "/vehicles", element: <VehiclesPage />, roles: AM },
  { path: "/inventory", element: <InventoryPage /> },
  { path: "/packed", element: <PackedProductsPage />, roles: AM },
  { path: "/procurement", element: <ProcurementPage /> },
  { path: "/menu", element: <MenuListPage /> },
  { path: "/menu/new", element: <MenuFormPage />, roles: A },
  { path: "/menu/:id/edit", element: <MenuFormPage />, roles: A },
  { path: "/menus/packages", element: <MenuPackagesPage /> },
  { path: "/gallery", element: <GalleryPage />, roles: AM },
  { path: "/staff", element: <StaffPage />, roles: AM },
  { path: "/tasks", element: <TasksPage /> },
  { path: "/payroll", element: <PayrollPage />, roles: A },
  { path: "/vendors", element: <VendorsPage /> },
  { path: "/vendor-prices", element: <VendorPricesPage />, roles: AM },
  { path: "/lunch-boxes", element: <LunchBoxesPage /> },
  { path: "/reports", element: <ReportsPage />, roles: AM },
  { path: "/cancellations", element: <CancellationsPage />, roles: AM },
  { path: "/targets", element: <TargetsPage />, roles: A },
  { path: "/pnl", element: <PnlPage />, roles: A },
  { path: "/books", element: <BooksPage />, roles: A },
  { path: "/masters", element: <MastersPage />, roles: A },
  { path: "/food-safety", element: <FoodSafetyPage /> },
  { path: "/dispatch", element: <DispatchPage /> },
  { path: "/ads", element: <AdsPage />, roles: A },
  { path: "/content-plan", element: <ContentPlanPage />, roles: AM },
  { path: "/calendar-notes", element: <CalendarNotesPage />, roles: AM },
  { path: "/agents", element: <AgentsPage />, roles: A },
  { path: "/settings", element: <SettingsPage />, roles: A },
  { path: "/settings/import", element: <ImportPage />, roles: A },
  { path: "/users", element: <UsersPage />, roles: A },
  { path: "/history", element: <HistoryPage />, roles: A },
  { path: "/grocery-items", element: <GroceryLinksPage />, roles: A },
  { path: "/grocery-links", element: <Navigate to="/grocery-items" replace /> },
  { path: "/grocery", element: <GroceryPage /> },
  { path: "/cooking", element: <CookingPage /> },
];

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* 20 Nov 2026: customer portal — public, no sign-in; the token in the link is the key */}
        <Route path="/p/:token" element={<Suspense fallback={spinner}><PortalPage /></Suspense>} />
        {/* Round 11: the Target Board is the first screen for everyone (owner request). */}
        <Route path="/" element={<Navigate to="/targets/board" replace />} />
        {ROUTES.map((r) => (
          <Route
            key={r.path}
            path={r.path}
            element={<ProtectedRoute roles={r.roles} path={r.path}>{r.element}</ProtectedRoute>}
          />
        ))}
        <Route path="*" element={<Navigate to="/targets/board" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
