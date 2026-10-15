import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { QuickRemittanceScreen } from '../screens/operator/QuickRemittanceScreen';
import { OperatorWeighbridgeScreen } from '../screens/operator/OperatorWeighbridgeScreen';
import { Icon } from '../components/common/Icon';
import { palette, fontSize, spacing, spacingHalf, typography } from '../theme/tokens';

const Tab = createBottomTabNavigator();

export function OperatorNavigator() {
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
        name="QuickRemittance"
        component={QuickRemittanceScreen}
        options={{
          tabBarLabel: 'ثبت سریع حواله',
          tabBarIcon: ({ color }) => (
            <Icon
              name="operatorQuickRemittance"
              size={22}
              color={color}
              accessibilityLabel="ثبت سریع حواله"
            />
          ),
        }}
      />
      <Tab.Screen
        name="OperatorWeighbridge"
        component={OperatorWeighbridgeScreen}
        options={{
          tabBarLabel: 'قبوض باسکول',
          tabBarIcon: ({ color }) => (
            <Icon name="operatorWeighbridge" size={22} color={color} accessibilityLabel="قبوض باسکول" />
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

export default OperatorNavigator;
