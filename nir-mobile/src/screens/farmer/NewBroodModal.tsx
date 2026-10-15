import React, { useState } from 'react';
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
import { Icon } from '../../components/common/Icon';
import { palette } from '../../theme/tokens';

interface NewBroodModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (createdBroodId?: string) => void;
  farmerId?: string | null;
  farmerName?: string | null;
}

export function NewBroodModal({
  visible,
  onClose,
  onSuccess,
  farmerId,
  farmerName,
}: NewBroodModalProps) {
  const [name, setName] = useState('');
  const [chickCount, setChickCount] = useState('25000');
  const [startDate, setStartDate] = useState(jalaliText(new Date()));
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const buildPayload = () => {
    const cleanChickCount = parseInt(toAsciiDigits(chickCount).replace(/[^\d]/g, ''), 10);
    const payload: Record<string, any> = {
      name: name.trim() || `دوره جوجه‌ریزی ${startDate.trim()}`,
      startDate: toAsciiDigits(startDate.trim()),
      chickCount: cleanChickCount,
      flockCount: cleanChickCount,
    };
    if (farmerId) {
      payload.farmerId = farmerId;
    }
    return { cleanChickCount, payload };
  };

  // `Alert.alert` does NOT resolve a value, so the submission is started from the button
  // callback rather than from an `await`ed confirmation result.
  const handleSubmit = () => {
    setErrorText(null);
    const cleanChickCount = parseInt(toAsciiDigits(chickCount).replace(/[^\d]/g, ''), 10);

    if (!cleanChickCount || cleanChickCount <= 0) {
      setErrorText('تعداد قطعه جوجه باید عددی بزرگتر از صفر باشد.');
      return;
    }

    if (!startDate.trim()) {
      setErrorText('تاریخ شروع دوره (شمسی) الزامی است.');
      return;
    }

    if (submitting) return;

    Alert.alert(
      'تأیید ثبت دوره پرورشی',
      `آیا دوره «${name.trim() || `جوجه‌ریزی ${startDate.trim()}`}» با ظرفیت ${formatNumberWithCommas(
        cleanChickCount
      )} قطعه جوجه و تاریخ شروع ${startDate.trim()} ثبت شود؟`,
      [
        { text: 'انصراف', style: 'cancel' },
        { text: 'ثبت دوره', style: 'default', onPress: () => void submitBrood() },
      ],
      { cancelable: true }
    );
  };

  const submitBrood = async () => {
    setSubmitting(true);
    try {
      const { payload } = buildPayload();
      const res = await apiClient.post(Endpoints.farmer.broods, payload);
      const createdId = res.data?.brood?.id ? String(res.data.brood.id) : undefined;
      setName('');
      onSuccess(createdId);
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'خطا در ثبت دوره پرورشی.';
      setErrorText(String(msg));
      Alert.alert('خطا در ثبت دوره', String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={16} color={palette.inkSecondary} accessibilityLabel="بستن" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>تعریف دوره پرورشی جدید</Text>
              {farmerName ? (
                <Text style={styles.subtitle}>مرغدار: {farmerName}</Text>
              ) : (
                <Text style={styles.subtitle}>ثبت جوجه‌ریزی جدید و محاسبه خودکار سهمیه دان</Text>
              )}
            </View>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>عنوان دوره پرورشی (اختیاری):</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={`مثال: دوره پاییز (${toPersianDigits(startDate)})`}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.label}>تعداد قطعه جوجه‌ریزی:</Text>
            <TextInput
              style={styles.input}
              value={chickCount}
              onChangeText={(txt) => setChickCount(toAsciiDigits(txt).replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="مثال: 25000"
              placeholderTextColor="#94a3b8"
            />
            {chickCount ? (
              <Text style={styles.previewHint}>
                ظرفیت ثبت‌شده: {toPersianDigits(formatNumberWithCommas(parseInt(chickCount, 10) || 0))} قطعه جوجه یک‌روزه
              </Text>
            ) : null}

            <View style={styles.quickCountsRow}>
              {[10000, 15000, 20000, 25000, 30000, 40000].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.quickCountChip,
                    parseInt(chickCount, 10) === val && styles.quickCountChipActive,
                  ]}
                  onPress={() => setChickCount(String(val))}
                >
                  <Text
                    style={[
                      styles.quickCountText,
                      parseInt(chickCount, 10) === val && styles.quickCountTextActive,
                    ]}
                  >
                    {toPersianDigits((val / 1000).toLocaleString())} هزار
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>تاریخ شروع جوجه‌ریزی (شمسی):</Text>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setDateModalVisible(true)}
            >
              <Text style={styles.dateText}>{toPersianDigits(startDate)}</Text>
              <View style={styles.dateBadge}>
                <Icon name="calendar" size={14} color={palette.primary} decorative />
                <Text style={styles.dateBadgeText}>انتخاب از تقویم</Text>
              </View>
            </TouchableOpacity>

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
              style={[styles.submitBtn, submitting && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>ثبت و شروع دوره</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <PersianDatePickerModal
        visible={dateModalVisible}
        initialDate={startDate}
        onClose={() => setDateModalVisible(false)}
        onSelect={(selected) => setStartDate(selected)}
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
    maxHeight: '88%',
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
    color: '#0284c7',
    textAlign: 'right',
    marginTop: 4,
  },
  quickCountsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  quickCountChip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  quickCountChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  quickCountText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#475569',
  },
  quickCountTextActive: {
    fontFamily: 'Vazirmatn_700Bold',
    color: '#0284c7',
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
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateBadgeText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#0284c7',
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
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
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

export default NewBroodModal;
