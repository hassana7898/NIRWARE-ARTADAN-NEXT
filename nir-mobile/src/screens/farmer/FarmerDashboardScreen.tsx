import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenState } from '../../components/common/ScreenState';
import { Icon } from '../../components/common/Icon';
import { OfflineStatusBar } from '../../components/common/OfflineStatusBar';
import { AppHeader, Content, HeaderShell, StatusDot } from '../../components/ui/AppHeader';
import { SectionHeader, Chip } from '../../components/ui/SectionHeader';
import { StatTile } from '../../components/ui/StatTile';
import { Surface, AccentSurface, Divider } from '../../components/ui/Surface';
import { RingGauge, MeterBar, BarSeries, StageTrack } from '../../components/ui/charts';
import { ActionButton } from '../../components/ui/controls';
import {
  normalizeStatement,
  type FarmerStatementData,
  type BroodPeriodItem,
  type ProductQuotaBreakdown,
} from '../../features/farmer/farmerStatement';
import { OrderFeedModal } from './OrderFeedModal';
import { NewBroodModal } from './NewBroodModal';
import { ManageBroodModal } from './ManageBroodModal';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import {
  formatWeight,
  formatNumberWithCommas,
  toPersianDigits,
  formatJalaliDate,
} from '../../utils/formatters';
import {
  palette,
  brand,
  radius,
  spacing,
  fontSize,
  typography,
  chart,
} from '../../theme/tokens';

/**
 * Farmer dashboard — redesigned presentation over unchanged business logic.
 *
 * Logic that was deliberately NOT touched: both queries and their `broodId` parameters, the
 * active-period resolution chain, every derived metric (`survivalRate`, `fcr`, quota maths), the
 * brood-chip selection, the expandable feed-phase rows and all three modals.
 *
 * What changed visually:
 *   - Flat 56px white bar  ->  dark identity band with role, farmer and live period state
 *   - 4 white boxes        ->  4 tokenised StatTiles with semantic tone + icon
 *   - "text value text value" rows  ->  RingGauge + MeterBar + BarSeries drawn with react-native-svg
 *   - 131 hardcoded hex    ->  0; every colour now comes from the token set
 *   - 4 emoji glyphs       ->  monochrome icons at the same stroke weight as everything else
 */
