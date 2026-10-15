import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Icon } from '../../components/common/Icon';
import { AccentSurface, Surface, Divider } from '../../components/ui/Surface';
import { SegmentedControl, ActionButton } from '../../components/ui/controls';
import { Chip } from '../../components/ui/SectionHeader';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { extractApiErrorMessage } from '../../api/errors';
import { formatJalaliDate, formatWeight, toPersianDigits } from '../../utils/formatters';
import {
  TRIP_STATUS_FLOW,
  TRIP_STATUS_HINTS,
  TRIP_STATUS_LABELS,
  isTripStatus,
  lockedTripStatuses,
  reportableTripStatuses,
  stepIndex,
  tripStatusVariant,
  type TripStatus,
} from '../../features/driver/tripStatusFlow';
import {
  palette,
  brand,
  radius,
  spacing,
  fontSize,
  typography,
} from '../../theme/tokens';

const PAGE_SIZE = 20;

type ScopeTab = 'active' | 'completed';

interface DriverLoadItem {
  id: string;
  invoiceNumber?: string;
  remittanceNumber?: string;
  farmerName?: string;
  productName?: string;
  weight?: number | string;
  status: string;
  destinationPhone?: string;
  origin?: string;
  createdAt?: string;
  tripStatus?: string | null;
  tripStatusAt?: string | null;
  hasProofOfDelivery?: boolean;
}

