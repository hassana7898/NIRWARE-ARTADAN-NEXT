

const previewInvoices = [
  {
    id: 'inv-1',
    invoiceNumber: '10482',
    date: '2026-09-17',
    dateJalali: '۱۴۰۵/۰۶/۲۶',
    productId: 'p-3',
    productName: 'دان میان‌دان',
    driverName: 'رضا کریمی',
    billWeight: 3240,
    scaleWeight: 3240,
    weightDelta: 0,
    toleranceStatus: 'matched',
    ticketNumber: 'TK-8841',
    plateNumber: '۴۵ ب ۱۲۳ ایران ۱۰',
  },
  {
    id: 'inv-2',
    invoiceNumber: '10479',
    date: '2026-09-15',
    dateJalali: '۱۴۰۵/۰۶/۲۴',
    productId: 'p-3',
    productName: 'دان میان‌دان',
    driverName: 'حسن مرادی',
    billWeight: 2880,
    scaleWeight: 2880,
    weightDelta: 0,
    toleranceStatus: 'matched',
    ticketNumber: 'TK-8830',
    plateNumber: '۲۱ الف ۹۸۷ ایران ۴۴',
  },
  {
    id: 'inv-3',
    invoiceNumber: '10471',
    date: '2026-09-11',
    dateJalali: '۱۴۰۵/۰۶/۲۰',
    productId: 'p-3',
    productName: 'دان میان‌دان',
    driverName: 'رضا کریمی',
    billWeight: 1200,
    scaleWeight: 1120,
    weightDelta: -80,
    toleranceStatus: 'discrepancy',
    ticketNumber: 'TK-8802',
    plateNumber: '۴۵ ب ۱۲۳ ایران ۱۰',
  },
  {
    id: 'inv-4',
    invoiceNumber: '10468',
    date: '2026-09-07',
    dateJalali: '۱۴۰۵/۰۶/۱۶',
    productId: 'p-2',
    productName: 'دان پیش‌دان',
    driverName: 'مجید نظری',
    billWeight: 3600,
    scaleWeight: 3600,
    weightDelta: 0,
    toleranceStatus: 'matched',
    ticketNumber: 'TK-8777',
    plateNumber: '۷۷ پ ۵۵۵ ایران ۲۱',
  },
];

export const previewBroods = [
  {
    id: 'b-2001',
    name: 'دوره چهارم — سالن ۳',
    isActive: true,
    isArchived: false,
    startDateJalali: '۱۴۰۵/۰۶/۰۲',
    startDate: '2026-08-24',
    chickCount: 12000,
    flockCount: 12000,
    ageDays: 24,
  },
  {
    id: 'b-2000',
    name: 'دوره سوم — سالن ۳',
    isActive: false,
    isArchived: true,
    startDateJalali: '۱۴۰۵/۰۳/۱۴',
    startDate: '2026-06-05',
    chickCount: 11500,
    flockCount: 11500,
    ageDays: 45,
  },
  {
    id: 'b-1999',
    name: 'دوره دوم — سالن ۱',
    isActive: false,
    isArchived: true,
    startDateJalali: '۱۴۰۴/۱۲/۲۲',
    startDate: '2026-03-13',
    chickCount: 11000,
    flockCount: 11000,
    ageDays: 42,
  },
] as any;

/**
 * DEVELOPMENT-ONLY visual preview harness.
 *
 * WHY THIS EXISTS
 * A redesign cannot be judged from code. This module renders the redesigned screens against
 * realistic fixture data so the result can be screenshotted on web without credentials, without a
 * database and without any network request. Requirement 5 of the redesign ("test data only in the
 * development environment") is satisfied structurally rather than by convention:
 *
 *   - the whole module is behind `__DEV__`
 *   - the fake API base is `http://127.0.0.1:9/`, a dead port, so even an accidental fetch fails
 *     locally instead of reaching a real server
 *   - `RootNavigator` mounts it only when `EXPO_PUBLIC_UI_PREVIEW=1`, which is a compile-time
 *     constant — the production bundle contains none of this
 *
 * Nothing here is imported by any production screen, so removing this file changes nothing.
 */

