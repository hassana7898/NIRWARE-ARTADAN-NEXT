import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { PersianDatePickerModal } from '../../components/common/PersianDatePickerModal';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { toPersianDigits, formatNumberWithCommas } from '../../utils/formatters';
import { jalaliText } from '../../utils/jalali';
import { toAsciiDigits } from '../../utils/persianText';
import type { BroodPeriodItem } from '../../features/farmer/farmerStatement';

import { readBroodCounts, type BroodCountsResult } from '../../features/farmer/broodValidation';
import { Icon } from '../../components/common/Icon';
import { palette } from '../../theme/tokens';

interface ManageBroodModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  brood: BroodPeriodItem | null;
  farmerId?: string | null;
  mode: 'update' | 'archive';
}

export function ManageBroodModal({
  visible,
  onClose,
  onSuccess,
  brood,
  farmerId,
  mode,
}: ManageBroodModalProps) {
  const [name, setName] = useState('');
  const [chickCount, setChickCount] = useState('');
  const [mortalityCount, setMortalityCount] = useState('');
  const [finalWeight, setFinalWeight] = useState('');
  const [endDate, setEndDate] = useState(jalaliText(new Date()));
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (brood && visible) {
      setName(brood.name || '');
      setChickCount(String(brood.chickCount || 0));
      setMortalityCount(String(brood.mortalityCount || 0));
      setFinalWeight(brood.finalWeight ? String(brood.finalWeight) : '');
      setEndDate(brood.endDateJalali || jalaliText(brood.endDate) || jalaliText(new Date()));
      setErrorText(null);
    }
  }, [brood, visible]);

  if (!brood) return null;

  /**
   * Numeric contract for the brood form. The rules themselves live in the pure module
   * `features/farmer/broodValidation` so they can be unit-tested without React Native; this
   * wrapper only feeds it the current field values and the persisted brood.
   */
  const readCounts = (): BroodCountsResult =>
    readBroodCounts({
      chickCountField: chickCount,
      mortalityCountField: mortalityCount,
      mode,
      storedChickCount: Number(brood.chickCount || 0),
    });

  const handleSubmit = () => {
    setErrorText(null);

    const counts = readCounts();
    if ('error' in counts) {
      setErrorText(counts.error);
      return;
    }

    if (mode === 'archive' && !endDate.trim()) {
      setErrorText('تاریخ پایان دوره الزامی است.');
      return;
    }

    if (submitting) return;

    // `Alert.alert` does not resolve, so confirmation is wired through the button callback.
    if (mode === 'archive') {
      const fw = parseFloat(toAsciiDigits(finalWeight).replace(/[^\d.]/g, ''));
      Alert.alert(
        'تأیید بستن دوره پرورشی',
        `دوره «${brood.name}» با تاریخ پایان ${endDate.trim()} بایگانی شود؟${
          fw > 0 ? ` وزن نهایی ثبت‌شده: ${formatNumberWithCommas(fw)} کیلوگرم.` : ''
        } پس از بایگانی، دوره دیگر جزو دوره‌های فعال نخواهد بود.`,
        [
          { text: 'انصراف', style: 'cancel' },
          { text: 'بستن دوره', style: 'default', onPress: () => void patchBrood(counts) },
        ],
        { cancelable: true }
      );
      return;
    }

    Alert.alert(
      'تأیید ذخیره تغییرات',
      `تغییرات دوره «${brood.name}» ذخیره شود؟ تلفات ثبت‌شده: ${formatNumberWithCommas(counts.mort)} قطعه.`,
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'ذخیره تغییرات', style: 'default', onPress: () => void patchBrood(counts) },
      ],
      { cancelable: true }
    );
  };

  const patchBrood = async (counts: { chick: number; mort: number }) => {
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {};
      if (farmerId) payload.farmerId = farmerId;

      const fw = parseFloat(toAsciiDigits(finalWeight).replace(/[^\d.]/g, ''));

      if (mode === 'archive') {
        payload.endDate = toAsciiDigits(endDate.trim());
        payload.isArchived = true;
        if (fw > 0) {
          payload.finalWeight = fw;
          payload.finalChickenWeight = fw;
        }
        payload.mortalityCount = counts.mort;
      } else {
        if (name.trim()) payload.name = name.trim();
        payload.chickCount = counts.chick;
        payload.flockCount = counts.chick;
        payload.mortalityCount = counts.mort;
        payload.finalWeight = fw > 0 ? fw : null;
      }

      await apiClient.patch(Endpoints.farmer.broodById(brood.id), payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'خطا در به‌روزرسانی دوره.';
      setErrorText(String(msg));
      Alert.alert('خطا', String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = () => {
    setErrorText(null);
    if (submitting) return;

    Alert.alert(
      'تأیید بازگشایی دوره',
      `دوره «${brood.name}» دوباره فعال شود؟ تاریخ پایان حذف و دوره به وضعیت فعال بازگردانده می‌شود.`,
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'بازگشایی دوره', style: 'default', onPress: () => void reopenBrood() },
      ],
      { cancelable: true }
    );
  };

  const reopenBrood = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        endDate: null,
        isArchived: false,
      };
      if (farmerId) payload.farmerId = farmerId;
      await apiClient.patch(Endpoints.farmer.broodById(brood.id), payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'خطا در بازگشایی دوره.';
      setErrorText(String(msg));
      Alert.alert('خطا', String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  // Preview FCR calculation
  const parsedFinalWeight = parseFloat(toAsciiDigits(finalWeight).replace(/[^\d.]/g, '')) || 0;
  const totalFeedKg = brood.feedConsumedKg || 0;
  const previewFcr =
    parsedFinalWeight > 0 && totalFeedKg > 0 ? (totalFeedKg / parsedFinalWeight).toFixed(2) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={16} color={palette.inkSecondary} accessibilityLabel="بستن" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {mode === 'archive' ? 'پایان دوره و محاسبه ضریب تبدیل' : 'ثبت تلفات و ویرایش اطلاعات دوره'}
              </Text>
              <Text style={styles.subtitle}>{brood.name}</Text>
            </View>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {mode === 'update' && (
              <>
                <Text style={styles.label}>عنوان دوره پرورشی:</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="نام دوره پرورشی"
                />

                <Text style={styles.label}>تعداد جوجه اولیه (قطعه):</Text>
                <TextInput
                  style={styles.input}
                  value={chickCount}
                  onChangeText={(txt) => setChickCount(toAsciiDigits(txt).replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                />
              </>
            )}

            <Text style={styles.label}>تعداد کل تلفات ثبت‌شده تا کنون (قطعه):</Text>
            <TextInput
              style={styles.input}
              value={mortalityCount}
              onChangeText={(txt) => setMortalityCount(toAsciiDigits(txt).replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="مثال: 450"
            />
            {brood.chickCount > 0 && (
              <Text style={styles.previewHint}>
                درصد زنده‌مانی گله:{' '}
                {toPersianDigits(
                  Math.max(
                    0,
                    (((brood.chickCount - (parseInt(mortalityCount, 10) || 0)) / brood.chickCount) * 100)
                  ).toFixed(1)
                )}
                ٪ ({toPersianDigits(formatNumberWithCommas(Math.max(0, brood.chickCount - (parseInt(mortalityCount, 10) || 0))))} قطعه زنده)
              </Text>
            )}

            {mode === 'archive' && (
              <>
                <Text style={styles.label}>تاریخ خاتمه دوره و تخلیه سالن (شمسی):</Text>
                <TouchableOpacity
                  style={styles.dateSelector}
                  onPress={() => setDateModalVisible(true)}
                >
                  <Text style={styles.dateText}>{toPersianDigits(endDate)}</Text>
                  <View style={styles.dateBadge}>
                    <Icon name="calendar" size={14} color={palette.warning} decorative />
                  <Text style={styles.dateBadgeText}>انتخاب تاریخ</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.label}>
              مجموع وزن مرغ زنده فروخته‌شده / کشتارگاه (کیلوگرم):
            </Text>
            <TextInput
              style={styles.input}
              value={finalWeight}
              onChangeText={(txt) => setFinalWeight(toAsciiDigits(txt).replace(/[^\d.]/g, ''))}
              keyboardType="number-pad"
              placeholder="مثال: 58000 (جهت محاسبه دقیق FCR)"
            />

            {previewFcr ? (
              <View style={styles.fcrPreviewCard}>
                <Text style={styles.fcrPreviewTitle}>ضریب تبدیل غذایی (FCR) محاسبه‌شده:</Text>
                <Text style={styles.fcrPreviewValue}>{toPersianDigits(previewFcr)}</Text>
                <Text style={styles.fcrPreviewSub}>
                  بر اساس {toPersianDigits(formatNumberWithCommas(totalFeedKg))} کیلوگرم دان مصرفی و{' '}
                  {toPersianDigits(formatNumberWithCommas(parsedFinalWeight))} کیلوگرم وزن زنده مرغ
                </Text>
              </View>
            ) : null}

            {brood.isArchived && mode === 'update' ? (
              <TouchableOpacity
                style={styles.reopenBtn}
                onPress={handleReopen}
                disabled={submitting}
              >
                <Text style={styles.reopenBtnText}>🔄 بازگشایی مجدد این دوره به حالت فعال</Text>
              </TouchableOpacity>
            ) : null}

            {errorText ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorText}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>انصراف</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                mode === 'archive' && styles.archiveSubmitBtn,
                submitting && styles.btnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'archive' ? 'تایید و بستن دوره' : 'ذخیره تغییرات دوره'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <PersianDatePickerModal
        visible={dateModalVisible}
        initialDate={endDate}
        onClose={() => setDateModalVisible(false)}
        onSelect={(selected) => setEndDate(selected)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
    marginBottom: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: 'bold',
  },
  title: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 16,
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
  },
  formScroll: {
    marginBottom: 14,
  },
  label: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 13,
    color: '#334155',
    textAlign: 'right',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 14,
    color: '#0f172a',
    textAlign: 'right',
  },
  previewHint: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#16a34a',
    textAlign: 'right',
    marginTop: 4,
  },
  dateSelector: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dateText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 15,
    color: '#0f172a',
  },
  dateBadge: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateBadgeText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#7e22ce',
  },
  fcrPreviewCard: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    alignItems: 'center',
  },
  fcrPreviewTitle: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#047857',
  },
  fcrPreviewValue: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 24,
    color: '#059669',
    marginVertical: 2,
  },
  fcrPreviewSub: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
  },
  reopenBtn: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 14,
    alignItems: 'center',
  },
  reopenBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 13,
    color: '#047857',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  errorText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  archiveSubmitBtn: {
    backgroundColor: '#7e22ce',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#ffffff',
  },
});

export default ManageBroodModal;
