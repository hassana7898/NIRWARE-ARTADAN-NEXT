import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { toPersianDigits, formatNumberWithCommas } from '../../utils/formatters';
import {
  palette,
  radius,
  spacing,
  fontSize,
  typography,
  borderWidth,
  displaySize,
  elevation,
} from '../../theme/tokens';

interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  subtitle?: string;
  trend?: string;
  trendPositive?: boolean;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'warning' | 'danger' | 'success';
}

const VARIANT_MAP = {
  default: { accent: palette.inkSecondary, soft: palette.surfaceMuted },
  primary: { accent: palette.primary, soft: palette.primaryMuted },
  success: { accent: palette.success, soft: palette.successMuted },
  warning: { accent: palette.warning, soft: palette.warningMuted },
  danger: { accent: palette.critical, soft: palette.criticalMuted },
} as const;

export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trend,
  trendPositive,
  icon,
  variant = 'default',
}: MetricCardProps) {
  const formattedValue =
    typeof value === 'number'
      ? toPersianDigits(formatNumberWithCommas(value))
      : toPersianDigits(value);

  const tone = VARIANT_MAP[variant] || VARIANT_MAP.default;

  return (
    <View style={[styles.card, { borderRightColor: tone.accent }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {icon ? (
          <View style={[styles.iconContainer, { backgroundColor: tone.soft }]}>{icon}</View>
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: tone.accent }]} numberOfLines={1}>
          {formattedValue}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      {subtitle || trend ? (
        <View style={styles.footerRow}>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : (
            <View />
          )}
          {trend ? (
            <View
              style={[
                styles.trendBadge,
                trendPositive ? styles.trendPos : styles.trendNeg,
              ]}
            >
              <Text
                style={[
                  styles.trendText,
                  trendPositive ? styles.trendTextPos : styles.trendTextNeg,
                ]}
              >
                {toPersianDigits(trend)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: borderWidth.edge,
    borderColor: palette.border,
    borderRightWidth: borderWidth.accent,
    ...elevation.card,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  title: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'right',
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  value: {
    fontFamily: typography.bold,
    fontSize: displaySize.large,
    textAlign: 'right',
  },
  unit: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
  },
  footerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subtitle: {
    flex: 1,
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkMuted,
    textAlign: 'right',
    lineHeight: 17,
  },
  trendBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  trendPos: {
    backgroundColor: palette.successMuted,
  },
  trendNeg: {
    backgroundColor: palette.criticalMuted,
  },
  trendText: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
  },
  trendTextPos: {
    color: palette.success,
  },
  trendTextNeg: {
    color: palette.critical,
  },
});

export default MetricCard;