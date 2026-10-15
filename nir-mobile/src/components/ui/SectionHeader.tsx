import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type AppIconName } from '../common/Icon';
import { palette, radius, spacing, fontSize, brand } from '../../theme/tokens';

export interface SectionHeaderProps {
  /** Small uppercase-feel label above the title. Optional — a bare title is a valid section. */
  eyebrow?: string;
  title: string;
  /** Icon sitting at the far right (RTL start). Omit for text-only sections. */
  icon?: AppIconName;
  /** Secondary node at the far left (RTL end): a filter chip, a count, a link. */
  trailing?: React.ReactNode;
  /** Muted supporting line under the title. */
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The label of a region on a screen.
 *
 * v1 had no section concept at all: every card simply started with a bold line of text, so a
 * dashboard read as an undifferentiated stack. An icon + eyebrow + title triple gives each region a
 * recognisable silhouette, which is what lets the eye skim the screen instead of reading it.
 */
export function SectionHeader({
  eyebrow,
  title,
  icon,
  trailing,
  subtitle,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      {icon ? (
        <View style={styles.iconBox}>
          <Icon name={icon} size={17} color={palette.primary} decorative />
        </View>
      ) : null}

      <View style={styles.textCol}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

export interface ChipProps {
  label: string;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'critical' | 'onBand';
  icon?: AppIconName;
  style?: StyleProp<ViewStyle>;
}

const CHIP_TONES = {
  neutral: { bg: palette.surfaceMuted, fg: palette.inkSecondary, bd: palette.border },
  primary: { bg: palette.primaryMuted, fg: palette.primary, bd: palette.primaryBorder },
  success: { bg: palette.successMuted, fg: palette.success, bd: palette.successBorder },
  warning: { bg: palette.warningMuted, fg: palette.warning, bd: palette.warningBorder },
  critical: { bg: palette.criticalMuted, fg: palette.critical, bd: palette.criticalBorder },
  onBand: { bg: 'rgba(56,189,248,0.14)', fg: brand.bandAccent, bd: 'rgba(56,189,248,0.32)' },
} as const;

/** Small state pill. Replaces the free-form coloured `View`s that were scattered across screens. */
export function Chip({ label, tone = 'neutral', icon, style }: ChipProps) {
  const t = CHIP_TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.bd }, style]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} decorative /> : null}
      <Text style={[styles.chipText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: palette.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  eyebrow: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: fontSize.xs - 1,
    color: palette.inkMuted,
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  title: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: fontSize.xl,
    color: palette.ink,
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
    textAlign: 'right',
    marginTop: 2,
  },
  trailing: {
    alignItems: 'flex-start',
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: fontSize.xs,
  },
});

export default SectionHeader;