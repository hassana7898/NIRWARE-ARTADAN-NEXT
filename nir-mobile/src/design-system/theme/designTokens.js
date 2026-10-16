/**
 * Design Tokens (Plain JS) — Tailwind/NativeWind config extension.
 *
 * WHY THIS FILE IS .js AND NOT .ts:
 * `tailwind.config.js` is loaded by Node via `require()` at build time, which cannot resolve
 * TypeScript modules. This file is the single source of truth for the Tailwind theme extension.
 * The TS token files under `tokens/` feed React Native runtime code (StyleSheet) — keep the
 * palette values below in sync with `tokens/colors.ts` and `tokens/typography.ts`.
 *
 * Palette: Slate (surfaces/text) + Emerald (actions/brand), high contrast for warehouse lighting.
 * Typography: Vazirmatn (loaded in App.tsx via @expo-google-fonts/vazirmatn). NativeWind takes
 * the FIRST fontFamily entry, so single string values are used (each weight is a separate RN
 * family name from expo-google-fonts; Android/iOS synthesise weight on top of the base family).
 */

const designSystemThemeExtend = {
  colors: {
    // Raw scales
    slate: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
    emerald: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
      950: '#022c22',
    },
    // Semantic tokens
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceElevated: '#f1f5f9',
    surfaceInverse: '#0f172a',
    foreground: '#0f172a',
    foregroundInverse: '#ffffff',
    mutedForeground: '#64748b',
    border: '#cbd5e1',
    input: '#cbd5e1',
    ring: '#10b981',
    primary: '#059669',
    primaryForeground: '#ffffff',
    primaryHover: '#047857',
    primaryLight: '#ecfdf5',
    secondary: '#e2e8f0',
    secondaryForeground: '#0f172a',
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',
    success: '#059669',
    successForeground: '#ffffff',
    warning: '#d97706',
    warningForeground: '#ffffff',
    skeleton: '#e2e8f0',
    skeletonHighlight: '#cbd5e1',
  },
  fontFamily: {
    // First entry wins in NativeWind — must match the family names registered in App.tsx.
    vazirmatn: 'Vazirmatn_400Regular',
    sans: 'Vazirmatn_400Regular',
    'vazirmatn-medium': 'Vazirmatn_500Medium',
    'vazirmatn-bold': 'Vazirmatn_700Bold',
    mono: 'monospace',
  },
  fontSize: {
    xs: 11,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 20,
    '3xl': 24,
    '4xl': 30,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  borderRadius: {
    none: 0,
    sm: 4,
    DEFAULT: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    full: 9999,
  },
  // CSS box-shadow strings; NativeWind maps supported entries to RN shadow/elevation props.
  boxShadow: {
    sm: '0px 1px 2px 0px rgba(0,0,0,0.05)',
    base: '0px 2px 4px 0px rgba(0,0,0,0.08)',
    md: '0px 4px 8px 0px rgba(0,0,0,0.10)',
    lg: '0px 8px 16px 0px rgba(0,0,0,0.12)',
    xl: '0px 12px 24px 0px rgba(0,0,0,0.15)',
  },
};

/**
 * Exported shape matches what `tailwind.config.js` consumes:
 *   const { nirDesignSystemConfig } = require('./src/design-system/theme/designTokens');
 */
const nirDesignSystemConfig = {
  theme: {
    extend: designSystemThemeExtend,
  },
};

module.exports = {
  nirDesignSystemConfig,
  designSystemThemeExtend,
};