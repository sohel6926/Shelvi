/**
 * ============================================================================
 * PREVIEW & MOCK DATA SYSTEM (SAFE & REVOCABLE)
 * ============================================================================
 * 
 * TO REVOKE / DISABLE ALL MOCK DATA:
 * Set `ENABLE_MOCK_FALLBACK = false` below.
 * When false, the application strictly uses live Google Cloud Firebase only.
 * 
 * Also, this mock data ONLY activates when signed in with a test credential session
 * (`localStorage.getItem("shelvi_auth_user") !== null`).
 * If a real Firebase user signs in, it automatically uses the live database!
 */

export const ENABLE_MOCK_FALLBACK = true;

export function isMockEnabled(): boolean {
  if (!ENABLE_MOCK_FALLBACK) return false;
  try {
    return localStorage.getItem("shelvi_auth_user") !== null;
  } catch {
    return false;
  }
}

export const MOCK_TARGET_BOARD = {
  yearTarget: 15000000,
  yearActual: 13800000,
  monthTarget: 1250000,
  monthActual: 980000,
  profitTarget: 312500,
  profitActual: 245000,
  events: { actual: 18, target: 22 },
  bookings: { actual: 24, target: 25 },
  daysLeft: 5,
  dailyNeeded: 54000,
  hitTarget: false,
  percentOnly: false,
  monthCalcMode: "auto",
  monthAutoValue: 1250000,
  incomePct: 78.4,
  profitPct: 78.4,
};

export const MOCK_YEAR_TARGET = {
  yearTarget: 15000000,
  profitMarginPct: 25,
  weights: [8, 7, 6, 9, 12, 10, 5, 8, 9, 11, 8, 7],
  aheadOrBehind: 250000,
  months: [
    { original: 1200000, revised: 1250000, isActual: true },
    { original: 1050000, revised: 1100000, isActual: true },
    { original: 900000, revised: 950000, isActual: true },
    { original: 1350000, revised: 1400000, isActual: true },
    { original: 1800000, revised: 1850000, isActual: true },
    { original: 1500000, revised: 1550000, isActual: true },
    { original: 750000, revised: 780000, isActual: true },
    { original: 1200000, revised: 1250000, isActual: true },
    { original: 1350000, revised: 1400000, isActual: true },
    { original: 1650000, revised: 1700000, isActual: true },
    { original: 1200000, revised: 1250000, isActual: false },
    { original: 1050000, revised: 1100000, isActual: false },
  ],
  manualMonths: Array(12).fill(null),
  autoMonths: Array(12).fill(null),
  calc: {
    calcMode: "auto" as const,
    autoValue: 15000000,
    overriddenBy: null,
    overriddenAt: null,
    overrideReason: "",
  },
};

export const MOCK_PNL = {
  range: { start: "2026-11-01T00:00:00.000Z", end: "2026-11-30T23:59:59.999Z" },
  income: 1250000,
  food: 562500,
  labour: 250000,
  other: 100000,
  ads: 25000,
  profit: 312500,
  marginPct: 25,
  primeCost: { pct: 65, band: "good" as const },
  breakEven: 375000,
  leaks: [
    { te: "అదనపు గ్యాస్ సిలిండర్లు", en: "Extra gas cylinders (unaccounted)", amount: 4500 },
    { te: "మిగిలిపోయిన కూరగాయలు", en: "Vegetable waste from surplus stock", amount: 3200 },
  ],
  series: [
    { label: "Week 1", income: 300000, profit: 75000 },
    { label: "Week 2", income: 350000, profit: 87500 },
    { label: "Week 3", income: 280000, profit: 70000 },
    { label: "Week 4", income: 320000, profit: 80000 },
  ],
  eventRevenue: 1220000,
  cancellationCharges: 30000,
  cancellations: { count: 1, refunded: 20000, kept: 30000 },
  cancelLoss: 0,
};

