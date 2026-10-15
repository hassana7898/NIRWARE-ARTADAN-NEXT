import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { OfflineStatusBar } from './OfflineStatusBar';
import { Icon, type AppIconName } from './Icon';
import {
  palette,
  brand,
  fontSize,
  radius,
  spacing,
  spacingHalf,
  typography,
  layout,
} from '../../theme/tokens';

interface ScreenContainerProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  showBack?: boolean;
  onBack?: () => void;
  headerRight?: React.ReactNode;
}

/**
 * Shared industrial control-room shell for NIRWARE screens.
 *
 * Preserves the exact `ScreenContainerProps` contract consumed across Driver, Farmer, Operator, and
 * Manager screens while replacing the flat 56px white bar with the unified dark identity band.
 */
export function ScreenContainer({
  title,
  subtitle,
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  showBack = false,
  onBack,
  headerRight,
}: ScreenContainerProps) {
  const { user, role, logout } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width > layout.maxContentWidth;

  const roleMeta: { title: string; icon: AppIconName } =
    role === 'DRIVER'
      ? { title: 'ناوگان حمل و نقل', icon: 'truck' }
      : role === 'FARMER'
      ? { title: 'واحد پرورش مرغ گوشتی', icon: 'bird' }
      : role === 'OPERATOR'
      ? { title: 'ایستگاه باسکول و حواله', icon: 'scaleGlyph' }
      : role === 'ADMIN'
      ? { title: 'مدیریت ارشد کارخانه', icon: 'shieldCheck' }
      : role === 'ACCOUNTING'
      ? { title: 'حسابداری و تسویهٔ حواله‌ها', icon: 'wallet' }
      : { title: 'اتاق کنترل و مدیریت کارخانه', icon: 'factoryAlt' };

  const userDisplay = user?.fullName || user?.username || 'کاربر سامانه';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={brand.band900} />
      <OfflineStatusBar />

      {/* Industrial Dark Identity Band */}
      <View style={styles.band}>
        <View style={styles.topRow}>
          <View style={styles.identityGroup}>
            {showBack ? (
              <TouchableOpacity
                style={styles.backButton}
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="بازگشت"
              >
                <Icon name="back" size={18} color={brand.onBand} decorative />
                <Text style={styles.backText}>بازگشت</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.iconBox}>
                <Icon name={roleMeta.icon} size={20} color={brand.bandAccent} decorative />
              </View>
            )}

            <View style={styles.titleCol}>
              <View style={styles.eyebrowRow}>
                <View style={styles.liveDot} />
                <Text style={styles.eyebrowText} numberOfLines={1}>
                  {roleMeta.title} · {userDisplay}
                </Text>
              </View>
              {title ? (
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actionsGroup}>
            {headerRight ? (
              headerRight
            ) : (
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={() => logout()}
                accessibilityRole="button"
                accessibilityLabel="خروج از حساب"
              >
                <Text style={styles.logoutText}>خروج</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Main Body */}
      {scrollable ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.scrollContent,
            wide && { alignSelf: 'center', width: layout.maxContentWidth },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[palette.primary]}
                tintColor={palette.primary}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.content,
            styles.staticContent,
            wide && { alignSelf: 'center', width: layout.maxContentWidth },
          ]}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  band: {
    backgroundColor: brand.band900,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  identityGroup: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
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
    alignItems: 'flex-end',
  },
  eyebrowRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brand.bandSuccess,
  },
  eyebrowText: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: brand.bandAccent,
    textAlign: 'right',
  },
  headerTitle: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    color: brand.onBand,
    textAlign: 'right',
  },
  headerSubtitle: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: brand.onBandMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  actionsGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: brand.band700,
    borderWidth: 1,
    borderColor: brand.band600,
    paddingHorizontal: spacing.md,
    paddingVertical: spacingHalf.xs,
    borderRadius: radius.md,
    minHeight: 38,
  },
  backText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: brand.onBand,
  },
  logoutBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacingHalf.xs,
    borderRadius: radius.md,
    minHeight: 36,
    justifyContent: 'center',
    backgroundColor: 'rgba(248,113,113,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.32)',
  },
  logoutText: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: brand.bandCritical,
  },
  content: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  staticContent: {
    padding: spacing.lg,
  },
});

export default ScreenContainer;