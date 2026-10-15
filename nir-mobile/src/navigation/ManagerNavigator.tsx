import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { ManagerKpiScreen } from '../screens/manager/ManagerKpiScreen';
import { RemittancesScreen } from '../screens/manager/RemittancesScreen';
import { WeighbridgeMonitorScreen } from '../screens/manager/WeighbridgeMonitorScreen';
import { InventoryMonitorScreen } from '../screens/manager/InventoryMonitorScreen';
import { MoreMenuScreen } from '../screens/manager/MoreMenuScreen';
import { FarmersDirectoryScreen } from '../screens/manager/FarmersDirectoryScreen';
import { ApprovalsScreen } from '../screens/manager/ApprovalsScreen';
import { UnmatchedDriversScreen } from '../screens/manager/UnmatchedDriversScreen';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { Icon } from '../components/common/Icon';
import { palette, fontSize, spacing, spacingHalf, typography } from '../theme/tokens';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ManagerTabs() {
  const { role } = useAuth();
  const isAccounting = role === 'ACCOUNTING';

  // ACCOUNTING is granted on the invoice/report surface by the backend
  // (server/routes/invoices.ts, server/routes/sync.ts) but NOT on the manager-only mobile
  // endpoints — /manager/kpi, /manager/proofs and /manager/unmatched-drivers all require
  // ADMIN|MANAGER. Those tabs are therefore hidden here; every endpoint still enforces the
  // same rule server-side, so this is a UX affordance and never the security control.
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.inkSecondary,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {isAccounting ? null : (
        <Tab.Screen
          name="ManagerKpi"
          component={ManagerKpiScreen}
          options={{
            tabBarLabel: 'شاخص‌ها',
            tabBarIcon: ({ color }) => (
              <Icon name="managerKpi" size={22} color={color} accessibilityLabel="شاخص‌ها" />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="Remittances"
        component={RemittancesScreen}
        options={{
          tabBarLabel: 'حواله‌ها',
          tabBarIcon: ({ color }) => (
            <Icon name="managerRemittances" size={22} color={color} accessibilityLabel="حواله‌ها" />
          ),
        }}
      />
      <Tab.Screen
        name="WeighbridgeMonitor"
        component={WeighbridgeMonitorScreen}
        options={{
          tabBarLabel: 'باسکول',
          tabBarIcon: ({ color }) => (
            <Icon name="managerWeighbridge" size={22} color={color} accessibilityLabel="باسکول" />
          ),
        }}
      />
      {isAccounting ? null : (
        <Tab.Screen
          name="InventoryMonitor"
          component={InventoryMonitorScreen}
          options={{
            tabBarLabel: 'انبار و سیلو',
            tabBarIcon: ({ color }) => (
              <Icon name="managerInventory" size={22} color={color} accessibilityLabel="انبار و سیلو" />
            ),
          }}
        />
      )}
      <Tab.Screen
        name="MoreMenu"
        component={MoreMenuScreen}
        options={{
          tabBarLabel: 'بیش‌تر',
          tabBarIcon: ({ color }) => (
            <Icon name="managerMore" size={22} color={color} accessibilityLabel="بیش‌تر" />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function ManagerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_left',
      }}
    >
      <Stack.Screen name="ManagerTabsRoot" component={ManagerTabs} />
      <Stack.Screen name="FarmersDirectory" component={FarmersDirectoryScreen} />
      <Stack.Screen name="ManagerFarmerDetail" component={FarmerDashboardScreen} />
      <Stack.Screen name="Approvals" component={ApprovalsScreen} />
      <Stack.Screen name="UnmatchedDrivers" component={UnmatchedDriversScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    height: 60,
    paddingBottom: spacing.sm,
    paddingTop: spacingHalf.xs,
  },
  tabLabel: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
  },
});

export default ManagerNavigator;
