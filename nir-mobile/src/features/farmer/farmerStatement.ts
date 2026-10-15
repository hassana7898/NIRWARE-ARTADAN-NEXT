/**
 * Pure domain logic for Farmer Statement, Breeding Periods (Broods) & Quota calculations.
 * Pure and unit-testable.
 */

export interface ProductQuotaBreakdown {
  productId: string;
  productName: string;
  quotaPerChickGrams: number;
  quotaKg: number;
  deliveredKg: number;
  remainingKg: number;
  overQuotaKg?: number;
  usagePercentage: number;
  phaseStartDay?: number;
  phaseEndDay?: number;
  dailyRecommendedKg?: number;
  phaseStatus?: 'upcoming' | 'active' | 'completed' | 'over_consumed';
  phaseStatusLabel?: string;
}

export interface StatementSummary {
  totalChicks: number;
  liveChicks: number;
  mortalityCount: number;
  survivalRate: number;
  herdAgeDays: number;
  totalBroodDays: number;
  ageProgressPercent: number;
  perChickDeliveredGrams: number;
  dailyPerChickGrams: number;
  finalWeight: number | null;
  fcr: number | null;
  estimatedFcr: number | null;
  totalQuotaKg: number;
  totalDeliveredKg: number;
  totalRemainingKg: number;
  totalQuotaTon: number;
  totalDeliveredTon: number;
  totalRemainingTon: number;
  overallUsagePercentage: number;
  invoicesCount: number;
}

export interface StatementInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dateJalali?: string;
  productId: string;
  productName: string;
  driverName: string;
  weight?: number;
  billWeight: number;
  scaleWeight: number;
  weightDelta: number;
  toleranceStatus: 'matched' | 'discrepancy';
  ticketNumber?: string | null;
  plateNumber?: string | null;
}

export interface BroodPeriodItem {
  id: string;
  name: string;
  startDate: string;
  startDateJalali?: string;
  endDate?: string | null;
  endDateJalali?: string | null;
  chickCount: number;
  flockCount: number;
  liveChicks?: number;
  mortalityCount?: number;
  survivalRate?: number;
  ageDays: number;
  herdAgeDays: number;
  totalBroodDays?: number;
  ageProgressPercent?: number;
  isActive?: boolean;
  isArchived?: boolean;
  finalWeight?: number | null;
  fcr?: number | null;
  estimatedFcr?: number | null;
  perChickDeliveredGrams?: number;
  dailyPerChickGrams?: number;
  feedConsumedKg?: number;
  totalQuotaKg?: number;
  remainingQuotaKg?: number;
  overallUsagePercentage?: number;
  invoicesCount?: number;
}

export interface FarmerStatementData {
  farmer: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  activeBrood: BroodPeriodItem | null;
  summary: StatementSummary;
  breakdown: ProductQuotaBreakdown[];
  invoices: StatementInvoice[];
}

export const quotaUsageColor = (percentage: number): string => {
  if (percentage >= 95) return '#ef4444'; // Red (Quota nearly exhausted or exceeded)
  if (percentage >= 75) return '#f59e0b'; // Amber (Normal progress)
  return '#10b981'; // Green (Plenty of quota remaining)
};

