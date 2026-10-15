/**
 * NIR Mobile — Design Tokens (single source of truth).
 *
 * Introduced as the foundation for the visual system. Screens are migrated to these values
 * incrementally; nothing here changes behaviour or data flow.
 *
 * Palette intent — "Industrial Precision":
 * a flat, quiet, data-first surface for warehouse and office use under strong lighting.
 * There is exactly ONE action colour. Semantic colours (success / warning / critical) carry
 * status meaning only and must never be used to invite an action, otherwise a red badge and a
 * blue button would compete for the same signal.
 */

export const palette = {
  // Surfaces
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  surfaceSunken: '#E2E8F0',

  // Text
  ink: '#0F172A', // primary
  inkSecondary: '#475569', // supporting copy
  inkMuted: '#94A3B8', // meta, placeholders, disabled
  inkInverse: '#FFFFFF', // on dark / on coloured fills

  // Lines
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // The single action colour
  primary: '#0369A1',
  primaryPressed: '#075985',
  primaryMuted: '#E0F2FE', // tinted background for a selected/active state
  primaryBorder: '#7DD3FC',

  // Semantic status — never an action colour
  success: '#047857',
  successMuted: '#ECFDF5',
  successBorder: '#6EE7B7',

  warning: '#B45309',
  warningMuted: '#FFFBEB',
  warningBorder: '#FCD34D',

  critical: '#B91C1C',
  criticalMuted: '#FEF2F2',
  criticalBorder: '#FCA5A5',

  info: '#0369A1',
  infoMuted: '#F0F9FF',
  infoBorder: '#BAE6FD',
} as const;

/**
 * Spacing scale. Only these values are valid; arbitrary gaps are a bug, not a preference.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Sub-scale for chrome that needs the half-step. Named so call sites stop writing `xs + 2`,
 * which is exactly how a spacing scale erodes. Each entry maps to a real step of `spacing`.
 */
export const spacingHalf = {
  /** 2 — the tightest gap, used for inline icon/text pairs. */
  tight: 2,
  /** 6 — between xs(4) and sm(8). Tab-bar and chip padding. */
  xs: 6,
  /** 10 — between sm(8) and md(12). Compact button padding. */
  sm: 10,
} as const;

/** One radius for the whole product. Mixed radii read as un-designed. */
export const radius = {
  sm: 4,
  md: 8, // default
  lg: 12,
  pill: 999,
} as const;

/** Only the three weights actually bundled by @expo-google-fonts/vazirmatn. */
export const typography = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  bold: 'Vazirmatn_700Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 16,
  xxl: 20,
  display: 28,
} as const;

export const lineHeight = {
  tight: 16,
  snug: 18,
  normal: 22,
  relaxed: 28,
} as const;

/**
 * Elevation is deliberately restrained: an industrial data tool uses borders and surfaces to
 * separate regions, not shadows. Only genuinely floating layers get one.
 */
export const elevation = {
  none: 'none',
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/* ------------------------------------------------------------------------------------------------
 * Design System v2 — "NIR Control Room"
 *
 * Everything above this line is the v1 foundation and is consumed by 21 screens; none of it was
 * renamed or removed. What follows is purely additive: the dark identity band that anchors every
 * screen, the data-visualisation series colours, and the layout constraints that make one design
 * hold from a 320px phone up to a tablet.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The identity band. A control-room product needs a dark anchor at the top of every screen so the
 * eye has a fixed origin and the content below sits on a consistent light surface. These are
 * deliberately NOT derived from `primary`: the band is identity/chrome, the action colour is for
 * actions, and mixing them is what produced the previous flat-everything look.
 */
export const brand = {
  /** Band background, deepest step. */
  band900: '#0A1220',
  /** Band gradient end / raised band surfaces. */
  band800: '#101D33',
  /** Inset surfaces inside the band (cards on the dark header). */
  band700: '#182943',
  /** Hairline that separates band content from band background. */
  band600: '#233A5C',
  /** Primary text on the band. */
  onBand: '#FFFFFF',
  /** Secondary/meta text on the band. */
  onBandMuted: '#8FA6C4',
  /** Accent used for live/active indicators inside the band. */
  bandAccent: '#38BDF8',
  /** Positive state inside the band. */
  bandSuccess: '#34D399',
  /** Warning state inside the band. */
  bandWarning: '#FBBF24',
  /** Critical state inside the band. */
  bandCritical: '#F87171',
} as const;

/**
 * Categorical series for charts and multi-category breakdowns.
 *
 * These are DATA colours, not status colours: the first three are deliberately close in hue so a
 * 4-bar feed-phase chart reads as one family, while a single over-quota bar can still jump to
 * `palette.critical` and be unmistakable.
 */
export const chart = {
  series: ['#0EA5E9', '#14B8A6', '#6366F1', '#F59E0B', '#EC4899', '#64748B'] as const,
  /** Track behind every bar / ring. */
  track: '#E7EDF5',
  /** Grid lines and axis hairlines. */
  grid: '#E2E8F0',
  axisLabel: '#7C8CA3',
} as const;

/**
 * Layout constraints. A single content column keeps line length readable on tablets instead of
 * letting cards stretch the full width of a landscape phone or an iPad.
 */
export const layout = {
  /** Gutters at phone width and above. */
  gutter: spacing.lg,
  /** Widest the content column may grow before it centres instead. */
  maxContentWidth: 720,
  /** Minimum touch target per platform accessibility guidance. */
  minTouchTarget: 44,
  /** Standard header band height. */
  headerHeight: 62,
  /** Tab bar height. */
  tabBarHeight: 62,
} as const;

/** Extra steps for genuine display type; `fontSize.display` stays for legacy call sites. */
export const displaySize = {
  /** One number that owns a card — quota, total tonnage. */
  hero: 30,
  /** Secondary figure beside a hero. */
  large: 22,
} as const;

/**
 * Border widths. One hairline scale: `hair` for separators, `edge` for card outlines, `accent` for
 * the 3px semantic strip on the leading edge of a status card.
 */
export const borderWidth = {
  hair: 1,
  edge: 1,
  accent: 3,
} as const;

export const theme = {
  palette,
  spacing,
  spacingHalf,
  radius,
  typography,
  fontSize,
  lineHeight,
  elevation,
  hitSlop,
  brand,
  chart,
  layout,
  displaySize,
  borderWidth,
} as const;

export type Palette = typeof palette;
export type Brand = typeof brand;
export type Theme = typeof theme;