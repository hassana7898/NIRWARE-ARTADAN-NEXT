import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerInvoicesScreen } from '../screens/farmer/FarmerInvoicesScreen';
import { FarmerOrdersScreen } from '../screens/farmer/FarmerOrdersScreen';
import { Icon } from '../components/common/Icon';
import { palette, fontSize, spacing, spacingHalf, typography } from '../theme/tokens';

const Tab = createBottomTabNavigator();

export function FarmerNavigator() {
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
      <Tab.Screen
        name="FarmerDashboard"
        component={FarmerDashboardScreen}
        options={{
          tabBarLabel: 'داشبورد دوره',
          tabBarIcon: ({ color }) => (
            <Icon name="farmerDashboard" size={22} color={color} accessibilityLabel="داشبورد دوره" />
          ),
        }}
      />
      <Tab.Screen
        name="FarmerOrders"
        component={FarmerOrdersScreen}
        options={{
          tabBarLabel: 'سفارش‌های من',
          tabBarIcon: ({ color }) => (
            <Icon name="farmerOrders" size={22} color={color} accessibilityLabel="سفارش‌های من" />
          ),
        }}
      />
      <Tab.Screen
        name="FarmerInvoices"
        component={FarmerInvoicesScreen}
        options={{
          tabBarLabel: 'حواله‌ها و باسکول',
          tabBarIcon: ({ color }) => (
            <Icon name="farmerInvoices" size={22} color={color} accessibilityLabel="حواله‌ها و باسکول" />
          ),
        }}
      />
    </Tab.Navigator>
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

export default FarmerNavigator;
