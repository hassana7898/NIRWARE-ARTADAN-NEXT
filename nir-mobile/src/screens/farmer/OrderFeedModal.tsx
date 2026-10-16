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
import { useQuery } from '@tanstack/react-query';
import { PersianDatePickerModal } from '../../components/common/PersianDatePickerModal';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { validateOrderInput } from '../../features/farmer/farmerOrders';
import { toPersianDigits, formatNumberWithCommas } from '../../utils/formatters';
import { jalaliText } from '../../utils/jalali';

interface OrderFeedModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  farmerId?: string | null;
}

interface ProductOption {
  id: string;
  name: string;
}

export function OrderFeedModal({
  visible,
  onClose,
  onSuccess,
  farmerId,
}: OrderFeedModalProps) {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [weightKg, setWeightKg] = useState('10000');
  const [targetDate, setTargetDate] = useState(jalaliText(new Date()));
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: products = [], isLoading: loadingProducts, error: productsError } = useQuery<ProductOption[]>({
    queryKey: ['farmer-products'],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.farmer.products);
      return res.data?.products || [];
    },
    enabled: visible,
  });

  React.useEffect(() => {
    if (products.length > 0 && (!selectedProduct || !products.some((p) => p.id === selectedProduct))) {
      setSelectedProduct(products[0].id);
    }
  }, [products, selectedProduct]);

  const handleSubmit = async () => {
    const numericWeight = parseFloat(weightKg.replace(/[^\d.]/g, ''));
    const validation = validateOrderInput({
      productId: selectedProduct,
      requestedWeightKg: numericWeight,
      targetDate,
      notes,
    });

    if (!validation.valid) {
      Alert.alert('خطا', validation.error || 'اطلاعات سفارش ناقص است.');
      return;
    }

    setSubmitting(true);
    const opId = `op_ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await apiClient.post(
        Endpoints.farmer.orders,
        {
          productId: selectedProduct,
          requestedWeight: numericWeight,
          targetDate,
          notes: notes.trim() || undefined,
          ...(farmerId ? { farmerId } : {}),
        },
        {
          headers: {
            'X-Operation-Id': opId,
          },
        }
      );

      Alert.alert('ثبت موفق', 'سفارش جیره شما ثبت شد و در کارتابل مدیریت قرار گرفت.');
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      Alert.alert('خطا در ثبت سفارش', String(errorMsg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>ثبت سفارش جیره خوراک طیور</Text>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Product Selection */}
            <Text style={styles.label}>نوع جیره / محصول دان:</Text>
            {loadingProducts ? (
              <ActivityIndicator size="small" color="#059669" style={{ marginVertical: 12 }} />
            ) : products.length === 0 ? (
              <Text style={{ fontFamily: 'Vazirmatn_400Regular', fontSize: 12, color: '#ef4444', textAlign: 'right', marginVertical: 8 }}>
                هیچ محصول دان فعالی در سیستم یافت نشد.
              </Text>
            ) : (
              <View style={styles.productPickerGrid}>
                {products.map((prod) => {
                  const isSelected = selectedProduct === prod.id;
                  return (
                    <TouchableOpacity
                      key={prod.id}
                      style={[styles.productPill, isSelected && styles.productPillActive]}
                      onPress={() => setSelectedProduct(prod.id)}
                    >
                      <Text
                        style={[styles.productText, isSelected && styles.productTextActive]}
                      >
                        {prod.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Requested Weight */}
            <Text style={styles.label}>وزن درخواستی (کیلوگرم):</Text>
            <TextInput
              style={styles.input}
              value={weightKg}
              onChangeText={(txt) => setWeightKg(txt.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              placeholder="مثال: 12000"
            />
            {weightKg ? (
              <Text style={styles.weightPreview}>
                معادل:{' '}
                {toPersianDigits(
                  formatNumberWithCommas(parseFloat(weightKg) || 0)
                )}{' '}
                کیلوگرم ({toPersianDigits(((parseFloat(weightKg) || 0) / 1000).toFixed(1))} تن)
              </Text>
            ) : null}

            {/* Target Delivery Date */}
            <Text style={styles.label}>تاریخ پیشنهادی تخلیه:</Text>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setDateModalVisible(true)}
            >
              <Text style={styles.dateText}>{toPersianDigits(targetDate)}</Text>
              <Text style={styles.dateIconText}>تقویم شمسی</Text>
            </TouchableOpacity>

            {/* Notes */}
            <Text style={styles.label}>یادداشت تکمیلی (اختیاری):</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="توضیحات در خصوص زمان تخلیه، نوع کیسه یا تخلیه فله..."
              multiline
              numberOfLines={3}
            />
          </ScrollView>

          {/* Action Buttons */}
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
                <Text style={styles.submitText}>ثبت و ارسال سفارش</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <PersianDatePickerModal
        visible={dateModalVisible}
        onClose={() => setDateModalVisible(false)}
        initialDate={targetDate}
        onSelect={(date) => setTargetDate(date)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
  },
  title: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 16,
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  formScroll: {
    marginBottom: 14,
  },
  label: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#334155',
    textAlign: 'right',
    marginTop: 10,
    marginBottom: 6,
  },
  productPickerGrid: {
    gap: 6,
  },
  productPill: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  productPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  productText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 13,
    color: '#334155',
    textAlign: 'right',
  },
  productTextActive: {
    color: '#ffffff',
    fontFamily: 'Vazirmatn_500Medium',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    textAlign: 'right',
  },
  weightPreview: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#059669',
    textAlign: 'right',
    marginTop: 4,
  },
  dateSelector: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
  },
  dateText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#0f172a',
  },
  dateIconText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#059669',
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#64748b',
  },
  submitBtn: {
    flex: 2,
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 13,
    color: '#ffffff',
  },
});

export default OrderFeedModal;