export const MOCK_PORTAL_VIEW = {
  doc: {
    kind: "quotation" as const,
    number: "QT-2026-0042",
    status: "sent",
    issueDate: "2026-11-20",
    validUntil: "2026-12-05",
    customerName: "Ramesh Kumar (Demo Client)",
    lines: [
      { name: "Traditional South Indian Lunch (Banthi) - 120 Plates", quantity: 120, unitPrice: 280, amount: 33600 },
      { name: "Special Bobbatlu (Pure Ghee Sweet) - 120 Pcs", quantity: 120, unitPrice: 25, amount: 3000 },
      { name: "Serving Boys (3 Staff)", quantity: 3, unitPrice: 1000, amount: 3000 },
      { name: "Transport & Vessel Logistics", quantity: 1, unitPrice: 3400, amount: 3400 },
    ],
    subtotal: 43000,
    discount: 0,
    gstRate: 0,
    tax: 0,
    total: 43000,
    amountPaid: 10000,
    balanceDue: 33000,
    notes: "Includes pure ghee preparation, mineral water dispensers, and plantain leaves service.",
    terms: "Payment terms: 50% advance, balance on completion.",
    acceptedAt: "",
    acceptedBy: "",
  },
  business: {
    name: "Suseela Caterings",
    logoUrl: "",
    phone: "9966649469",
  },
  pay: {
    upiPayload: "upi://pay?pa=9966649469@upi&pn=Suseela%20Caterings&am=43000&cu=INR",
    onlineUrl: "",
  },
  token: "demo",
};

export const MOCK_BOOKINGS = [
  {
    id: "demo-b1",
    customerId: "demo-c1",
    customerNameSnapshot: "Ramesh Kumar",
    eventDate: new Date("2026-11-28T11:30:00Z"),
    eventType: "Wedding",
    eventTypeCode: "wedding",
    serviceStyle: "banthi",
    venue: "Sri Venkateswara Kalyana Mandapam, Hyderabad",
    guestCount: 250,
    guestCountActual: 250,
    status: "Confirmed",
    assignedStaffIds: ["demo-s1"],
    branchId: "main",
    totalAmount: 70000,
    paidAmount: 25000,
    dueAmount: 45000,
    createdAt: new Date("2026-11-01"),
    updatedAt: new Date("2026-11-20"),
    cancelled: false,
  },
  {
    id: "demo-b2",
    customerId: "demo-c2",
    customerNameSnapshot: "Lakshmi Narayana",
    eventDate: new Date("2026-11-29T19:00:00Z"),
    eventType: "Reception",
    eventTypeCode: "wedding",
    serviceStyle: "buffet",
    venue: "Green Park Convention, Secunderabad",
    guestCount: 400,
    guestCountActual: 400,
    status: "InProgress",
    assignedStaffIds: ["demo-s1", "demo-s2"],
    branchId: "main",
    totalAmount: 140000,
    paidAmount: 50000,
    dueAmount: 90000,
    createdAt: new Date("2026-11-05"),
    updatedAt: new Date("2026-11-22"),
    cancelled: false,
  },
  {
    id: "demo-b3",
    customerId: "demo-c3",
    customerNameSnapshot: "Anand Verma",
    eventDate: new Date("2026-11-20T12:00:00Z"),
    eventType: "Housewarming",
    eventTypeCode: "housewarming",
    serviceStyle: "banthi",
    venue: "Flat 402, Aditya Towers, Madhapur",
    guestCount: 120,
    guestCountActual: 130,
    status: "Completed",
    assignedStaffIds: ["demo-s2"],
    branchId: "main",
    totalAmount: 43000,
    paidAmount: 43000,
    dueAmount: 0,
    createdAt: new Date("2026-10-25"),
    updatedAt: new Date("2026-11-21"),
    cancelled: false,
  },
];

