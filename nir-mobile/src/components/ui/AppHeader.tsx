import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Icon, type AppIconName } from '../common/Icon';
import { IconButton } from './controls';
import {
  palette,
  brand,
  radius,
  spacing,
  spacingHalf,
  fontSize,
  typography,
  layout,
} from '../../theme/tokens';

export interface AppHeaderProps {
  /** Page title. The largest text on screen. */
  title: string;
  /** Supporting line under the title — context, not decoration. */
  subtitle?: string;
  /** Small label ABOVE the title: the role, or a section of the plant. */
  eyebrow?: string;
  /** Leading (rightmost in RTL) icon rendered in a rounded square. */
  icon?: AppIconName;
  /** Trailing (leftmost) slot: logout, refresh, actions. */
  trailing?: React.ReactNode;
  /** One or more live pills rendered on the second row of the band. */
  status?: React.ReactNode;
  /** Filled action placed between the icon and the title. */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The dark identity band that opens every authenticated screen.
 *
 * This is the single biggest structural change in the redesign. Previously each screen began with a
 * 56px white bar containing a name, a role in parentheses and a "خروج" button — all three the same
 * size and weight, so the header carried no hierarchy and the page below it started at the same
 * visual level as a card. The band now:
 *
 *   - fixes the eye's origin on every screen, so navigating feels like moving within one product
 *   - carries role + context + status at three distinct weights
 *   - gives the light content below a surface to sit on, which makes cards read as cards
 */
export function AppHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  trailing,
  status,
  action,
  style,
}: AppHeaderProps) {
  return (
    <View style={[styles.band, style]}>
      <View style={styles.row}>
        {icon ? (
          <View style={styles.iconBox}>
            <Icon name={icon} size={21} color={brand.bandAccent} decorative />
          </View>
        ) : null}

        <View style={styles.titleCol}>
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

        {action ? <View style={styles.action}>{action}</View> : null}
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {status ? <View style={styles.statusRow}>{status}</View> : null}
    </View>
  );
}

/** Compact shell: status bar + header band, for stacking above a scrollable body. */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.shell} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={brand.band900} />
      {children}
    </SafeAreaView>
  );
}

/**
 * Content column. Caps width on tablets and centres it, so a card never stretches to 1000px.
 * `gutter` can be dropped by a screen that draws its own full-bleed sections.
 */
export function Content({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { width } = useWindowDimensions();
  const wide = width > layout.maxContentWidth;

  return (
    <View
      style={[
        styles.content,
        padded && { paddingHorizontal: layout.gutter },
        wide && { alignSelf: 'center', width: layout.maxContentWidth },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Live indicator used inside the band for connection / environment state. */
export function StatusDot({ tone = 'live', label }: { tone?: 'live' | 'idle' | 'warn'; label?: string }) {
  const color =
    tone === 'live' ? brand.bandSuccess : tone === 'warn' ? brand.bandWarning : brand.onBandMuted;
  return (
    <View style={styles.dotRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {label ? <Text style={styles.dotLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: palette.background,
  },
  band: {
    backgroundColor: brand.band900,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: layout.gutter,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(56,189,248,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  eyebrow: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: brand.bandAccent,
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: typography.bold,
    fontSize: fontSize.xxl,
    color: brand.onBand,
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: brand.onBandMuted,
    textAlign: 'right',
    marginTop: 1,
  },
  action: {
    alignItems: 'flex-start',
  },
  trailing: {
    alignItems: 'flex-start',
    flexDirection: 'row-reverse',
  },
  statusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacingHalf.sm,
    marginTop: spacing.md,
  },
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  dotRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotLabel: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: brand.onBandMuted,
  },
});

export default AppHeader;