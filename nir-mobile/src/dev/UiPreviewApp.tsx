import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { DriverLoadsScreen } from '../screens/driver/DriverLoadsScreen';
import { ManagerKpiScreen } from '../screens/manager/ManagerKpiScreen';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient, APP_VARIANT } from '../api/client';
import { Icon } from '../components/common/Icon';
import {
  previewDashboardRaw,
  previewStatementRaw,
  previewDriverLoadsRaw,
  previewManagerKpiRaw,
} from './previewData';
import { evaluateUiPreviewGate, type UiPreviewGateInput } from './previewGate';
import { palette, brand, radius, spacing, fontSize, typography } from '../theme/tokens';

export { evaluateUiPreviewGate, type UiPreviewGateInput };

export const isUiPreviewEnabled = evaluateUiPreviewGate({
  isDevRuntime: typeof __DEV__ !== 'undefined' && Boolean(__DEV__),
  appVariant: APP_VARIANT,
  nodeEnv: process.env.NODE_ENV,
  previewFlag: process.env.EXPO_PUBLIC_UI_PREVIEW,
});

export function installPreviewNetwork(): () => void {
  if (!isUiPreviewEnabled) return () => {};

  const previous = apiClient.defaults.adapter;

  apiClient.defaults.adapter = async (config: any) => {
    const url = String(config?.url || '');
    const method = String(config?.method || 'get').toLowerCase();

    if (method !== 'get') {
      return Promise.reject(
        makeError(config, 405, 'پیش‌نمایش طراحی: درخواست نوشتنی اجرا نمی‌شود')
      );
    }

    if (url.indexOf('/farmer/dashboard') !== -1) {
      return reply(config, previewDashboardRaw);
    }
    if (url.indexOf('/farmer/statement') !== -1) {
      return reply(config, previewStatementRaw);
    }
    if (url.indexOf('/driver/loads') !== -1) {
      return reply(config, previewDriverLoadsRaw);
    }
    if (url.indexOf('/manager/kpi') !== -1) {
      return reply(config, previewManagerKpiRaw);
    }

    return Promise.reject(
      makeError(config, 501, `پیش‌نمایش طراحی: مسیر ${url} تعریف نشده است`)
    );
  };

  return () => {
    apiClient.defaults.adapter = previous;
  };
}

function reply(config: any, data: unknown) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
}

function makeError(config: any, status: number, message: string) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    config,
    response: { status, data: { message }, statusText: message, headers: {}, config },
  });
}

type PreviewScreen = 'login' | 'farmerDashboard' | 'driverLoads' | 'managerKpi';

const PREVIEW_SCREENS: Array<{ key: PreviewScreen; label: string }> = [
  { key: 'login', label: 'ورود به سامانه' },
  { key: 'farmerDashboard', label: 'داشبورد مرغدار' },
  { key: 'driverLoads', label: 'کارتابل راننده' },
  { key: 'managerKpi', label: 'اتاق کنترل مدیر' },
];

export function UiPreviewApp() {
  const [screen, setScreen] = React.useState<PreviewScreen>(() => {
    try {
      const q =
        typeof window !== 'undefined' && window.location
          ? String(window.location.search || '')
          : '';
      if (q.indexOf('screen=farmerDashboard') !== -1) return 'farmerDashboard';
      if (q.indexOf('screen=driverLoads') !== -1) return 'driverLoads';
      if (q.indexOf('screen=managerKpi') !== -1) return 'managerKpi';
      return 'login';
    } catch {
      return 'login';
    }
  });

  const client = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  );

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={client}>
          <View style={styles.root}>
            <PreviewSwitcher current={screen} onChange={setScreen} />
            <View style={styles.body}>
              {screen === 'login' ? (
                <LoginScreen navigation={{ navigate: () => {} }} />
              ) : screen === 'farmerDashboard' ? (
                <FarmerDashboardScreen navigation={{ goBack: () => {} }} route={{ params: {} }} />
              ) : screen === 'driverLoads' ? (
                <DriverLoadsScreen navigation={{ navigate: () => {} }} />
              ) : (
                <ManagerKpiScreen />
              )}
            </View>
          </View>
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function PreviewSwitcher({
  current,
  onChange,
}: {
  current: PreviewScreen;
  onChange: (s: PreviewScreen) => void;
}) {
  return (
    <View style={styles.switcher}>
      <View style={styles.switcherLabel}>
        <Icon name="sparkles" size={13} color={brand.bandAccent} decorative />
        <Text style={styles.switcherText}>پیش‌نمایش طراحی صنعتی NIRWARE — محیط توسعه ایزوله</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.switcherRow}
      >
        {PREVIEW_SCREENS.map((s) => (
          <TouchableOpacity
            key={s.key}
            onPress={() => onChange(s.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: current === s.key }}
            style={[styles.switcherBtn, current === s.key && styles.switcherBtnActive]}
          >
            <Text
              style={[
                styles.switcherBtnText,
                current === s.key && styles.switcherBtnTextActive,
              ]}
            >
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  body: {
    flex: 1,
  },
  switcher: {
    backgroundColor: brand.band800,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: brand.band600,
  },
  switcherLabel: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  switcherText: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: brand.onBandMuted,
  },
  switcherRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  switcherBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: brand.band600,
  },
  switcherBtnActive: {
    backgroundColor: brand.bandAccent,
    borderColor: brand.bandAccent,
  },
  switcherBtnText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: brand.onBandMuted,
  },
  switcherBtnTextActive: {
    color: brand.band900,
    fontFamily: typography.bold,
  },
});

export default UiPreviewApp;