import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { isValidIranianMobile } from '../../utils/persianText';
import { OfflineStatusBar } from '../../components/common/OfflineStatusBar';
import { getApiBaseUrl, setApiBaseUrl, describeApiTarget } from '../../api/client';
import { extractApiErrorMessage } from '../../api/errors';
import { Icon } from '../../components/common/Icon';
import { TextField, SegmentedControl, ActionButton, IconButton } from '../../components/ui/controls';
import { Surface } from '../../components/ui/Surface';
import { Chip } from '../../components/ui/SectionHeader';
import { palette, brand, radius, spacing, fontSize, layout, typography } from '../../theme/tokens';

/**
 * Redesigned sign-in screen.
 *
 * What changed and why — the v1 screen was a vertical stack of "label + TextInput + button" on a
 * light-grey page, with a floating circle logo above it. It read as a web form dropped onto a phone.
 *
 *   1. The screen now OPENS with a full-bleed dark band that states the product, the plant and the
 *      environment at a glance. Users of an industrial system care that they are pointed at the
 *      right server before they type a phone number — that was previously a small green pill buried
 *      under the logo.
 *   2. Auth method is a segmented control with icons rather than two text tabs in a grey pill, so
 *      the choice reads as a switch, and it is full-width instead of a cramped 5-across row.
 *   3. Fields have real labels, leading icons and a phone prefix, and placeholders are always muted
 *      (the old one rendered as dark as real input on web).
 *   4. Supporting text was cut by roughly half. v1 explained the SMS flow in two sentences under a
 *      single field; now one line, and only as a hint.
 *
 * Behaviour is untouched: same `requestOtp` / `loginWithPassword` calls, same OTP navigation with
 * `debugCode`, same server-settings modal and same `setApiBaseUrl` guard.
 */