/* Raw fixtures. No type import: these are deliberately the SHAPE THE SERVER SENDS, before
 * `normalizeStatement` runs, because the point of the harness is to exercise that normaliser too. */

/**
 * RAW server payloads (pre-`normalizeStatement`) for `/farmer/dashboard` and `/farmer/statement`.
 *
 * Values are plausible for a 12,000-bird Aradtan broiler cycle on day 24 — deliberately not round
 * extremes, because a preview made of tidy numbers hides exactly the layout problems worth
 * catching (long product names, 4-digit deltas, an over-quota bar, a 3-phase breakdown).
 */
export const previewDashboardRaw = {
  farmer: { id: 'f-1001', name: 'مرغداری دره سرخ', phone: '09123456789' },
  herdsize: 11694,
  totalFeedDelivered: 22080,
  recentInvoices: previewInvoices,
  broods: previewBroods,
  activePeriod: previewBroods[0],
};

export const previewStatementRaw = {
  farmer: { id: 'f-1001', name: 'مرغداری دره سرخ', phone: '09123456789' },
  activeBrood: {
    id: 'b-2001',
    name: 'دوره چهارم — سالن ۳',
    isActive: true,
    isArchived: false,
    startDate: '2026-08-24',
    startDateJalali: '۱۴۰۵/۰۶/۰۲',
    endDate: null,
    chickCount: 12000,
    flockCount: 12000,
    liveChicks: 11694,
    mortalityCount: 306,
    survivalRate: 97.45,
    ageDays: 24,
    herdAgeDays: 24,
    totalBroodDays: 45,
    ageProgressPercent: 53,
    perChickDeliveredGrams: 1840,
    dailyPerChickGrams: 96,
    feedConsumedKg: 22080,
    totalQuotaKg: 26400,
    remainingQuotaKg: 4320,
    overallUsagePercentage: 83.6,
    finalWeight: 0,
    fcr: null,
    estimatedFcr: 1.62,
    invoicesCount: 4,
  },
  summary: {
    totalChicks: 12000,
    liveChicks: 11694,
    mortalityCount: 306,
    survivalRate: 97.45,
    herdAgeDays: 24,
    totalBroodDays: 45,
    ageProgressPercent: 53,
    perChickDeliveredGrams: 1840,
    dailyPerChickGrams: 96,
    finalWeight: null,
    fcr: null,
    estimatedFcr: 1.62,
    totalQuotaKg: 26400,
    totalDeliveredKg: 22080,
    totalRemainingKg: 4320,
    overallUsagePercentage: 83.6,
    invoicesCount: 4,
  },
  breakdown: [
    {
      productId: 'p-1',
      productName: 'دان پری‌استارتر ۱ تا ۱۰ روز',
      quotaPerChickGrams: 200,
      quotaKg: 2400,
      deliveredKg: 2400,
      remainingKg: 0,
      overQuotaKg: 0,
      usagePercentage: 100,
      phaseStartDay: 1,
      phaseEndDay: 10,
      phaseStatus: 'completed',
      phaseStatusLabel: 'پایان‌یافته',
      dailyRecommendedKg: 240,
    },
    {
      productId: 'p-2',
      productName: 'دان پیش‌دان ۱۰ تا ۲۱ روز',
      quotaPerChickGrams: 800,
      quotaKg: 9600,
      deliveredKg: 9120,
      remainingKg: 480,
      overQuotaKg: 0,
      usagePercentage: 95,
      phaseStartDay: 11,
      phaseEndDay: 21,
      phaseStatus: 'completed',
      phaseStatusLabel: 'پایان‌یافته',
      dailyRecommendedKg: 1140,
    },
    {
      productId: 'p-3',
      productName: 'دان میان‌دان ۲۱ تا ۳۲ روز',
      quotaPerChickGrams: 840,
      quotaKg: 10080,
      deliveredKg: 7320,
      remainingKg: 2760,
      overQuotaKg: 0,
      usagePercentage: 72.6,
      phaseStartDay: 22,
      phaseEndDay: 32,
      phaseStatus: 'active',
      phaseStatusLabel: 'در حال مصرف',
      dailyRecommendedKg: 1080,
    },
    {
      productId: 'p-4',
      productName: 'دان پس‌دان ۳۲ تا ۴۵ روز',
      quotaPerChickGrams: 360,
      quotaKg: 4320,
      deliveredKg: 3240,
      remainingKg: 1080,
      overQuotaKg: 0,
      usagePercentage: 75,
      phaseStartDay: 33,
      phaseEndDay: 45,
      phaseStatus: 'upcoming',
      phaseStatusLabel: 'شروع نشده',
      dailyRecommendedKg: 0,
    },
  ],
  invoices: previewInvoices,
};

