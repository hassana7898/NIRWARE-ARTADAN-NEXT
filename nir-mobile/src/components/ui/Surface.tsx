import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  palette,
  radius,
  spacing,
  borderWidth,
  elevation,
  brand,
} from '../../theme/tokens';

export type SurfaceTone =
  /** Default content card: white, hairline outline, no shadow. The workhorse. */
  | 'raised'
  /** Card sitting on the identity band — dark surface, light text. */
  | 'band'
  /** Recessed area inside a card, for nested detail rows. */
  | 'sunken'
  /** Hairline-only card, used for tertiary groupings. */
  | 'outline';

export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

export interface SurfaceProps {
  tone?: SurfaceTone;
  /** Inner padding step. Defaults to `md`. */
  padded?: SurfacePadding;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}

const PADDING: Record<SurfacePadding, number> = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

/**
 * The single card primitive. Before v2 every screen declared its own "card" StyleSheet entry, which
 * is why the product ended up with subtly different white boxes on 21 screens.
 *
 * A `band` tone is the important addition: it is the only sanctioned way to place a card on the dark
 * identity band, so chrome and content never end up with two competing white surfaces.
 */
export function Surface({
  tone = 'raised',
  padded = 'md',
  style,
  children,
  testID,
}: SurfaceProps) {
  return (
    <View
      testID={testID}
      style={[styles.base, styles[`tone_${tone}`], { padding: PADDING[padded] }, style]}
    >
      {children}
    </View>
  );
}

/**
 * Card with a semantic strip down its RIGHT (leading) edge — the RTL equivalent of a left border.
 * Used when a card's whole purpose is to say "this one is late" / "this one is fine", so the state
 * is readable before the text is.
 */
export function AccentSurface({
  accent = palette.primary,
  tone = 'raised',
  padded = 'md',
  style,
  children,
  testID,
}: SurfaceProps & { accent?: string }) {
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        styles[`tone_${tone}`],
        { padding: PADDING[padded] },
        { borderRightWidth: borderWidth.accent, borderRightColor: accent },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Hairline divider. One implementation so the weight never drifts between screens. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tone_raised: {
    backgroundColor: palette.surface,
    borderWidth: borderWidth.edge,
    borderColor: palette.border,
    ...elevation.card,
  },
  tone_outline: {
    backgroundColor: 'transparent',
    borderWidth: borderWidth.edge,
    borderColor: palette.border,
  },
  tone_sunken: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: borderWidth.hair,
    borderColor: palette.border,
  },
  tone_band: {
    backgroundColor: brand.band700,
    borderWidth: borderWidth.hair,
    borderColor: brand.band600,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    width: '100%',
  },
});

export default Surface;