function TripStatusBlock({
  load,
  busy,
  onReport,
  onOpenPod,
}: {
  load: DriverLoadItem;
  busy: boolean;
  onReport: (status: TripStatus) => void;
  onOpenPod: () => void;
}) {
  const current: TripStatus = isTripStatus(load.tripStatus) ? load.tripStatus : 'assigned';
  const hasProof = !!load.hasProofOfDelivery;
  const options = reportableTripStatuses(current, hasProof);
  const locked = lockedTripStatuses(current, hasProof);
  const currentIndex = stepIndex(current);

  return (
    <Surface tone="sunken" padded="sm" style={styles.tripBox}>
      <View style={styles.tripHeader}>
        <View style={styles.tripTitleGroup}>
          <Icon name="route" size={16} color={palette.primary} decorative />
          <Text style={styles.tripTitle}>پیشرفت مرحله‌ای سفر</Text>
        </View>
        <StatusBadge status={tripStatusVariant(current)} label={TRIP_STATUS_LABELS[current]} size="sm" />
      </View>

      <Text style={styles.tripHint}>{TRIP_STATUS_HINTS[current]}</Text>

      {/* Stepper Pipeline */}
      <View style={styles.timeline}>
        {TRIP_STATUS_FLOW.map((step, idx) => {
          const done = currentIndex >= idx;
          const isCurrent = currentIndex === idx;
          return (
            <View
              key={step}
              style={[
                styles.stepPill,
                done && styles.stepPillDone,
                isCurrent && styles.stepPillCurrent,
              ]}
            >
              <View
                style={[
                  styles.dot,
                  done ? styles.dotDone : styles.dotPending,
                ]}
              />
              <Text
                style={[
                  styles.dotLabel,
                  done && styles.dotLabelDone,
                  isCurrent && styles.dotLabelCurrent,
                ]}
              >
                {TRIP_STATUS_LABELS[step]}
              </Text>
            </View>
          );
        })}
      </View>

      {load.tripStatusAt ? (
        <View style={styles.tripAtRow}>
          <Icon name="clock" size={12} color={palette.inkMuted} decorative />
          <Text style={styles.tripAt}>
            آخرین ثبت وضعیت: {toPersianDigits(formatJalaliDate(load.tripStatusAt))}
          </Text>
        </View>
      ) : null}

      {options.length > 0 ? (
        <View style={styles.reportRow}>
          {options.map((status) => {
            const isCancel = status === 'cancelled';
            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.reportBtn,
                  isCancel ? styles.reportBtnDanger : styles.reportBtnPrimary,
                  busy && styles.reportBtnBusy,
                ]}
                disabled={busy}
                onPress={() => onReport(status)}
                accessibilityRole="button"
                accessibilityLabel={isCancel ? 'لغو سفر' : `ثبت وضعیت ${TRIP_STATUS_LABELS[status]}`}
              >
                <Icon
                  name={isCancel ? 'close' : 'checkCircle'}
                  size={14}
                  color={isCancel ? palette.critical : palette.inkInverse}
                  decorative
                />
                <Text style={[styles.reportBtnText, isCancel && styles.reportBtnTextDanger]}>
                  {isCancel ? 'لغو سفر' : `ثبت مرحله: ${TRIP_STATUS_LABELS[status]}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.tripClosedRow}>
          <Icon
            name={current === 'delivered' ? 'checkCircle' : 'alertCircle'}
            size={14}
            color={current === 'delivered' ? palette.success : palette.inkMuted}
            decorative
          />
          <Text style={styles.tripClosed}>
            {current === 'delivered'
              ? 'این سفر با ثبت رسید تحویل خاتمه یافته است.'
              : 'این سفر لغو شده است.'}
          </Text>
        </View>
      )}

      {locked.length > 0 ? (
        <TouchableOpacity
          style={styles.lockedReport}
          disabled={busy}
          onPress={onOpenPod}
          accessibilityRole="button"
        >
          <Icon name="signature" size={15} color={palette.warning} decorative />
          <Text style={styles.lockedReportText}>
            برای بستن نهایی سفر ابتدا «رسید تحویل و امضا» را ثبت کنید
          </Text>
        </TouchableOpacity>
      ) : null}
    </Surface>
  );
}

function LoadCard({
  load,
  busy,
  onReport,
  onOpenDetail,
  onOpenPod,
}: {
  load: DriverLoadItem;
  busy: boolean;
  onReport: (load: DriverLoadItem, status: TripStatus) => void;
  onOpenDetail: () => void;
  onOpenPod: () => void;
}) {
  const invoiceNum = load.invoiceNumber || load.remittanceNumber || load.id;
  const current: TripStatus = isTripStatus(load.tripStatus) ? load.tripStatus : 'assigned';
  const accent =
    current === 'delivered'
      ? palette.success
      : current === 'cancelled'
      ? palette.critical
      : palette.primary;

  return (
    <AccentSurface accent={accent} padded="md" style={styles.card}>
      {/* Top Manifest Header */}
      <View style={styles.cardHeader}>
        <View style={styles.invoiceBadgeRow}>
          <View style={styles.truckIconBadge}>
            <Icon name="truck" size={18} color={palette.primary} decorative />
          </View>
          <View style={styles.invoiceTextCol}>
            <Text style={styles.invoiceCaption}>شماره بارنامه / حواله</Text>
            <Text style={styles.invoiceValue}>#{toPersianDigits(invoiceNum)}</Text>
          </View>
        </View>

        <View style={styles.headerBadgesCol}>
          <StatusBadge status={load.status} size="sm" />
          {load.hasProofOfDelivery ? (
            <Chip label="دارای رسید تحویل" tone="success" icon="checkCircle" />
          ) : null}
        </View>
      </View>

      <Divider style={styles.cardDivider} />

      {/* Cargo & Destination Summary Grid */}
      <View style={styles.cargoGrid}>
        <View style={styles.cargoMainCol}>
          <View style={styles.cargoFactRow}>
            <Icon name="mapPin" size={15} color={palette.primary} decorative />
            <Text style={styles.infoLabel}>مقصد (مرغدار):</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {load.farmerName || 'نامشخص'}
            </Text>
          </View>

          <View style={styles.cargoFactRow}>
            <Icon name="wheat" size={15} color={palette.inkSecondary} decorative />
            <Text style={styles.infoLabel}>محموله خوراک:</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {load.productName || 'نامشخص'}
            </Text>
          </View>

          {load.origin ? (
            <View style={styles.cargoFactRow}>
              <Icon name="warehouse" size={15} color={palette.inkMuted} decorative />
              <Text style={styles.infoLabel}>مبدأ بارگیری:</Text>
              <Text style={styles.infoValue} numberOfLines={1}>
                {load.origin}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.weightBox}>
          <Text style={styles.weightBoxLabel}>وزن خالص بار</Text>
          <Text style={styles.weightBoxValue}>{formatWeight(load.weight || 0)}</Text>
        </View>
      </View>

      <TripStatusBlock
        load={load}
        busy={busy}
        onReport={(status) => onReport(load, status)}
        onOpenPod={onOpenPod}
      />

      {/* Footer Action Bar */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.detailBtn}
          onPress={onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel="مشاهده جزئیات و باسکول"
        >
          <Icon name="scaleGlyph" size={15} color={palette.primary} decorative />
          <Text style={styles.detailBtnText}>جزئیات و باسکول</Text>
        </TouchableOpacity>

        {load.destinationPhone ? (
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => Linking.openURL(`tel:${load.destinationPhone}`)}
            accessibilityRole="button"
            accessibilityLabel="تماس با مقصد"
          >
            <Icon name="phone" size={15} color={palette.success} decorative />
            <Text style={styles.callBtnText}>تماس</Text>
          </TouchableOpacity>
        ) : null}

        {!load.hasProofOfDelivery ? (
          <TouchableOpacity
            style={styles.podBtn}
            onPress={onOpenPod}
            accessibilityRole="button"
            accessibilityLabel="ثبت رسید تحویل"
          >
            <Icon name="signature" size={15} color={brand.onBand} decorative />
            <Text style={styles.podBtnText}>ثبت رسید تحویل</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </AccentSurface>
  );
}

export function DriverLoadsScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ScopeTab>('active');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [scope]);

  const loadsQuery = useQuery({
    queryKey: ['driver-loads', scope, page],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.driver.loads, {
        params: { scope, page, limit: PAGE_SIZE },
      });
      return res.data;
    },
    placeholderData: (previous: any) => previous,
  });

  const reportMutation = useMutation({
    mutationFn: async (vars: { invoiceId: string; status: TripStatus }) => {
      const res = await apiClient.patch(Endpoints.driver.tripStatus(vars.invoiceId), {
        status: vars.status,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['driver-loads'] });
      Alert.alert(
        'ثبت شد',
        data?.unchanged
          ? 'این وضعیت قبلاً ثبت شده بود؛ تغییری لازم نبود.'
          : data?.message || 'وضعیت سفر به‌روزرسانی شد.'
      );
    },
    onError: (error: unknown) => {
      Alert.alert('ثبت نشد', extractApiErrorMessage(error, 'ثبت وضعیت سفر ناموفق بود.'));
    },
  });

  const loads = useMemo<DriverLoadItem[]>(() => {
    const body: any = loadsQuery.data || {};
    const active = Array.isArray(body.activeLoads) ? body.activeLoads : [];
    const completed = Array.isArray(body.completedLoads) ? body.completedLoads : [];
    return scope === 'active' ? active : completed;
  }, [loadsQuery.data, scope]);

  const total = Number((loadsQuery.data as any)?.total ?? loads.length);
  const serverPage = Math.max(1, Number((loadsQuery.data as any)?.page || 1));
  const totalPages = Math.max(1, Number((loadsQuery.data as any)?.totalPages || 1));

  const handleReport = (load: DriverLoadItem, status: TripStatus) => {
    if (status === 'cancelled') {
      Alert.alert('لغو سفر', 'این عمل قابل بازگشت نیست. لغو این سفر را تایید می‌کنید؟', [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'لغو سفر',
          style: 'destructive',
          onPress: () => reportMutation.mutate({ invoiceId: load.id, status }),
        },
      ]);
      return;
    }
    reportMutation.mutate({ invoiceId: load.id, status });
  };

  return (
    <ScreenContainer
      scrollable={false}
      title="کارتابل بار و ماموریت‌های حمل"
      subtitle="سفرهای تخصیص‌یافته، ثبت مراحل حرکت و رسید تحویل دیجیتال"
    >
      <FlatList
        data={loads}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <LoadCard
            load={item}
            busy={reportMutation.isPending}
            onReport={handleReport}
            onOpenDetail={() => navigation.navigate('LoadDetail', { load: item })}
            onOpenPod={() => navigation.navigate('DeliveryProof', { load: item })}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loadsQuery.isFetching && !loadsQuery.isLoading}
            onRefresh={() => loadsQuery.refetch()}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SegmentedControl
              value={scope}
              onChange={setScope}
              options={[
                { value: 'active', label: 'بارهای در جریان', icon: 'truck' },
                { value: 'completed', label: 'تحویل‌شده‌ها', icon: 'packageCheck' },
              ]}
            />

            {loadsQuery.isError ? (
              <ScreenState
                isError
                error={loadsQuery.error}
                onRetry={() => void loadsQuery.refetch()}
                messages={{ error: 'دریافت فهرست بارها ناموفق بود.' }}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loadsQuery.isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={palette.primary} />
              <Text style={styles.loadingText}>در حال دریافت کارتابل بارها...</Text>
            </View>
          ) : loadsQuery.isError ? null : (
            <Surface tone="outline" style={styles.emptyContainer}>
              <Icon name="truck" size={26} color={palette.inkMuted} decorative />
              <Text style={styles.emptyText}>
                {scope === 'active'
                  ? 'بار در جریانی برای شما ثبت نشده است.'
                  : 'باری با رسید تحویل ثبت‌شده برای شما وجود ندارد.'}
              </Text>
              <Text style={styles.emptyHint}>
                اگر انتظار باری را دارید که اینجا نیست، آن حواله در سرور به نام یا شمارهٔ همراه شما وصل
                نشده است.
              </Text>
            </Surface>
          )
        }
        ListFooterComponent={
          loads.length > 0 ? (
            <View style={styles.footerWrap}>
              <Text style={styles.summaryLine}>
                نمایش {toPersianDigits(loads.length)} از {toPersianDigits(total)} بارنامه
              </Text>
              <View style={styles.pager}>
                <ActionButton
                  label="صفحه قبل"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  disabled={serverPage <= 1 || loadsQuery.isFetching}
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                />
                <Text style={styles.pagerLabel}>
                  صفحه {toPersianDigits(serverPage)} از {toPersianDigits(totalPages)}
                </Text>
                <ActionButton
                  label="صفحه بعد"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  disabled={serverPage >= totalPages || loadsQuery.isFetching}
                  onPress={() => setPage((current) => current + 1)}
                />
              </View>
            </View>
          ) : null
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  centerContainer: {
    paddingVertical: spacing.xxl * 1.5,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontFamily: typography.bold,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'center',
    lineHeight: 19,
  },

  card: {
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  invoiceBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  truckIconBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: palette.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceTextCol: {
    alignItems: 'flex-end',
  },
  invoiceCaption: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
  },
  invoiceValue: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    color: palette.ink,
  },
  headerBadgesCol: {
    alignItems: 'flex-start',
    gap: 4,
  },
  cardDivider: {
    marginVertical: 2,
  },

  cargoGrid: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  cargoMainCol: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  cargoFactRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  infoLabel: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
  },
  infoValue: {
    flex: 1,
    fontFamily: typography.bold,
    fontSize: fontSize.md,
    color: palette.ink,
    textAlign: 'right',
  },
  weightBox: {
    backgroundColor: palette.primaryMuted,
    borderWidth: 1,
    borderColor: palette.primaryBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 108,
  },
  weightBoxLabel: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: palette.primary,
  },
  weightBoxValue: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: palette.primaryPressed,
    marginTop: 2,
  },

  tripBox: {
    gap: spacing.sm,
  },
  tripHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripTitleGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tripTitle: {
    fontFamily: typography.bold,
    fontSize: fontSize.md,
    color: palette.ink,
  },
  tripHint: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkSecondary,
    textAlign: 'right',
    lineHeight: 18,
  },
  timeline: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stepPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  stepPillDone: {
    backgroundColor: palette.primaryMuted,
    borderColor: palette.primaryBorder,
  },
  stepPillCurrent: {
    backgroundColor: brand.band900,
    borderColor: brand.band900,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotPending: {
    backgroundColor: palette.inkMuted,
  },
  dotDone: {
    backgroundColor: palette.primary,
  },
  dotLabel: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkSecondary,
  },
  dotLabelDone: {
    fontFamily: typography.medium,
    color: palette.primary,
  },
  dotLabelCurrent: {
    fontFamily: typography.bold,
    color: brand.onBand,
  },
  tripAtRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  tripAt: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
  },
  reportRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  reportBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  reportBtnPrimary: {
    backgroundColor: palette.primary,
  },
  reportBtnDanger: {
    backgroundColor: palette.criticalMuted,
    borderWidth: 1,
    borderColor: palette.criticalBorder,
  },
  reportBtnBusy: {
    opacity: 0.6,
  },
  reportBtnText: {
    fontFamily: typography.bold,
    fontSize: fontSize.sm,
    color: palette.inkInverse,
  },
  reportBtnTextDanger: {
    color: palette.critical,
  },
  tripClosedRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  tripClosed: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: palette.inkSecondary,
    textAlign: 'right',
  },
  lockedReport: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.warningMuted,
    borderWidth: 1,
    borderColor: palette.warningBorder,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  lockedReportText: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: palette.warning,
    textAlign: 'right',
  },

  cardActions: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.primaryMuted,
    borderWidth: 1,
    borderColor: palette.primaryBorder,
  },
  detailBtnText: {
    fontFamily: typography.bold,
    fontSize: fontSize.sm,
    color: palette.primary,
  },
  callBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.successMuted,
    borderWidth: 1,
    borderColor: palette.successBorder,
  },
  callBtnText: {
    fontFamily: typography.bold,
    fontSize: fontSize.sm,
    color: palette.success,
  },
  podBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: brand.band900,
  },
  podBtnText: {
    fontFamily: typography.bold,
    fontSize: fontSize.sm,
    color: brand.onBand,
  },

  footerWrap: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  summaryLine: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkSecondary,
    textAlign: 'right',
  },
  pager: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
  },
  pagerLabel: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.ink,
  },
});

export default DriverLoadsScreen;