export const previewDriverLoadsRaw = {
  total: 3,
  page: 1,
  totalPages: 1,
  activeLoads: [
    {
      id: 'load-501',
      invoiceNumber: '10489',
      remittanceNumber: 'RM-9921',
      farmerName: 'مرغداری دره سرخ (سالن ۳)',
      productName: 'دان میان‌دان پلت ویژه آرتادان',
      weight: 12450,
      status: 'in_transit',
      destinationPhone: '09123456789',
      origin: 'کارخانه خوراک دام و طیور آرتادان — سیلو ۴',
      tripStatus: 'in_transit',
      tripStatusAt: '2026-10-14T08:30:00.000Z',
      hasProofOfDelivery: false,
    },
    {
      id: 'load-502',
      invoiceNumber: '10492',
      remittanceNumber: 'RM-9924',
      farmerName: 'مجتمع پرورشی البرز (واحد ۲)',
      productName: 'دان پیش‌دان کرامبل',
      weight: 8600,
      status: 'pending',
      destinationPhone: '09121112244',
      origin: 'کارخانه خوراک دام و طیور آرتادان — خط بارگیری ۲',
      tripStatus: 'loaded',
      tripStatusAt: '2026-10-14T09:15:00.000Z',
      hasProofOfDelivery: false,
    },
  ],
  completedLoads: [
    {
      id: 'load-490',
      invoiceNumber: '10475',
      remittanceNumber: 'RM-9890',
      farmerName: 'مرغداری دشت سبز',
      productName: 'دان پس‌دان پلت',
      weight: 14200,
      status: 'delivered',
      destinationPhone: '09123334455',
      origin: 'کارخانه آرتادان',
      tripStatus: 'delivered',
      tripStatusAt: '2026-10-13T17:40:00.000Z',
      hasProofOfDelivery: true,
    },
  ],
};

export const previewManagerKpiRaw = {
  todayJalali: '۱۴۰۵/۰۷/۲۲',
  entryTonnageKg: 84500,
  exitTonnageKg: 62300,
  entryTonnageTon: 84.5,
  exitTonnageTon: 62.3,
  todayInvoicesCount: 27,
  weighbridgeTicketsToday: 34,
  inventory: [
    { id: 'inv-corn', name: 'ذرت دامی برزیل (سیلو ۱)', currentStock: 142000, minStock: 50000 },
    { id: 'inv-soy', name: 'کنجاله سویا آرژانتین', currentStock: 68500, minStock: 35000 },
    { id: 'inv-grower', name: 'دان میان‌دان پلت آماده', currentStock: 44000, minStock: 20000 },
    { id: 'inv-starter', name: 'دان پیش‌دان کرامبل', currentStock: 29400, minStock: 15000 },
    { id: 'inv-premix', name: 'مکمل ویتامینه و معدنی ۲.۵٪', currentStock: 4200, minStock: 8000 },
    { id: 'inv-meth', name: 'اسید آمینه متیونین', currentStock: 0, minStock: 2500 },
  ],
};