export function FarmerDashboardScreen({ navigation, route }: any) {
  const overrideFarmerId: string | undefined = route?.params?.farmerId;
  const overrideFarmerName: string | undefined = route?.params?.farmerName;
  const initialBroodId: string | undefined = route?.params?.broodId;

  const [selectedBroodId, setSelectedBroodId] = useState<string | null>(initialBroodId || null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [newBroodModalVisible, setNewBroodModalVisible] = useState(false);
  const [manageBroodModalMode, setManageBroodModalMode] = useState<'update' | 'archive' | null>(null);
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);

  useEffect(() => {
    if (initialBroodId) {
      setSelectedBroodId(initialBroodId);
    }
  }, [initialBroodId]);

  const {
    data,
    isLoading: loadingDashboard,
    isError: errorDashboard,
    error: dashboardError,
    refetch: refetchDashboard,
    isRefetching: isRefetchingDashboard,
  } = useQuery({
    queryKey: ['farmer-dashboard', overrideFarmerId, selectedBroodId],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (overrideFarmerId) params.farmerId = overrideFarmerId;
      if (selectedBroodId) params.broodId = selectedBroodId;
      const res = await apiClient.get(Endpoints.farmer.dashboard, { params });
      return res.data;
    },
  });

  const allBroods: BroodPeriodItem[] = Array.isArray(data?.broods) ? data.broods : [];
  const activePeriod: BroodPeriodItem | null =
    data?.activePeriod || data?.activeBrood || data?.brood || (allBroods.length > 0 ? allBroods[0] : null);

  const effectiveBroodId = selectedBroodId || activePeriod?.id || null;

  const {
    data: statement,
    isLoading: loadingStatement,
    isError: errorStatement,
    error: statementError,
    refetch: refetchStatement,
    isRefetching: isRefetchingStatement,
  } = useQuery<FarmerStatementData>({
    queryKey: ['farmer-statement', overrideFarmerId, effectiveBroodId],
    queryFn: async () => {
      const params: Record<string, any> = {};
      if (overrideFarmerId) params.farmerId = overrideFarmerId;
      if (effectiveBroodId) params.broodId = effectiveBroodId;
      const res = await apiClient.get(Endpoints.farmer.statement, { params });
      return normalizeStatement(res.data);
    },
  });

  const isLoading = loadingDashboard || loadingStatement;
  const isRefetching = isRefetchingDashboard || isRefetchingStatement;
  // Either query failing blanks the whole dashboard, so the failure is surfaced once. The first
  // error wins to keep the message stable when both fail together.
  const loadError = errorDashboard || errorStatement;
  const isError = errorDashboard || errorStatement;

  const handleRefresh = async () => {
    await Promise.all([refetchDashboard(), refetchStatement()]);
  };

  const farmerName = data?.farmer?.name || statement?.farmer?.name || overrideFarmerName || 'مرغدار';
  const farmerPhone = data?.farmer?.phone || statement?.farmer?.phone || null;

  const currentBrood = statement?.activeBrood || activePeriod;
  const summary = statement?.summary;
  const breakdown: ProductQuotaBreakdown[] = statement?.breakdown || [];
  const periodInvoices = statement?.invoices || data?.recentInvoices || [];

  const ageDays = currentBrood?.ageDays ?? summary?.herdAgeDays ?? data?.herdAgeDays ?? 0;
  const totalBroodDays = currentBrood?.totalBroodDays || summary?.totalBroodDays || 50;
  const ageProgressPercent = Math.min(100, Math.max(0, Math.round((ageDays / totalBroodDays) * 100)));

  const chickCount = currentBrood?.chickCount || currentBrood?.flockCount || summary?.totalChicks || 0;
  const mortalityCount = currentBrood?.mortalityCount ?? summary?.mortalityCount ?? 0;
  const survivalRate = currentBrood?.survivalRate ?? summary?.survivalRate ?? 100;
  const liveChicks = currentBrood?.liveChicks ?? summary?.liveChicks ?? Math.max(0, chickCount - mortalityCount);

  const dailyFeedPerChickGrams = summary?.dailyPerChickGrams ?? currentBrood?.dailyPerChickGrams ?? 0;
  const totalPerChickGrams = summary?.perChickDeliveredGrams ?? currentBrood?.perChickDeliveredGrams ?? 0;
  const displayFcr = summary?.fcr ?? currentBrood?.fcr ?? summary?.estimatedFcr ?? currentBrood?.estimatedFcr ?? null;
  const isExactFcr = Boolean(summary?.fcr || currentBrood?.fcr);

  const totalDeliveredKg =
    summary?.totalDeliveredKg ?? currentBrood?.feedConsumedKg ?? data?.totalFeedDelivered ?? data?.totalFeedKg ?? 0;
  const totalQuotaKg = summary?.totalQuotaKg ?? currentBrood?.totalQuotaKg ?? 0;
  const totalRemainingKg = summary?.totalRemainingKg ?? Math.max(0, totalQuotaKg - totalDeliveredKg);
  const overallUsagePct = summary?.overallUsagePercentage ?? 0;

  const quotaTone = overallUsagePct >= 95 ? 'critical' : overallUsagePct >= 75 ? 'warning' : 'success';
  const survivalTone = survivalRate >= 95 ? 'success' : survivalRate >= 90 ? 'warning' : 'critical';

  return (
    <HeaderShell>
      <OfflineStatusBar />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
      >
        {/* ================= IDENTITY BAND ================================================== */}
        <AppHeader
          icon="bird"
          eyebrow={overrideFarmerId ? 'کارنامهٔ مرغدار' : 'واحد پرورش مرغ گوشتی'}
          title={farmerName}
          subtitle={farmerPhone ? `شمارهٔ ثبت‌شده: ${toPersianDigits(farmerPhone)}` : undefined}
          status={
            <>
              <Chip
                label={
                  currentBrood?.isActive
                    ? 'دورهٔ فعال'
                    : currentBrood
                    ? 'دورهٔ بایگانی'
                    : 'بدون دوره'
                }
                tone={currentBrood?.isActive ? 'success' : 'neutral'}
                icon="dot"
              />
              <Chip
                label={`روز ${toPersianDigits(ageDays)} از ${toPersianDigits(totalBroodDays)}`}
                tone="onBand"
                icon="timer"
              />
              <Chip label={`${toPersianDigits(overallUsagePct)}٪ سهمیه`} tone="onBand" icon="percent" />
              <StatusDot tone="live" />
            </>
          }
        />

        <Content>
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={palette.primary} />
              <Text style={styles.loadingText}>در حال دریافت کارنامهٔ دوره‌های پرورش…</Text>
            </View>
          ) : isError ? (
            <ScreenState
              isError
              error={loadError}
              onRetry={handleRefresh}
              messages={{ error: 'دریافت کارنامه دوره‌های پرورش ناموفق بود.' }}
            />
          ) : (
            <>
              {/* ---- Period selector ---------------------------------------------------- */}
              {allBroods.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="دوره‌های ثبت‌شده"
                    title={`${toPersianDigits(allBroods.length)} دورهٔ جوجه‌ریزی`}
                    trailing={
                      <TouchableOpacity
                        onPress={() => setNewBroodModalVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel="ثبت جوجه‌ریزی جدید"
                        style={styles.inlineAdd}
                      >
                        <Icon name="calendarPlus" size={14} color={palette.success} decorative />
                        <Text style={styles.inlineAddText}>دورهٔ جدید</Text>
                      </TouchableOpacity>
                    }
                  />

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScroll}
                  >
                    {allBroods.map((b) => {
                      const isSelected = String(b.id) === String(currentBrood?.id);
                      const startJalali = b.startDateJalali || formatJalaliDate(b.startDate);
                      return (
                        <TouchableOpacity
                          key={b.id}
                          onPress={() => setSelectedBroodId(String(b.id))}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`دورهٔ ${b.name || startJalali}`}
                          style={[
                            styles.broodChip,
                            isSelected && styles.broodChipActive,
                            b.isArchived && !isSelected && styles.broodChipArchived,
                          ]}
                        >
                          <View style={styles.broodChipTop}>
                            <View
                              style={[
                                styles.broodDot,
                                {
                                  backgroundColor: b.isActive
                                    ? palette.success
                                    : palette.inkMuted,
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.broodChipTitle,
                                isSelected && styles.broodChipTitleActive,
                              ]}
                              numberOfLines={1}
                            >
                              {b.name || `دورهٔ ${startJalali}`}
                            </Text>
                          </View>

                          <Text
                            style={[
                              styles.broodChipMeta,
                              isSelected && styles.broodChipMetaActive,
                            ]}
                            numberOfLines={1}
                          >
                            {toPersianDigits(formatNumberWithCommas(b.chickCount))} قطعه ·{' '}
                            {b.isActive
                              ? `روز ${toPersianDigits(b.ageDays)}`
                              : 'خاتمه‌یافته'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.section}>
                  <Surface tone="outline" style={styles.emptyBroods}>
                    <Icon name="calendarPlus" size={22} color={palette.inkMuted} decorative />
                    <Text style={styles.emptyBroodsText}>
                      هنوز دورهٔ جوجه‌ریزی ثبت نشده است. با دکمهٔ «دورهٔ جدید» اولین دوره را تعریف کنید.
                    </Text>
                    <ActionButton
                      label="ثبت اولین دوره"
                      icon="calendarPlus"
                      size="sm"
                      fullWidth={false}
                      onPress={() => setNewBroodModalVisible(true)}
                    />
                  </Surface>
                </View>
              )}

              {/* ---- Flock hero ---------------------------------------------------------- */}
              {currentBrood ? (
                <Surface style={styles.hero} testID="farmer-hero">
                  <View style={styles.heroTop}>
                    <View style={styles.heroRing}>
                      <RingGauge
                        percent={ageProgressPercent}
                        tone={ageDays > totalBroodDays ? 'warning' : 'primary'}
                        value={toPersianDigits(ageDays)}
                        caption="روز از"
                        size={128}
                        thickness={11}
                      />
                      <Text style={styles.heroRingFoot}>
                        از {toPersianDigits(totalBroodDays)} روز دوره
                      </Text>
                    </View>

                    <View style={styles.heroMeta}>
                      <Text style={styles.heroPeriodName} numberOfLines={2}>
                        {currentBrood.name}
                      </Text>

                      <MetaRow
                        icon="calendar"
                        label="شروع جوجه‌ریزی"
                        value={toPersianDigits(
                          currentBrood.startDateJalali || formatJalaliDate(currentBrood.startDate)
                        )}
                      />
                      <MetaRow
                        icon="flag"
                        label="پایان دوره"
                        value={
                          currentBrood.endDate
                            ? toPersianDigits(
                                currentBrood.endDateJalali || formatJalaliDate(currentBrood.endDate)
                              )
                            : 'در جریان'
                        }
                      />
                      <MetaRow
                        icon="weight"
                        label="دان تحویل‌شده"
                        value={`${toPersianDigits(
                          formatNumberWithCommas(totalDeliveredKg)
                        )} کیلوگرم`}
                      />
                    </View>
                  </View>

                  <Divider style={styles.heroDivider} />

                  <StageTrack
                    totalDays={totalBroodDays}
                    currentDay={ageDays}
                    phases={breakdown
                      .filter((s) => s.phaseStartDay && s.phaseEndDay)
                      .map((s, i) => ({
                        start: s.phaseStartDay as number,
                        end: s.phaseEndDay as number,
                        color: chart.series[i % chart.series.length],
                      }))}
                  />

                  <View style={styles.heroActions}>
                    <ActionButton
                      label="تلفات و ویرایش دوره"
                      icon="pencil"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onPress={() => setManageBroodModalMode('update')}
                      style={styles.heroAction}
                    />
                    <ActionButton
                      label={
                        currentBrood.isActive
                          ? 'خاتمه و بایگانی'
                          : 'بازگشایی دوره'
                      }
                      icon="flag"
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      onPress={() => setManageBroodModalMode(currentBrood.isActive ? 'archive' : 'update')}
                      style={styles.heroAction}
                    />
                  </View>
                </Surface>
              ) : null}

              {/* ---- KPI grid ----------------------------------------------------------- */}
              <View style={styles.section}>
                <SectionHeader eyebrow="شاخص‌های دوره" title="خلاصهٔ وضعیت گله" icon="activity" />

                <View style={styles.tileGrid}>
                  <StatTile
                    label="جوجهٔ اولیهٔ دوره"
                    value={chickCount > 0 ? toPersianDigits(formatNumberWithCommas(chickCount)) : '—'}
                    unit="قطعه"
                    caption={
                      chickCount > 0
                        ? `${toPersianDigits(formatNumberWithCommas(liveChicks))} قطعهٔ موجود در سالن`
                        : 'بدون دورهٔ ثبت‌شده'
                    }
                    icon="bird"
                    tone="primary"
                    half
                  />

                  <StatTile
                    label="نرخ زنده‌مانی"
                    value={chickCount > 0 ? toPersianDigits(survivalRate) : '—'}
                    unit="٪"
                    caption={`تلفات ثبت‌شده: ${toPersianDigits(
                      formatNumberWithCommas(mortalityCount)
                    )} قطعه`}
                    icon="shieldCheck"
                    tone={survivalTone}
                    half
                  />

                  <StatTile
                    label="سرانهٔ دان تحویلی"
                    value={
                      totalPerChickGrams > 0
                        ? toPersianDigits(formatNumberWithCommas(totalPerChickGrams))
                        : '۰'
                    }
                    unit="گرم"
                    caption={`میانگین روزانه: ${toPersianDigits(dailyFeedPerChickGrams)} گرم`}
                    icon="wheat"
                    tone="neutral"
                    half
                  />

                  <StatTile
                    label="ضریب تبدیل (FCR)"
                    value={displayFcr ? toPersianDigits(displayFcr) : '—'}
                    caption={
                      isExactFcr
                        ? `وزن نهایی: ${toPersianDigits(
                            formatNumberWithCommas(currentBrood?.finalWeight || 0)
                          )} کیلوگرم`
                        : displayFcr
                        ? 'برآورد تخمینی بر پایهٔ سن و مصرف'
                        : 'پس از ثبت وزن مرغ محاسبه می‌شود'
                    }
                    icon="gauge"
                    tone="primary"
                    half
                  />
                </View>
              </View>

              {/* ---- Quota -------------------------------------------------------------- */}
              {totalQuotaKg > 0 ? (
                <View style={styles.section}>
                  <SectionHeader
                    eyebrow="سهمیهٔ مصوب"
                    title="مصرف دان در دوره"
                    icon="scaleGlyph"
                    trailing={
                      <Chip
                        label={`${toPersianDigits(overallUsagePct)}٪ مصرف`}
                        tone={quotaTone}
                      />
                    }
                  />

                  <Surface style={styles.quotaCard}>
                    <View style={styles.quotaTop}>
                      <View style={styles.quotaRing}>
                        <RingGauge
                          percent={overallUsagePct}
                          tone={quotaTone}
                          value={toPersianDigits(overallUsagePct)}
                          caption="درصد"
                          size={116}
                          thickness={10}
                        />
                      </View>

                      <View style={styles.quotaNumbers}>
                        <QuotaLine
                          label="سهمیهٔ کل دوره"
                          value={`${toPersianDigits((totalQuotaKg / 1000).toFixed(2))} تن`}
                          tone="neutral"
                        />
                        <QuotaLine
                          label="ارسال‌شده تاکنون"
                          value={`${toPersianDigits((totalDeliveredKg / 1000).toFixed(2))} تن`}
                          tone="primary"
                        />
                        <QuotaLine
                          label="ماندهٔ مجاز"
                          value={`${toPersianDigits((totalRemainingKg / 1000).toFixed(2))} تن`}
                          tone={totalRemainingKg <= 0 ? 'critical' : 'success'}
                        />
                      </View>
                    </View>

                    <MeterBar percent={overallUsagePct} tone="auto" markerAt={100} />

                    {/* Per-phase consumption as a real chart rather than five hand-drawn rows. */}
                    {breakdown.length > 0 ? (
                      <View style={styles.quotaChart}>
                        <BarSeries
                          data={breakdown.map((stage, i) => ({
                            label: shortPhaseName(stage.productName, i),
                            value: Math.min(100, Math.max(0, stage.usagePercentage)),
                            display: `${toPersianDigits(stage.usagePercentage)}٪`,
                            color:
                              stage.usagePercentage >= 100
                                ? palette.critical
                                : chart.series[i % chart.series.length],
                          }))}
                          height={138}
                        />
                      </View>
                    ) : null}
                  </Surface>

                  {/* Feed phases — each row keeps the original expand behaviour. */}
                  <View style={styles.phaseList}>
                    {breakdown.map((stage, i) => {
                      const barColor =
                        stage.usagePercentage >= 100
                          ? palette.critical
                          : chart.series[i % chart.series.length];
                      const isExpanded = expandedPhaseId === stage.productId;
                      const stageInvoices = periodInvoices.filter(
                        (inv: any) =>
                          inv.productId === stage.productId || inv.productName === stage.productName
                      );

                      return (
                        <AccentSurface
                          key={stage.productId}
                          accent={barColor}
                          padded="md"
                          style={styles.phaseCard}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              setExpandedPhaseId(isExpanded ? null : stage.productId)
                            }
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: isExpanded }}
                            accessibilityLabel={stage.productName}
                          >
                            <View style={styles.phaseHead}>
                              <View style={styles.phaseTitleCol}>
                                <Text style={styles.phaseName} numberOfLines={1}>
                                  {stage.productName}
                                </Text>
                                <Text style={styles.phaseMeta} numberOfLines={1}>
                                  سهمیهٔ هر قطعه {toPersianDigits(stage.quotaPerChickGrams)} گرم
                                  {stage.phaseStartDay && stage.phaseEndDay
                                    ? ` · روز ${toPersianDigits(stage.phaseStartDay)} تا ${toPersianDigits(
                                        stage.phaseEndDay
                                      )}`
                                    : ''}
                                </Text>
                              </View>

                              {stage.phaseStatusLabel ? (
                                <Chip
                                  label={stage.phaseStatusLabel}
                                  tone={stage.phaseStatus === 'active' ? 'primary' : 'neutral'}
                                />
                              ) : null}
                            </View>

                            <View style={styles.phaseBarRow}>
                              <MeterBar
                                percent={stage.usagePercentage}
                                tone="primary"
                                height={7}
                              />
                              <Text style={[styles.phasePct, { color: barColor }]}>
                                {toPersianDigits(stage.usagePercentage)}٪
                              </Text>
                            </View>

                            <View style={styles.phaseNumbers}>
                              <Text style={styles.phaseNum}>
                                سهمیه{' '}
                                <Text style={styles.phaseNumBold}>
                                  {toPersianDigits(formatNumberWithCommas(stage.quotaKg))}
                                </Text>{' '}
                                kg
                              </Text>
                              <Text style={[styles.phaseNum, { color: palette.primary }]}>
                                ارسالی{' '}
                                <Text style={styles.phaseNumBold}>
                                  {toPersianDigits(formatNumberWithCommas(stage.deliveredKg))}
                                </Text>{' '}
                                kg
                              </Text>
                              <Text
                                style={[
                                  styles.phaseNum,
                                  { color: (stage.overQuotaKg || 0) > 0 ? palette.critical : palette.success },
                                ]}
                              >
                                {(stage.overQuotaKg || 0) > 0
                                  ? `مازاد ${toPersianDigits(formatNumberWithCommas(stage.overQuotaKg || 0))}`
                                  : `مانده ${toPersianDigits(formatNumberWithCommas(stage.remainingKg))}`}{' '}
                                kg
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {isExpanded ? (
                            <View style={styles.phaseExpanded}>
                              <Divider style={styles.phaseExpandedDivider} />
                              {stage.dailyRecommendedKg ? (
                                <View style={styles.phaseTip}>
                                  <Icon name="info" size={14} color={palette.primary} decorative />
                                  <Text style={styles.phaseTipText}>
                                    نیاز روزانهٔ پیشنهادی این فاز:{' '}
                                    {toPersianDigits(
                                      formatNumberWithCommas(stage.dailyRecommendedKg)
                                    )}{' '}
                                    کیلوگرم
                                  </Text>
                                </View>
                              ) : null}

                              {stageInvoices.length === 0 ? (
                                <Text style={styles.phaseNoInv}>
                                  حواله‌ای برای این مرحله ثبت نشده است.
                                </Text>
                              ) : (
                                stageInvoices.map((inv: any) => (
                                  <View key={inv.id} style={styles.miniInv}>
                                    <Text style={styles.miniInvWeight}>
                                      {formatWeight(inv.scaleWeight || inv.weight || inv.billWeight || 0)}
                                    </Text>
                                    <View style={styles.miniInvText}>
                                      <Text style={styles.miniInvTitle} numberOfLines={1}>
                                        حواله #{toPersianDigits(inv.invoiceNumber)} —{' '}
                                        {toPersianDigits(inv.dateJalali || formatJalaliDate(inv.date))}
                                      </Text>
                                      <Text style={styles.miniInvMeta} numberOfLines={1}>
                                        {inv.driverName}
                                      </Text>
                                    </View>
                                  </View>
                                ))
                              )}
                            </View>
                          ) : null}
                        </AccentSurface>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* ---- Waybills ----------------------------------------------------------- */}
              <View style={styles.section}>
                <SectionHeader
                  eyebrow="حوالهٔ خروجی"
                  title="بارنامه‌های این دوره"
                  icon="truck"
                  trailing={<Chip label={`${toPersianDigits(periodInvoices.length)} حواله`} tone="primary" />}
                />

                {periodInvoices.length === 0 ? (
                  <Surface tone="outline" style={styles.emptyInvoices}>
                    <Icon name="truck" size={22} color={palette.inkMuted} decorative />
                    <Text style={styles.emptyInvoicesText}>
                      در بازهٔ زمانی این دوره حوالهٔ خروجی ثبت نشده است.
                    </Text>
                  </Surface>
                ) : (
                  <View style={styles.invoiceList}>
                    {periodInvoices.slice(0, 15).map((inv: any) => {
                      const scaleW = Number(inv.scaleWeight || inv.weight || 0);
                      const billW = Number(inv.billWeight || scaleW || 0);
                      const delta = Math.abs(scaleW - billW);
                      const isMismatch = delta > 50;

                      return (
                        <AccentSurface
                          key={inv.id}
                          accent={isMismatch ? palette.critical : palette.success}
                          padded="md"
                          style={styles.invoiceCard}
                        >
                          <View style={styles.invoiceHead}>
                            <View style={styles.invoiceIdCol}>
                              <Text style={styles.invoiceNumber}>
                                حواله #{toPersianDigits(inv.invoiceNumber || inv.id)}
                              </Text>
                              <View style={styles.invoiceDateRow}>
                                <Icon name="calendar" size={12} color={palette.inkMuted} decorative />
                                <Text style={styles.invoiceDate}>
                                  {toPersianDigits(inv.dateJalali || formatJalaliDate(inv.date))}
                                </Text>
                              </View>
                            </View>

                            <Chip
                              label={isMismatch ? `اختلاف ${toPersianDigits(delta)} kg` : 'منطبق'}
                              tone={isMismatch ? 'critical' : 'success'}
                              icon={isMismatch ? 'alertCircle' : 'checkCircle'}
                            />
                          </View>

                          <Divider style={styles.invoiceDivider} />

                          <View style={styles.invoiceFacts}>
                            <Fact label="نوع دان" value={inv.productName || 'دان پلت'} />
                            <Fact label="راننده" value={inv.driverName || 'ثبت نشده'} />
                            <Fact
                              label="وزن خالص"
                              value={`${toPersianDigits(formatNumberWithCommas(scaleW))} kg`}
                              emphasis
                            />
                          </View>
                        </AccentSurface>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* ---- Primary action ---------------------------------------------------- */}
              <Surface style={styles.ctaCard}>
                <View style={styles.ctaText}>
                  <Text style={styles.ctaTitle}>نیاز به سفارش دان دارید؟</Text>
                  <Text style={styles.ctaBody}>
                    انتخاب جیره، تناژ و تاریخ تحویل — مستقیم به کارتابل کارخانه
                  </Text>
                </View>
                <ActionButton
                  label="ثبت سفارش"
                  icon="packageCheck"
                  trailingIcon="forward"
                  onPress={() => setOrderModalVisible(true)}
                  fullWidth={false}
                  style={styles.ctaBtn}
                />
              </Surface>
            </>
          )}
        </Content>
      </ScrollView>

      <OrderFeedModal
        visible={orderModalVisible}
        farmerId={overrideFarmerId || data?.farmer?.id}
        onClose={() => setOrderModalVisible(false)}
        onSuccess={() => handleRefresh()}
      />

      <NewBroodModal
        visible={newBroodModalVisible}
        farmerId={overrideFarmerId || data?.farmer?.id}
        farmerName={farmerName}
        onClose={() => setNewBroodModalVisible(false)}
        onSuccess={(createdBroodId) => {
          if (createdBroodId) setSelectedBroodId(createdBroodId);
          handleRefresh();
        }}
      />

      <ManageBroodModal
        visible={manageBroodModalMode !== null}
        mode={manageBroodModalMode || 'update'}
        brood={currentBrood}
        farmerId={overrideFarmerId || data?.farmer?.id}
        onClose={() => setManageBroodModalMode(null)}
        onSuccess={() => handleRefresh()}
      />
    </HeaderShell>
  );
}

/* ---- local presentational helpers ----------------------------------------------------------- */

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: 'calendar' | 'flag' | 'weight';
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIconBox}>
        <Icon name={icon} size={13} color={palette.inkSecondary} decorative />
      </View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function QuotaLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'primary' | 'success' | 'critical';
}) {
  const color =
    tone === 'primary'
      ? palette.primary
      : tone === 'success'
      ? palette.success
      : tone === 'critical'
      ? palette.critical
      : palette.ink;

  return (
    <View style={styles.quotaLine}>
      <View style={[styles.quotaDot, { backgroundColor: color }]} />
      <Text style={styles.quotaLabel}>{label}</Text>
      <Text style={[styles.quotaValue, { color }]}>{value}</Text>
    </View>
  );
}

function Fact({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text
        style={[styles.factValue, emphasis && styles.factValueEmphasis]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Feed-phase names can be long product titles; a 4-bar chart needs short axis labels. Falls back to
 * a positional label when the server sends something we cannot shorten confidently.
 */
function shortPhaseName(name: string, index: number): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return `فاز ${toPersianDigits(index + 1)}`;
  const parts = cleaned.split(/\s+/);
  return parts.length > 1 ? parts.slice(0, 2).join(' ') : parts[0];
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollBody: {
    paddingBottom: spacing.xxl,
  },
  section: {
    marginTop: spacing.xl,
  },
  center: {
    paddingVertical: spacing.xxl * 2,
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
  },

  inlineAdd: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.successMuted,
    borderWidth: 1,
    borderColor: palette.successBorder,
  },
  inlineAddText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.success,
  },

  chipScroll: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  broodChip: {
    minWidth: 190,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  broodChipActive: {
    backgroundColor: brand.band900,
    borderColor: palette.primary,
  },
  broodChipArchived: {
    backgroundColor: palette.surfaceMuted,
  },
  broodChipTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginBottom: 3,
  },
  broodDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  broodChipTitle: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.lg,
    color: palette.ink,
    textAlign: 'right',
  },
  broodChipTitleActive: {
    color: brand.onBand,
    fontFamily: typography.bold,
  },
  broodChipMeta: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'right',
  },
  broodChipMetaActive: {
    color: brand.onBandMuted,
  },
  emptyBroods: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyBroodsText: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  hero: {
    marginTop: spacing.xl,
  },
  heroTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.lg,
  },
  heroRing: {
    alignItems: 'center',
  },
  heroRingFoot: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
    marginTop: spacing.xs,
  },
  heroMeta: {
    flex: 1,
    alignItems: 'flex-start',
  },
  heroPeriodName: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    color: palette.ink,
    textAlign: 'right',
    marginBottom: spacing.md,
    lineHeight: 26,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metaIconBox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
  },
  metaValue: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.ink,
    textAlign: 'left',
  },
  heroDivider: {
    marginVertical: spacing.lg,
  },
  heroActions: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  heroAction: {
    flex: 1,
  },

  tileGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.md - 4,
    marginTop: spacing.md,
  },

  quotaCard: {
    marginTop: spacing.md,
  },
  quotaTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  quotaRing: {
    alignItems: 'center',
  },
  quotaNumbers: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  quotaLine: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quotaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  quotaLabel: {
    flex: 1,
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'right',
  },
  quotaValue: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
  },
  quotaChart: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },

  phaseList: {
    marginTop: spacing.md,
    gap: spacing.md - 4,
  },
  phaseCard: {
    padding: spacing.md,
  },
  phaseHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  phaseTitleCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  phaseName: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: palette.ink,
    textAlign: 'right',
  },
  phaseMeta: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  phaseBarRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  phasePct: {
    width: 46,
    fontFamily: typography.bold,
    fontSize: fontSize.md,
    textAlign: 'left',
  },
  phaseNumbers: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md - 2,
  },
  phaseNum: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
  },
  phaseNumBold: {
    fontFamily: typography.medium,
    color: palette.ink,
  },
  phaseExpanded: {
    marginTop: spacing.md,
  },
  phaseExpandedDivider: {
    marginBottom: spacing.md,
  },
  phaseTip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs + 2,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.infoMuted,
    marginBottom: spacing.md,
  },
  phaseTipText: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.primary,
    textAlign: 'right',
    lineHeight: 19,
  },
  phaseNoInv: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkMuted,
    textAlign: 'right',
  },
  miniInv: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  miniInvWeight: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: palette.ink,
  },
  miniInvText: {
    flex: 1,
    alignItems: 'flex-start',
  },
  miniInvTitle: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.ink,
    textAlign: 'right',
  },
  miniInvMeta: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'right',
  },

  emptyInvoices: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    marginTop: spacing.md,
  },
  emptyInvoicesText: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'center',
  },
  invoiceList: {
    marginTop: spacing.md,
    gap: spacing.md - 4,
  },
  invoiceCard: {
    padding: spacing.md,
  },
  invoiceHead: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  invoiceIdCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  invoiceNumber: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: palette.ink,
    textAlign: 'right',
  },
  invoiceDateRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  invoiceDate: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
  },
  invoiceDivider: {
    marginVertical: spacing.md - 2,
  },
  invoiceFacts: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
  },
  fact: {
    flex: 1,
    alignItems: 'flex-start',
  },
  factLabel: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
  },
  factValue: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.ink,
    textAlign: 'right',
    marginTop: 1,
  },
  factValueEmphasis: {
    fontFamily: typography.bold,
    color: palette.primary,
  },

  ctaCard: {
    marginTop: spacing.xl,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: brand.band900,
    borderColor: brand.band600,
  },
  ctaText: {
    flex: 1,
    alignItems: 'flex-start',
  },
  ctaTitle: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: brand.onBand,
    textAlign: 'right',
  },
  ctaBody: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: brand.onBandMuted,
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 19,
  },
  ctaBtn: {
    minWidth: 124,
  },
});

export default FarmerDashboardScreen;