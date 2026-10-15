import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type AppIconName } from '../common/Icon';
import { palette, radius, spacing, spacingHalf, fontSize, typography, borderWidth, displaySize } from '../../theme/tokens';

export type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'critical';

const TONES: Record<StatTone, { accent: string; soft: string }> = {
  neutral: { accent: palette.inkSecondary, soft: palette.surfaceMuted },
  primary: { accent: palette.primary, soft: palette.primaryMuted },
  success: { accent: palette.success, soft: palette.successMuted },
  warning: { accent: palette.warning, soft: palette.warningMuted },
  critical: { accent: palette.critical, soft: palette.criticalMuted },
};

export interface StatTileProps {
  label: string;
  /** Already formatted by the caller — Persian digits, thousands separators, units. */
  value: string;
  unit?: string;
  /** One line of context. This is what turns a number into a fact. */
  caption?: string;
  icon?: AppIconName;
  tone?: StatTone;
  /** Directional change, e.g. `۳٫۲٪−`. Renders with its own colour + arrow icon. */
  delta?: { text: string; direction: 'up' | 'down' | 'flat' };
  /** Stretches to half a row. Tiles default to full width so a 2-up grid is opt-in per row. */
  half?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The KPI tile.
 *
 * v1 had two competing tile components (`MetricCard` with a hardcoded right border, and four
 * hand-written "luxury" metric cards inside FarmerDashboard) that disagreed on padding, radius and
 * colour logic. This is the single implementation, and the semantic tone drives BOTH the icon chip
 * and the leading-edge strip so a tile's state is legible before its text.
 */
export function StatTile({
  label,
  value,
  unit,
  caption,
  icon,
  tone = 'neutral',
  delta,
  half,
  style,
  testID,
}: StatTileProps) {
  const t = TONES[tone];

  return (
    <View
      testID={testID}
      style={[
        styles.tile,
        { borderRightColor: t.accent },
        half && styles.half,
        style,
      ]}
    >
      <View style={styles.topRow}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        {icon ? (
          <View style={[styles.iconChip, { backgroundColor: t.soft }]}>
            <Icon name={icon} size={15} color={t.accent} decorative />
          </View>
        ) : null}
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: t.accent }]} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      {caption || delta ? (
        <View style={styles.footRow}>
          {caption ? (
            <Text style={styles.caption} numberOfLines={2}>
              {caption}
            </Text>
          ) : (
            <View />
          )}
          {delta ? (
            <View style={styles.delta}>
              <Icon
                name={
                  delta.direction === 'up'
                    ? 'trendingUp'
                    : delta.direction === 'down'
                    ? 'trendingDown'
                    : 'dot'
                }
                size={12}
                color={
                  delta.direction === 'down' ? palette.critical : palette.success
                }
                decorative
              />
              <Text style={styles.deltaText}>{delta.text}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: borderWidth.edge,
    borderColor: palette.border,
    borderRightWidth: borderWidth.accent,
    padding: spacing.md + 2,
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  half: {
    flexBasis: '48%',
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'right',
    lineHeight: 18,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    gap: 3,
  },
  value: {
    fontFamily: typography.bold,
    fontSize: displaySize.large,
    textAlign: 'right',
  },
  unit: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
  },
  footRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xs + 2,
  },
  caption: {
    flex: 1,
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'right',
    lineHeight: 17,
  },
  delta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  deltaText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
  },
});

export default StatTile;