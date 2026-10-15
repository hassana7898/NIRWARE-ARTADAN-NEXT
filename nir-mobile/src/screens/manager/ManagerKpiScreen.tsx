import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { Icon } from '../../components/common/Icon';
import { StatTile } from '../../components/ui/StatTile';
import { Surface, AccentSurface, Divider } from '../../components/ui/Surface';
import { SectionHeader, Chip } from '../../components/ui/SectionHeader';
import { RingGauge, BarSeries, MeterBar } from '../../components/ui/charts';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import {
  formatWeight,
  formatNumberWithCommas,
  toPersianDigits,
} from '../../utils/formatters';
import {
  palette,
  spacing,
  fontSize,
  typography,
  chart,
} from '../../theme/tokens';

export function ManagerKpiScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['manager-kpi'],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.manager.kpi);
      return res.data;
    },
  });

  // Live field names from GET /api/mobile/manager/kpi (server/routes/mobile.ts).
  const todayJalali = String(data?.todayJalali || '');
  const entryTonnageKg = Number(data?.entryTonnageKg || 0);
  const exitTonnageKg = Number(data?.exitTonnageKg || 0);
  const entryTonnageTon = Number(data?.entryTonnageTon ?? entryTonnageKg / 1000);
  const exitTonnageTon = Number(data?.exitTonnageTon ?? exitTonnageKg / 1000);
  const invoicesCount = Number(data?.todayInvoicesCount || 0);
  const weighbridgeCount = Number(data?.weighbridgeTicketsToday || 0);
  const inventoryItems: any[] = Array.isArray(data?.inventory) ? data.inventory : [];

  const totalFlowKg = entryTonnageKg + exitTonnageKg;
  const exitSharePct = totalFlowKg > 0 ? Math.round((exitTonnageKg / totalFlowKg) * 100) : 0;

  const criticalCount = inventoryItems.filter((item: any) => {
    const stock = Number(item.currentStock || 0);
    const min = item.minStock === null || item.minStock === undefined ? null : Number(item.minStock);
    return stock <= 0 || (min !== null && stock < min);
  }).length;

  return (
    <ScreenContainer
      title="اتاق کنترل و پایش کارخانه"
      subtitle={
        todayJalali
          ? `امروز ${toPersianDigits(todayJalali)} — شاخص‌های زنده تولید، انبار و باسکول`
          : 'شاخص‌های زنده تولید، انبار و باسکول'
      }
      onRefresh={refetch}
      refreshing={isRefetching}
    >
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت شاخص‌های زنده کارخانه...</Text>
        </View>
      ) : isError ? (
        <ScreenState
          isError
          error={error}
          onRetry={() => void refetch()}
          messages={{ error: 'دریافت شاخص‌های کارخانه ناموفق بود.' }}
        />
      ) : (
        <>
          {/* 1. Tonnage Balance Hero Card */}
          <Surface style={styles.heroCard}>
            <SectionHeader
              eyebrow="تراز جریان مواد و محصول"
              title="گردش تناژ امروز کارخانه"
              icon="scaleGlyph"
              trailing={
                <Chip
                  label={
                    todayJalali
                      ? `تاریخ: ${toPersianDigits(todayJalali)}`
                      : 'به‌روزرسانی زنده'
                  }
                  tone="primary"
                  icon="calendar"
                />
              }
            />

            <View style={styles.heroBody}>
              <View style={styles.heroGaugeCol}>
                <RingGauge
                  percent={exitSharePct}
                  size={122}
                  thickness={11}
                  tone="primary"
                  value={`${toPersianDigits(exitSharePct)}٪`}
                  caption="سهم خروجی"
                />
              </View>

              <View style={styles.heroFlowsCol}>
                <View style={styles.flowRow}>
                  <View style={[styles.flowDot, { backgroundColor: palette.primary }]} />
                  <View style={styles.flowTextCol}>
                    <Text style={styles.flowLabel}>ورود نهاده (ذرت، کنجاله، مکمل)</Text>
                    <Text style={[styles.flowValue, { color: palette.primary }]}>
                      {toPersianDigits(entryTonnageTon.toFixed(2))} تن{' '}
                      <Text style={styles.flowSubKg}>
                        ({toPersianDigits(formatNumberWithCommas(entryTonnageKg))} kg)
                      </Text>
                    </Text>
                  </View>
                </View>

                <Divider />

                <View style={styles.flowRow}>
                  <View style={[styles.flowDot, { backgroundColor: palette.success }]} />
                  <View style={styles.flowTextCol}>
                    <Text style={styles.flowLabel}>خروج دان آماده بارگیری‌شده</Text>
                    <Text style={[styles.flowValue, { color: palette.success }]}>
                      {toPersianDigits(exitTonnageTon.toFixed(2))} تن{' '}
                      <Text style={styles.flowSubKg}>
                        ({toPersianDigits(formatNumberWithCommas(exitTonnageKg))} kg)
                      </Text>
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Surface>

          {/* 2. 4-Tile KPI Grid */}
          <View style={styles.section}>
            <SectionHeader
              eyebrow="آمار عملیاتی روز"
              title="شاخص‌های باسکول و حواله"
              icon="activity"
            />

            <View style={styles.tileGrid}>
              <StatTile
                label="مجموع ورود امروز"
                value={toPersianDigits(formatNumberWithCommas(entryTonnageKg))}
                unit="کیلوگرم"
                caption={`معادل ${toPersianDigits(entryTonnageTon.toFixed(2))} تن نهاده ورودی`}
                icon="truck"
                tone="primary"
                half
              />
              <StatTile
                label="مجموع خروج امروز"
                value={toPersianDigits(formatNumberWithCommas(exitTonnageKg))}
                unit="کیلوگرم"
                caption={`معادل ${toPersianDigits(exitTonnageTon.toFixed(2))} تن دان ارسالی`}
                icon="packageCheck"
                tone="success"
                half
              />
              <StatTile
                label="حواله‌های ثبت‌شده امروز"
                value={toPersianDigits(formatNumberWithCommas(invoicesCount))}
                unit="حواله"
                caption="مجموع اسناد ورودی و خروجی امروز"
                icon="clipboardCheck"
                tone="neutral"
                half
              />
              <StatTile
                label="قبوض باسکول امروز"
                value={toPersianDigits(formatNumberWithCommas(weighbridgeCount))}
                unit="قبض"
                caption="توزین یا همگام‌سازی‌شده در سرور"
                icon="scaleGlyph"
                tone={criticalCount > 0 ? 'warning' : 'primary'}
                half
              />
            </View>
          </View>

          {/* 3. Warehouse & Silo Inventory Visual Section */}
          <View style={styles.section}>
            <SectionHeader
              eyebrow="سیلوها و انبار مواد اولیه"
              title="موجودی زنده انبارهای کارخانه"
              icon="warehouse"
              trailing={
                criticalCount > 0 ? (
                  <Chip
                    label={`${toPersianDigits(criticalCount)} قلم بحرانی`}
                    tone="critical"
                    icon="alertCircle"
                  />
                ) : (
                  <Chip label="موجودی پایدار" tone="success" icon="checkCircle" />
                )
              }
            />

            {inventoryItems.length > 0 ? (
              <>
                <Surface style={styles.chartSurface}>
                  <Text style={styles.chartCaption}>
                    نمودار مقایسه‌ای موجودی اقلام اصلی (تن)
                  </Text>
                  <BarSeries
                    height={142}
                    data={inventoryItems.slice(0, 6).map((item: any, idx: number) => {
                      const stockKg = Number(item.currentStock || 0);
                      const minKg =
                        item.minStock === null || item.minStock === undefined
                          ? null
                          : Number(item.minStock);
                      const isLow = stockKg <= 0 || (minKg !== null && stockKg < minKg);
                      const ton = Math.max(0, Number((stockKg / 1000).toFixed(1)));
                      return {
                        label: shortItemName(String(item.name || ''), idx),
                        value: ton,
                        display: `${toPersianDigits(ton)}ت`,
                        color: isLow
                          ? palette.critical
                          : chart.series[idx % chart.series.length],
                      };
                    })}
                  />
                </Surface>

                <View style={styles.invCardsList}>
                  {inventoryItems.slice(0, 10).map((item: any, idx: number) => {
                    const stock = Number(item.currentStock || 0);
                    const min =
                      item.minStock === null || item.minStock === undefined
                        ? null
                        : Number(item.minStock);
                    const belowMin = min !== null && stock < min;
                    const outOfStock = stock <= 0;
                    const capacityRef = min && min > 0 ? min * 3 : Math.max(stock, 50000);
                    const fillPct = Math.min(100, Math.max(0, Math.round((stock / capacityRef) * 100)));

                    const accent = outOfStock
                      ? palette.critical
                      : belowMin
                      ? palette.warning
                      : palette.success;

                    return (
                      <AccentSurface
                        key={item.id || idx}
                        accent={accent}
                        padded="sm"
                        style={styles.invItemCard}
                      >
                        <View style={styles.invTopRow}>
                          <View style={styles.invTitleGroup}>
                            <Text style={styles.invName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            {min !== null ? (
                              <Text style={styles.invMinMeta}>
                                حد سفارش مجدد: {formatWeight(min)}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.invRightGroup}>
                            <Text
                              style={[
                                styles.invStockValue,
                                outOfStock && { color: palette.critical },
                                belowMin && !outOfStock && { color: palette.warning },
                              ]}
                            >
                              {formatWeight(stock)}
                            </Text>
                            {outOfStock ? (
                              <Chip label="ناموجود" tone="critical" />
                            ) : belowMin ? (
                              <Chip label="کمتر از حد مجاز" tone="warning" />
                            ) : (
                              <Chip label="کافی" tone="success" />
                            )}
                          </View>
                        </View>

                        <MeterBar
                          percent={fillPct}
                          tone={outOfStock ? 'critical' : belowMin ? 'warning' : 'success'}
                          height={6}
                          style={styles.invMeter}
                        />
                      </AccentSurface>
                    );
                  })}

                  {inventoryItems.length > 10 ? (
                    <Text style={styles.invMore}>
                      و {toPersianDigits(inventoryItems.length - 10)} قلم دیگر در تب «انبار و سیلو»
                    </Text>
                  ) : null}
                </View>
              </>
            ) : (
              <Surface tone="outline" style={styles.invEmpty}>
                <Icon name="warehouse" size={24} color={palette.inkMuted} decorative />
                <Text style={styles.invEmptyText}>
                  هنوز موجودی‌ای برای نمایش ثبت نشده است؛ این بخش مستقیماً از اقلام فعال کالا روی سرور
                  خوانده می‌شود.
                </Text>
              </Surface>
            )}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function shortItemName(name: string, index: number): string {
  const cleaned = name.trim();
  if (!cleaned) return `قلم ${toPersianDigits(index + 1)}`;
  const words = cleaned.split(/\s+/);
  return words.length > 1 ? words.slice(0, 2).join(' ') : words[0];
}

const styles = StyleSheet.create({
  centerContainer: {
    paddingVertical: spacing.xxl * 2,
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
  },
  heroCard: {
    marginBottom: spacing.lg,
  },
  heroBody: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  heroGaugeCol: {
    alignItems: 'center',
  },
  heroFlowsCol: {
    flex: 1,
    gap: spacing.md,
  },
  flowRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  flowTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  flowLabel: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkSecondary,
    textAlign: 'right',
  },
  flowValue: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    textAlign: 'right',
    marginTop: 2,
  },
  flowSubKg: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
  },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  tileGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.md - 2,
    marginTop: spacing.md,
  },
  chartSurface: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  chartCaption: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  invCardsList: {
    gap: spacing.sm,
  },
  invItemCard: {
    gap: spacing.sm,
  },
  invTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  invTitleGroup: {
    flex: 1,
    alignItems: 'flex-end',
  },
  invName: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: palette.ink,
    textAlign: 'right',
  },
  invMinMeta: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  invRightGroup: {
    alignItems: 'flex-start',
    gap: 4,
  },
  invStockValue: {
    fontFamily: typography.bold,
    fontSize: fontSize.lg,
    color: palette.primary,
  },
  invMeter: {
    marginTop: 2,
  },
  invMore: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  invEmpty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    marginTop: spacing.md,
  },
  invEmptyText: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ManagerKpiScreen;