export function LoginScreen({ navigation }: any) {
  const { requestOtp, loginWithPassword } = useAuth();
  const { height } = useWindowDimensions();

  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(getApiBaseUrl());
  const [apiTarget, setApiTarget] = useState(describeApiTarget());

  useEffect(() => {
    setCurrentUrl(getApiBaseUrl());
    setApiTarget(describeApiTarget());
  }, []);

  // Phone validation feedback is shown inline as the user types, but the server is still the
  // authority — this only avoids a pointless request for an obviously malformed number.
  const phoneTouched = phone.length > 0;
  const phoneInvalid = phoneTouched && !isValidIranianMobile(phone);

  const handleRequestOtp = async () => {
    setErrorMsg(null);
    if (!isValidIranianMobile(phone)) {
      setErrorMsg('شماره تلفن همراه معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)');
      return;
    }

    setLoading(true);
    try {
      const res = await requestOtp(phone);
      // debugCode is present ONLY when the server runs with MOBILE_OTP_DEBUG=true (dev tree);
      // in the production flow the code arrives by SMS and the verification screen starts empty.
      navigation.navigate('OtpVerify', { phone, debugCode: res.debugCode });
    } catch (err: any) {
      setErrorMsg(extractApiErrorMessage(err, 'خطا در ارسال کد تایید پیامکی'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    setErrorMsg(null);
    if (!username.trim() || !password.trim()) {
      setErrorMsg('نام کاربری و کلمه عبور را وارد کنید');
      return;
    }

    setLoading(true);
    try {
      const res = await loginWithPassword(username, password, totpCode || undefined);
      if (res.twoFactorRequired || res.requires2FA) {
        setRequires2FA(true);
        setErrorMsg('کد احراز هویت دومرحله‌ای (Authenticator) را وارد کنید.');
      }
    } catch (err: any) {
      setErrorMsg(extractApiErrorMessage(err, 'نام کاربری یا کلمه عبور اشتباه است'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerUrl = () => {
    if (!currentUrl.trim()) {
      Alert.alert('خطا', 'آدرس سرور نمی‌تواند خالی باشد');
      return;
    }

    const decision = setApiBaseUrl(currentUrl.trim());
    setShowSettingsModal(false);
    setApiTarget(describeApiTarget());

    if (!decision.allowed) {
      Alert.alert('آدرس رد شد', decision.reason || 'این آدرس برای این نسخه مجاز نیست.');
      return;
    }

    Alert.alert('موفقیت', 'تنظیمات سرور ذخیره شد.');
  };

  // On a short device (landscape phone) the brand block would push the form off-screen, so it
  // collapses to a single compact row and the content scrolls.
  const compact = height < 700;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeTop} edges={['top', 'left', 'right']}>
        <OfflineStatusBar />

        {/* ---- Identity band ---------------------------------------------------------------- */}
        <View style={[styles.band, compact && styles.bandCompact]}>
          <View style={styles.bandTopRow}>
            <View style={styles.brandMark}>
              <Icon name="factoryAlt" size={24} color={brand.bandAccent} decorative />
            </View>

            <View style={styles.brandTextCol}>
              <Text style={styles.brandName}>NIRWARE</Text>
              <Text style={styles.brandTag}>سامانهٔ یکپارچهٔ خوراک دام و طیور</Text>
            </View>

            <IconButton
              icon="gear"
              label="تنظیم سرور"
              onPress={() => setShowSettingsModal(true)}
              tone="onBand"
            />
          </View>

          {compact ? null : (
            <>
              <Text style={styles.bandHeadline}>
                کارخانهٔ خوراک مرغ گوشتی آرتادان
              </Text>
              <Text style={styles.bandBody}>
                حواله، انبار، باسکول و تسویه در یک سامانه
              </Text>
            </>
          )}

          <View style={styles.bandStatusRow}>
            <Chip label={apiTarget} tone="onBand" icon="dot" />
          </View>
        </View>
      </SafeAreaView>

      {/* ---- Form ---------------------------------------------------------------------------- */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>ورود به سامانه</Text>
              <Text style={styles.cardSubtitle}>
                روش ورود متناسب با نقش شما را انتخاب کنید
              </Text>

              <SegmentedControl
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setErrorMsg(null);
                }}
                options={[
                  { value: 'otp', label: 'پیامکی', icon: 'phone' },
                  { value: 'password', label: 'نام کاربری', icon: 'keyRound' },
                ]}
                style={styles.segment}
              />

              {mode === 'otp' ? (
                <View style={styles.form}>
                  <TextField
                    label="شمارهٔ تلفن همراه"
                    icon="phone"
                    prefix="۰۹"
                    value={phone}
                    onChangeText={(t) => {
                      setPhone(t);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="۱۲۳۴۵۶۷۸۹"
                    keyboardType="phone-pad"
                    maxLength={11}
                    errorText={phoneInvalid ? 'شماره باید ۱۱ رقم و با ۰۹ آغاز شود' : undefined}
                    hint="کد یک‌بارمصرف به این شماره پیامک می‌شود."
                  />

                  <ActionButton
                    label="دریافت کد ورود"
                    icon="send"
                    trailingIcon="forward"
                    onPress={handleRequestOtp}
                    loading={loading}
                    size="lg"
                    testID="login-submit"
                  />
                </View>
              ) : (
                <View style={styles.form}>
                  <TextField
                    label="نام کاربری"
                    icon="user"
                    value={username}
                    onChangeText={setUsername}
                    placeholder="admin"
                    autoCapitalize="none"
                  />

                  <TextField
                    label="کلمهٔ عبور"
                    icon="lock"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                  />

                  {requires2FA ? (
                    <TextField
                      label="کد تأیید دو مرحله‌ای"
                      icon="shieldCheck"
                      value={totpCode}
                      onChangeText={setTotpCode}
                      placeholder="۱۲۳۴۵۶"
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  ) : null}

                  <ActionButton
                    label="ورود به پنل مدیریت"
                    icon="shieldCheck"
                    trailingIcon="forward"
                    onPress={handlePasswordLogin}
                    loading={loading}
                    size="lg"
                    testID="login-submit"
                  />
                </View>
              )}

              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Icon name="alertCircle" size={16} color={palette.critical} decorative />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}
            </Surface>

            <View style={styles.rolesHint}>
              <Icon name="shieldCheck" size={15} color={palette.inkMuted} decorative />
              <Text style={styles.rolesHintText}>
                هر حساب فقط به بخش‌های مجاز خود دسترسی دارد؛ نقش شما از سوی کارخانه تعیین می‌شود.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ---- Server settings modal (behaviour unchanged) -------------------------------------- */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <Icon name="gear" size={18} color={palette.primary} decorative />
              </View>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>تنظیمات اتصال به سرور</Text>
                <Text style={styles.modalDesc}>
                  آدرس API سامانه را وارد یا از پیش‌فرض‌ها انتخاب کنید.
                </Text>
              </View>
            </View>

            <TextField
              label="آدرس API سرور (Base URL)"
              icon="warehouse"
              value={currentUrl}
              onChangeText={setCurrentUrl}
              placeholder="https://dev.artadan.ir"
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.modalField}
            />

            <View style={styles.quickRow}>
              {/* Phase 3 isolation: this is the DEV-only client, so the operational host is not
                  even present in the source. There is no button and no variant branch that could
                  point the app at production; `utils/envGuard.ts` still refuses that host if it is
                  ever typed into the field above. */}
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => setCurrentUrl('https://dev.artadan.ir')}
              >
                <Text style={styles.quickChipText}>سرور توسعه</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtnRow}>
              <ActionButton
                label="انصراف"
                variant="ghost"
                onPress={() => setShowSettingsModal(false)}
                fullWidth={false}
                style={styles.modalBtn}
              />
              <ActionButton
                label="ذخیره و اعمال"
                icon="check"
                onPress={handleSaveServerUrl}
                fullWidth={false}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  flex: {
    flex: 1,
  },
  safeTop: {
    backgroundColor: brand.band900,
  },

  band: {
    backgroundColor: brand.band900,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg * 1.5,
    borderBottomRightRadius: radius.lg * 1.5,
  },
  bandCompact: {
    paddingBottom: spacing.md,
  },
  bandTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(56,189,248,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  brandName: {
    fontFamily: typography.bold,
    fontSize: fontSize.xxl,
    color: brand.onBand,
    letterSpacing: 1.4,
  },
  brandTag: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: brand.onBandMuted,
    marginTop: 1,
  },
  bandHeadline: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    color: brand.onBand,
    textAlign: 'right',
    marginTop: spacing.lg,
  },
  bandBody: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: brand.onBandMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  bandStatusRow: {
    flexDirection: 'row-reverse',
    marginTop: spacing.lg,
  },

  scroll: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  column: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.gutter,
  },
  card: {
    padding: spacing.lg,
  },
  cardTitle: {
    fontFamily: typography.bold,
    fontSize: fontSize.xxl,
    color: palette.ink,
    textAlign: 'right',
  },
  cardSubtitle: {
    fontFamily: typography.regular,
    fontSize: fontSize.md,
    color: palette.inkSecondary,
    textAlign: 'right',
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  segment: {
    marginBottom: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.criticalMuted,
    borderWidth: 1,
    borderColor: palette.criticalBorder,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.critical,
    textAlign: 'right',
    lineHeight: 20,
  },
  rolesHint: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  rolesHintText: {
    flex: 1,
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
    textAlign: 'right',
    lineHeight: 19,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,18,32,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: palette.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    color: palette.ink,
    textAlign: 'right',
  },
  modalDesc: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 19,
  },
  modalField: {
    marginBottom: spacing.md,
  },
  quickRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.primaryMuted,
    borderWidth: 1,
    borderColor: palette.primaryBorder,
  },
  quickChipText: {
    fontFamily: typography.medium,
    fontSize: fontSize.md,
    color: palette.primary,
  },
  modalBtnRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  modalBtn: {
    flex: 1,
  },
});

export default LoginScreen;