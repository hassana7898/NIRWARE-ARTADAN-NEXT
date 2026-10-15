import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from './Icon';
import { palette, fontSize, radius, spacing, typography } from '../../theme/tokens';
import { deriveScreenState, type DeriveStateInput, type ScreenStateResult } from '../../features/ui/screenState';

export interface ScreenStateProps extends DeriveStateInput {
  /** Forces a specific variant instead of deriving it. Used by the tests and by rare screens. */
  forceKind?: ScreenStateResult['kind'];
  /** Text of the optional primary action shown in the empty state. */
  actionLabel?: string;
  /** Safe action for the empty state. Without it the button is never rendered. */
  onAction?: () => void;
}

const TONE = {
  neutral: { fg: palette.inkSecondary, bg: palette.surfaceMuted },
  critical: { fg: palette.critical, bg: palette.criticalMuted },
} as const;

/**
 * One component for "cannot show data right now".
 *
 * Deliberate behaviours:
 *  - a retry button appears ONLY when a real, side-effect-free re-read callback was supplied;
 *  - an expired session never shows retry, so the app cannot loop on 401;
 *  - the empty state offers an action only when the caller provided a safe handler.
 */
export function ScreenState({
  forceKind,
  actionLabel,
  onAction,
  ...input
}: ScreenStateProps) {
  const derived = deriveScreenState(input);
  const kind = forceKind && forceKind !== 'ready' ? forceKind : derived.kind;

  if (kind === 'ready') return null;

  const isError = kind === 'error';
  const tone = isError ? TONE.critical : TONE.neutral;

  const message =
    kind === 'loading'
      ? input.messages?.loading || 'در حال دریافت اطلاعات...'
      : derived.message;

  const showRetry = isError && derived.canRetry;
  const showAction = kind === 'empty' && typeof onAction === 'function' && !!actionLabel;

  return (
    <View style={styles.wrapper} accessibilityRole="alert" accessible={kind !== 'loading'}>
      {kind === 'loading' ? (
        <ActivityIndicator size="large" color={palette.primary} />
      ) : (
        <View style={[styles.iconBadge, { backgroundColor: tone.bg }]}>
          {isError ? (
            <Icon name="error" size={26} color={tone.fg} decorative />
          ) : (
            <Icon name="empty" size={26} color={tone.fg} decorative />
          )}
        </View>
      )}

      <Text style={styles.message}>{message}</Text>

      {showRetry ? (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={input.onRetry}
          accessibilityRole="button"
          accessibilityLabel="تلاش دوباره"
        >
          <Text style={styles.retryText}>تلاش دوباره</Text>
        </TouchableOpacity>
      ) : null}

      {showAction ? (
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    // 44px minimum touch target.
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.primaryBorder,
    backgroundColor: palette.primaryMuted,
  },
  retryText: {
    fontFamily: typography.bold,
    fontSize: fontSize.md,
    color: palette.primary,
  },
  actionBtn: {
    minHeight: 44,
    minWidth: 160,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: palette.primary,
  },
  actionText: {
    fontFamily: typography.bold,
    fontSize: fontSize.md,
    color: palette.inkInverse,
  },
});

export default ScreenState;