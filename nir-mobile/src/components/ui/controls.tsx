import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { Icon, type AppIconName } from '../common/Icon';
import { palette, radius, spacing, fontSize, typography, layout, brand } from '../../theme/tokens';

/* ==================================================================================================
 * TextField — label + control as ONE unit, with an explicit placeholder colour.
 *
 * The v1 login field was a bare `TextInput` with a hardcoded `placeholder="09121112233"` and no
 * `placeholderTextColor`, so on React Native Web the placeholder inherited the browser default and
 * rendered as strongly as real input text. Here the placeholder is always `inkMuted`.
 * ============================================================================================== */

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  icon?: AppIconName;
  /** Left-hand node inside the control — e.g. the `۰۹` prefix of an Iranian mobile number. */
  prefix?: string;
  hint?: string;
  errorText?: string;
  /** Removes the label row when the surrounding component already labels the group. */
  hideLabel?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  icon,
  prefix,
  hint,
  errorText,
  hideLabel,
  containerStyle,
  ...inputProps
}: TextFieldProps) {
  const hasError = !!errorText;

  return (
    <View style={containerStyle}>
      {label && !hideLabel ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.control, hasError && styles.controlError]}>
        {icon ? (
          <Icon
            name={icon}
            size={18}
            color={hasError ? palette.critical : palette.inkMuted}
            decorative
          />
        ) : null}

        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}

        <TextInput
          {...inputProps}
          style={styles.input}
          placeholderTextColor={palette.inkMuted}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
        />
      </View>

      {errorText ? (
        <View style={styles.messageRow}>
          <Icon name="alertCircle" size={13} color={palette.critical} decorative />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ==================================================================================================
 * SegmentedControl — the replacement for the hand-rolled `tabRow` duplicated in LoginScreen.
 * ============================================================================================== */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: AppIconName;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Sits on a dark surface and switches its own colours. */
  tone?: 'light' | 'onBand';
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  tone = 'light',
  style,
}: SegmentedControlProps<T>) {
  const onBand = tone === 'onBand';

  return (
    <View style={[styles.segment, onBand && styles.segmentOnBand, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            style={[styles.segmentItem, active && (onBand ? styles.segmentItemOnBand : styles.segmentItemActive)]}
          >
            {opt.icon ? (
              <Icon
                name={opt.icon}
                size={16}
                color={active ? (onBand ? brand.band900 : palette.primary) : palette.inkMuted}
                decorative
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                !active && { color: onBand ? brand.onBandMuted : palette.inkSecondary },
                active && (onBand ? styles.segmentTextOnBand : styles.segmentTextActive),
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ==================================================================================================
 * Buttons
 * ============================================================================================== */

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  icon?: AppIconName;
  /** Trailing icon rendered on the LEFT — the RTL "next" affordance. */
  trailingIcon?: AppIconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANTS = {
  primary: { bg: palette.primary, fg: palette.inkInverse, bd: 'transparent', pressed: palette.primaryPressed },
  secondary: { bg: palette.surface, fg: palette.primary, bd: palette.primaryBorder, pressed: palette.primaryMuted },
  ghost: { bg: palette.surfaceMuted, fg: palette.inkSecondary, bd: 'transparent', pressed: palette.surfaceSunken },
  danger: { bg: palette.critical, fg: palette.inkInverse, bd: 'transparent', pressed: '#991B1B' },
} as const;

const SIZES = {
  sm: { py: spacing.sm, px: spacing.md, font: fontSize.md, min: 36 },
  md: { py: spacing.md, px: spacing.lg, font: fontSize.lg, min: layout.minTouchTarget },
  lg: { py: 14, px: spacing.lg, font: fontSize.xl, min: 52 },
} as const;

export function ActionButton({
  label,
  onPress,
  icon,
  trailingIcon,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth = true,
  style,
  testID,
}: ActionButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isOff = disabled || loading;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isOff}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isOff, busy: !!loading }}
      style={[
        styles.button,
        {
          backgroundColor: v.bg,
          borderColor: v.bd,
          paddingVertical: s.py,
          paddingHorizontal: s.px,
          minHeight: s.min,
        },
        fullWidth && { alignSelf: 'stretch' },
        isOff && styles.buttonOff,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={s.font + 4} color={v.fg} decorative /> : null}
          <Text style={[styles.buttonText, { color: v.fg, fontSize: s.font }]} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon ? <Icon name={trailingIcon} size={s.font + 3} color={v.fg} decorative /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

/** Square icon-only control for header actions. Always carries a label for screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'light',
  size = 38,
  style,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  tone?: 'light' | 'onBand';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const onBand = tone === 'onBand';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: onBand ? 'rgba(255,255,255,0.08)' : palette.surfaceMuted,
          borderColor: onBand ? brand.band600 : palette.border,
        },
        style,
      ]}
    >
      <Icon name={icon} size={size * 0.46} color={onBand ? brand.onBand : palette.inkSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'right',
    marginBottom: spacing.xs + 2,
  },
  control: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouchTarget + 4,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
  },
  controlError: {
    borderColor: palette.critical,
    backgroundColor: palette.criticalMuted,
  },
  prefix: {
    fontFamily: typography.medium,
    fontSize: fontSize.lg,
    color: palette.inkSecondary,
  },
  input: {
    flex: 1,
    fontFamily: typography.regular,
    fontSize: fontSize.xl,
    color: palette.ink,
    textAlign: 'right',
    paddingVertical: spacing.md,
    ...(({ outlineStyle: 'none' } as unknown) as object),
  },
  messageRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs + 1,
  },
  errorText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.critical,
    textAlign: 'right',
    flex: 1,
  },
  hint: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'right',
    marginTop: spacing.xs + 1,
    lineHeight: 19,
  },

  segment: {
    flexDirection: 'row-reverse',
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentOnBand: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 1,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm + 2,
  },
  segmentItemActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentItemOnBand: {
    backgroundColor: brand.bandAccent,
  },
  segmentText: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
  },
  segmentTextActive: {
    color: palette.primary,
    fontFamily: typography.bold,
  },
  segmentTextOnBand: {
    color: brand.band900,
    fontFamily: typography.bold,
  },

  button: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonOff: {
    opacity: 0.55,
  },
  buttonText: {
    fontFamily: typography.bold,
  },

  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});

export default TextField;