export const normalizeStatement = (raw: any): FarmerStatementData => {
  const farmer = raw?.farmer
    ? {
        id: String(raw.farmer.id || ''),
        name: String(raw.farmer.name || ''),
        phone: raw.farmer.phone ? String(raw.farmer.phone) : null,
      }
    : null;

  const rawBrood = raw?.activeBrood || raw?.activePeriod;
  const activeBrood: BroodPeriodItem | null = rawBrood
    ? {
        id: String(rawBrood.id || ''),
        name: String(rawBrood.name || 'دوره جاری پرورشی'),
        startDate: String(rawBrood.startDate || ''),
        startDateJalali: rawBrood.startDateJalali ? String(rawBrood.startDateJalali) : undefined,
        endDate: rawBrood.endDate ? String(rawBrood.endDate) : null,
        endDateJalali: rawBrood.endDateJalali ? String(rawBrood.endDateJalali) : null,
        chickCount: Number(rawBrood.chickCount || rawBrood.flockCount) || 0,
        flockCount: Number(rawBrood.flockCount || rawBrood.chickCount) || 0,
        liveChicks: Number(rawBrood.liveChicks ?? rawBrood.chickCount) || 0,
        mortalityCount: Number(rawBrood.mortalityCount) || 0,
        survivalRate: Number(rawBrood.survivalRate ?? 100),
        ageDays: Number(rawBrood.ageDays ?? rawBrood.herdAgeDays) || 0,
        herdAgeDays: Number(rawBrood.herdAgeDays ?? rawBrood.ageDays) || 0,
        totalBroodDays: Number(rawBrood.totalBroodDays) || 50,
        ageProgressPercent: Number(rawBrood.ageProgressPercent) || 0,
        isActive: rawBrood.isActive !== undefined ? Boolean(rawBrood.isActive) : !rawBrood.endDate,
        isArchived: Boolean(rawBrood.isArchived || rawBrood.endDate),
        finalWeight: rawBrood.finalWeight ? Number(rawBrood.finalWeight) : null,
        fcr: rawBrood.fcr ? Number(rawBrood.fcr) : null,
        estimatedFcr: rawBrood.estimatedFcr ? Number(rawBrood.estimatedFcr) : null,
        perChickDeliveredGrams: Number(rawBrood.perChickDeliveredGrams) || 0,
        dailyPerChickGrams: Number(rawBrood.dailyPerChickGrams) || 0,
        feedConsumedKg: Number(rawBrood.feedConsumedKg) || 0,
        totalQuotaKg: Number(rawBrood.totalQuotaKg) || 0,
        remainingQuotaKg: Number(rawBrood.remainingQuotaKg) || 0,
        overallUsagePercentage: Number(rawBrood.overallUsagePercentage) || 0,
        invoicesCount: Number(rawBrood.invoicesCount) || 0,
      }
    : null;

  const summaryRaw = raw?.summary || {};
  const totalQuotaKg = Number(summaryRaw.totalQuotaKg) || 0;
  const totalDeliveredKg = Number(summaryRaw.totalDeliveredKg) || 0;
  const totalRemainingKg =
    summaryRaw.totalRemainingKg !== undefined
      ? Number(summaryRaw.totalRemainingKg)
      : Math.max(0, totalQuotaKg - totalDeliveredKg);

  const totalChicks = Number(summaryRaw.totalChicks || activeBrood?.chickCount) || 0;
  const mortalityCount = Number(summaryRaw.mortalityCount ?? activeBrood?.mortalityCount) || 0;
  const liveChicks =
    summaryRaw.liveChicks !== undefined
      ? Number(summaryRaw.liveChicks)
      : Math.max(0, totalChicks - mortalityCount);
  const survivalRate =
    summaryRaw.survivalRate !== undefined
      ? Number(summaryRaw.survivalRate)
      : totalChicks > 0
      ? Number(((liveChicks / totalChicks) * 100).toFixed(1))
      : 100;
  const herdAgeDays = Number(summaryRaw.herdAgeDays ?? activeBrood?.ageDays) || 0;
  const totalBroodDays = Number(summaryRaw.totalBroodDays ?? activeBrood?.totalBroodDays) || 50;
  const ageProgressPercent =
    summaryRaw.ageProgressPercent !== undefined
      ? Number(summaryRaw.ageProgressPercent)
      : Math.min(100, Math.round((herdAgeDays / totalBroodDays) * 100));

  const perChickDeliveredGrams =
    summaryRaw.perChickDeliveredGrams !== undefined
      ? Number(summaryRaw.perChickDeliveredGrams)
      : totalChicks > 0
      ? Math.round((totalDeliveredKg * 1000) / totalChicks)
      : 0;
  const dailyPerChickGrams =
    summaryRaw.dailyPerChickGrams !== undefined
      ? Number(summaryRaw.dailyPerChickGrams)
      : herdAgeDays > 0 && liveChicks > 0
      ? Number(((totalDeliveredKg * 1000) / (liveChicks * herdAgeDays)).toFixed(1))
      : 0;

  const summary: StatementSummary = {
    totalChicks,
    liveChicks,
    mortalityCount,
    survivalRate,
    herdAgeDays,
    totalBroodDays,
    ageProgressPercent,
    perChickDeliveredGrams,
    dailyPerChickGrams,
    finalWeight: summaryRaw.finalWeight ? Number(summaryRaw.finalWeight) : activeBrood?.finalWeight ?? null,
    fcr: summaryRaw.fcr ? Number(summaryRaw.fcr) : activeBrood?.fcr ?? null,
    estimatedFcr: summaryRaw.estimatedFcr ? Number(summaryRaw.estimatedFcr) : activeBrood?.estimatedFcr ?? null,
    totalQuotaKg,
    totalDeliveredKg,
    totalRemainingKg,
    totalQuotaTon: Number(summaryRaw.totalQuotaTon) || Number((totalQuotaKg / 1000).toFixed(2)),
    totalDeliveredTon: Number(summaryRaw.totalDeliveredTon) || Number((totalDeliveredKg / 1000).toFixed(2)),
    totalRemainingTon: Number(summaryRaw.totalRemainingTon) || Number((totalRemainingKg / 1000).toFixed(2)),
    overallUsagePercentage:
      Number(summaryRaw.overallUsagePercentage) ||
      (totalQuotaKg > 0 ? Number(((totalDeliveredKg / totalQuotaKg) * 100).toFixed(1)) : 0),
    invoicesCount: Number(summaryRaw.invoicesCount) || 0,
  };

  const breakdown: ProductQuotaBreakdown[] = Array.isArray(raw?.breakdown)
    ? raw.breakdown.map((b: any) => ({
        productId: String(b?.productId || ''),
        productName: String(b?.productName || 'دان مصرفی'),
        quotaPerChickGrams: Number(b?.quotaPerChickGrams) || 0,
        quotaKg: Number(b?.quotaKg) || 0,
        deliveredKg: Number(b?.deliveredKg) || 0,
        remainingKg: Number(b?.remainingKg) || 0,
        overQuotaKg: Number(b?.overQuotaKg) || 0,
        usagePercentage: Number(b?.usagePercentage) || 0,
        phaseStartDay: b?.phaseStartDay ? Number(b.phaseStartDay) : undefined,
        phaseEndDay: b?.phaseEndDay ? Number(b.phaseEndDay) : undefined,
        dailyRecommendedKg: b?.dailyRecommendedKg ? Number(b.dailyRecommendedKg) : undefined,
        phaseStatus: b?.phaseStatus || undefined,
        phaseStatusLabel: b?.phaseStatusLabel ? String(b.phaseStatusLabel) : undefined,
      }))
    : [];

  const invoices: StatementInvoice[] = Array.isArray(raw?.invoices)
    ? raw.invoices.map((inv: any) => {
        const w = Number(inv?.weight || inv?.scaleWeight || inv?.billWeight) || 0;
        const billWeight = inv?.billWeight ? Number(inv.billWeight) : w;
        const scaleWeight = inv?.scaleWeight ? Number(inv.scaleWeight) : w;
        const weightDelta = inv?.weightDelta !== undefined ? Number(inv.weightDelta) : scaleWeight - billWeight;
        return {
          id: String(inv?.id || ''),
          invoiceNumber: String(inv?.invoiceNumber || '-'),
          date: String(inv?.date || ''),
          dateJalali: inv?.dateJalali ? String(inv.dateJalali) : undefined,
          productId: String(inv?.productId || ''),
          productName: String(inv?.productName || 'دان مصرفی'),
          driverName: String(inv?.driverName || 'ثبت نشده'),
          weight: w,
          billWeight,
          scaleWeight,
          weightDelta,
          toleranceStatus: inv?.toleranceStatus === 'discrepancy' ? 'discrepancy' : 'matched',
          ticketNumber: inv?.ticketNumber || null,
          plateNumber: inv?.plateNumber || null,
        };
      })
    : [];

  return { farmer, activeBrood, summary, breakdown, invoices };
};
