import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, fontSize, radius, spacing, spacingHalf, typography } from '../../theme/tokens';

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'mismatch'
  | 'done';

interface StatusBadgeProps {
  status: StatusVariant | string;
  label?: string;
  size?: 'sm' | 'md';
}

const statusLabels: Record<string, string> = {
  success: 'موفق',
  done: 'انجام شد',
  delivered: 'تحویل شد',
  warning: 'در انتظار',
  pending: 'در حال بررسی',
  in_transit: 'در مسیر',
  error: 'خطا',
  mismatch: 'مغایرت',
  info: 'اطلاعیه',
};

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();

  // Semantic status colours come from the token set: warning/amber is a state, never an action,
  // and it must never be confused with the single blue action colour.
  // Annotated as `string` because the token palette is `as const` (literal types), and this
  // local is reassigned across branches below.
  let bg: string = palette.surfaceMuted;
  let text: string = palette.inkSecondary;

  if (['success', 'delivered', 'done', 'approved', 'completed'].includes(normalizedStatus)) {
    bg = palette.successMuted;
    text = palette.success;
  } else if (['warning', 'pending', 'in_transit'].includes(normalizedStatus)) {
    bg = palette.warningMuted;
    text = palette.warning;
  } else if (['error', 'mismatch', 'rejected'].includes(normalizedStatus)) {
    bg = palette.criticalMuted;
    text = palette.critical;
  } else if (['info'].includes(normalizedStatus)) {
    bg = palette.infoMuted;
    text = palette.info;
  }

  const displayText = label || statusLabels[normalizedStatus] || status;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg },
        size === 'sm' ? styles.badgeSm : styles.badgeMd,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: text },
          size === 'sm' ? styles.textSm : styles.textMd,
        ]}
      >
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeSm: {
    paddingHorizontal: spacingHalf.xs,
    paddingVertical: 2,
  },
  badgeMd: {
    paddingHorizontal: spacingHalf.sm,
    paddingVertical: spacing.xs,
  },
  text: {
    fontFamily: typography.medium,
  },
  textSm: {
    fontSize: fontSize.xs - 1,
  },
  textMd: {
    fontSize: fontSize.sm,
  },
});

export default StatusBadge;
