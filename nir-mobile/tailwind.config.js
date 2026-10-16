/** @type {import('tailwindcss').Config} */
const { nirDesignSystemConfig } = require('./src/design-system/theme/designTokens');

module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Legacy Expo family aliases kept for older call sites.
        vazir: ['Vazirmatn_400Regular'],
        'vazir-medium': ['Vazirmatn_500Medium'],
        'vazir-bold': ['Vazirmatn_700Bold'],
        // Design-system family (Vazirmatn) — spread LAST so `font-vazirmatn` wins.
        ...nirDesignSystemConfig.theme.extend.fontFamily,
      },
      colors: {
        // Legacy scale kept under its own keys for older call sites.
        primaryScale: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        // Design-system semantic palette (Slate + Emerald) — spread LAST so `primary`,
        // `surface`, `border`, etc. resolve to the new tokens.
        ...nirDesignSystemConfig.theme.extend.colors,
      },
      fontSize: nirDesignSystemConfig.theme.extend.fontSize,
      fontWeight: nirDesignSystemConfig.theme.extend.fontWeight,
      borderRadius: nirDesignSystemConfig.theme.extend.borderRadius,
      boxShadow: nirDesignSystemConfig.theme.extend.boxShadow,
    },
  },
  plugins: [],
};