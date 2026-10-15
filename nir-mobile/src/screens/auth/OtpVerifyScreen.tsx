import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { extractApiErrorMessage } from '../../api/errors';
import { toPersianDigits } from '../../utils/formatters';
import { Icon } from '../../components/common/Icon';
import { Surface } from '../../components/ui/Surface';
import { ActionButton } from '../../components/ui/controls';
import { Chip } from '../../components/ui/SectionHeader';
import {
  palette,
  brand,
  radius,
  spacing,
  fontSize,
  typography,
  layout,
} from '../../theme/tokens';

export function OtpVerifyScreen({ route, navigation }: any) {
  const { phone, debugCode } = route?.params || { phone: '' };
  const { verifyOtp, requestOtp } = useAuth();

  const [code, setCode] = useState(debugCode || '');
  const [timer, setTimer] = useState<number>(120);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      setErrorMsg('کد تایید باید ۶ رقمی باشد');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      await verifyOtp(phone, code);
    } catch (err: any) {
      setErrorMsg(extractApiErrorMessage(err, 'کد وارد شده نامعتبر یا منقضی است'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setErrorMsg(null);
    try {
      const res = await requestOtp(phone);
      setTimer(120);
      if (res.debugCode) {
        setCode(res.debugCode);
      }
    } catch (err: any) {
      setErrorMsg(extractApiErrorMessage(err, 'ارسال مجدد پیامک ناموفق بود.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeTop} edges={['top', 'left', 'right']}>
        <View style={styles.band}>
          <View style={styles.bandRow}>
            <View style={styles.iconBox}>
              <Icon name="shieldCheck" size={22} color={brand.bandAccent} decorative />
            </View>
            <View style={styles.bandTextCol}>
              <Text style={styles.bandEyebrow}>احراز هویت پیامکی NIRWARE</Text>
              <Text style={styles.bandTitle}>تأیید شمارهٔ همراه</Text>
              <Text style={styles.bandSub}>
                کد ۶ رقمی ارسال‌شده به {toPersianDigits(phone || '۰۹۱۲...')}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.column}>
            <Surface style={styles.card}>
              <View style={styles.cardTopRow}>
                <Chip
                  label={
                    timer > 0
                      ? `اعتبار کد: ${toPersianDigits(formatTimer(timer))}`
                      : 'منقضی شده'
                  }
                  tone={timer > 0 ? 'primary' : 'warning'}
                  icon="timer"
                />
                <Text style={styles.cardHeading}>ورود کد یک‌بارمصرف</Text>
              </View>

              {debugCode ? (
                <View style={styles.debugBox}>
                  <Icon name="info" size={15} color={palette.primary} decorative />
                  <Text style={styles.debugText}>
                    کد تست محیط توسعه: {toPersianDigits(debugCode)}
                  </Text>
                </View>
              ) : null}

              <TextInput
                style={styles.otpInput}
                value={code}
                onChangeText={(val) => setCode(val.replace(/[^\d]/g, ''))}
                placeholder="• • • • • •"
                placeholderTextColor={palette.inkMuted}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                accessibilityLabel="کد تأیید شش رقمی"
              />

              <ActionButton
                label="تأیید و ورود به حساب"
                icon="checkCircle"
                trailingIcon="forward"
                size="lg"
                loading={loading}
                onPress={handleVerify}
              />

              <View style={styles.footerRow}>
                {timer > 0 ? (
                  <Text style={styles.timerText}>
                    امکان ارسال مجدد کد پس از {toPersianDigits(formatTimer(timer))}
                  </Text>
                ) : (
                  <ActionButton
                    label={resending ? 'در حال ارسال مجدد...' : 'ارسال مجدد کد تأیید'}
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    disabled={resending}
                    onPress={handleResend}
                  />
                )}

                <TouchableOpacity
                  onPress={() => navigation?.goBack?.()}
                  style={styles.backBtn}
                  accessibilityRole="button"
                >
                  <Icon name="pencil" size={14} color={palette.inkSecondary} decorative />
                  <Text style={styles.backText}>ویرایش شمارهٔ همراه</Text>
                </TouchableOpacity>
              </View>

              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Icon name="alertCircle" size={16} color={palette.critical} decorative />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}
            </Surface>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg * 1.5,
    borderBottomRightRadius: radius.lg * 1.5,
  },
  bandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: 'rgba(56,189,248,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  bandEyebrow: {
    fontFamily: typography.medium,
    fontSize: fontSize.xs,
    color: brand.bandAccent,
  },
  bandTitle: {
    fontFamily: typography.bold,
    fontSize: fontSize.xxl,
    color: brand.onBand,
    marginTop: 2,
  },
  bandSub: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: brand.onBandMuted,
    marginTop: 2,
  },
  scrollContent: {
    paddingTop: spacing.xl,
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
    gap: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeading: {
    fontFamily: typography.bold,
    fontSize: fontSize.xl,
    color: palette.ink,
  },
  debugBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.primaryMuted,
    borderWidth: 1,
    borderColor: palette.primaryBorder,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  debugText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.primary,
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: palette.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.bold,
    fontSize: 26,
    letterSpacing: 10,
    textAlign: 'center',
    color: palette.ink,
    backgroundColor: palette.surfaceMuted,
  },
  footerRow: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.md,
  },
  timerText: {
    fontFamily: typography.regular,
    fontSize: fontSize.sm,
    color: palette.inkMuted,
  },
  backBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  backText: {
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.inkSecondary,
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.criticalMuted,
    borderWidth: 1,
    borderColor: palette.criticalBorder,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.medium,
    fontSize: fontSize.sm,
    color: palette.critical,
    textAlign: 'right',
  },
});

export default OtpVerifyScreen;