export const MOCK_CUSTOMERS = [
  {
    id: "demo-c1",
    name: "Ramesh Kumar",
    phone: "9876543210",
    email: "ramesh@example.com",
    address: "Kukatpally, Hyderabad",
    notes: "Wedding banquet client",
    whatsappOptIn: true,
    branchId: "main",
    createdAt: new Date("2026-11-01"),
  },
  {
    id: "demo-c2",
    name: "Lakshmi Narayana",
    phone: "9876543211",
    email: "lakshmi@example.com",
    address: "Banjara Hills, Hyderabad",
    notes: "Reception catering",
    whatsappOptIn: true,
    branchId: "main",
    createdAt: new Date("2026-11-05"),
  },
  {
    id: "demo-c3",
    name: "Anand Verma",
    phone: "9876543212",
    email: "anand@example.com",
    address: "Madhapur, Hyderabad",
    notes: "Housewarming lunch",
    whatsappOptIn: true,
    branchId: "main",
    createdAt: new Date("2026-10-25"),
  },
];

export const MOCK_STAFF = [
  {
    id: "demo-s1",
    name: "Ramu (Head Cook)",
    phone: "9000000110",
    jobRole: "Cook",
    payType: "monthly",
    monthlySalary: 25000,
    dailyWage: 0,
    active: true,
    branchId: "main",
  },
  {
    id: "demo-s2",
    name: "Sita (Supervisor)",
    phone: "9000000120",
    jobRole: "Supervisor",
    payType: "daily",
    monthlySalary: 0,
    dailyWage: 1200,
    active: true,
    branchId: "main",
  },
  {
    id: "demo-s3",
    name: "Krishna (Driver)",
    phone: "9000000130",
    jobRole: "Driver",
    payType: "monthly",
    monthlySalary: 18000,
    dailyWage: 0,
    active: true,
    branchId: "main",
  },
];

export const MOCK_MENU_PACKAGES = [
  {
    id: "tiffin-1",
    code: "tiffin-1",
    nameTe: "టిఫిన్ మెనూ–1",
    nameEn: "Tiffin Menu–1",
    mealType: "tiffin",
    suggestedPrice: 120,
    minPlates: 50,
    active: true,
  },
  {
    id: "lunch-1",
    code: "lunch-1",
    nameTe: "సాంప్రదాయ వివాహ భోజనం (బంతి)",
    nameEn: "Traditional Wedding Feast (Banthi)",
    mealType: "lunch",
    suggestedPrice: 280,
    minPlates: 100,
    active: true,
  },
  {
    id: "dinner-1",
    code: "dinner-1",
    nameTe: "రైస్ & రోటీ స్పెషల్ డిన్నర్",
    nameEn: "Rice & Roti Special Dinner",
    mealType: "dinner",
    suggestedPrice: 320,
    minPlates: 100,
    active: true,
  },
];

export function getMockCallableResult<T>(name: string, request?: unknown): T | undefined {
  if (!isMockEnabled()) return undefined;

  switch (name) {
    case "getPnl":
      return MOCK_PNL as unknown as T;
    case "getTargetBoard":
      return MOCK_TARGET_BOARD as unknown as T;
    case "setYearTarget": {
      const req = request as { year: number; yearTarget: number; profitMarginPct: number } | undefined;
      if (req) {
        MOCK_YEAR_TARGET.yearTarget = req.yearTarget;
        MOCK_YEAR_TARGET.profitMarginPct = req.profitMarginPct;
      }
      return { ok: true } as unknown as T;
    }
    case "portalView":
      return MOCK_PORTAL_VIEW as unknown as T;
    case "portalAccept":
      return { ok: true } as unknown as T;
    default:
      return undefined;
  }
}

export function getMockCollection<T>(collectionName: string): T[] | undefined {
  if (!isMockEnabled()) return undefined;

  switch (collectionName) {
    case "bookings":
      return MOCK_BOOKINGS as unknown as T[];
    case "customers":
      return MOCK_CUSTOMERS as unknown as T[];
    case "staff":
      return MOCK_STAFF as unknown as T[];
    case "menuPackages":
      return MOCK_MENU_PACKAGES as unknown as T[];
    default:
      return undefined;
  }
}
