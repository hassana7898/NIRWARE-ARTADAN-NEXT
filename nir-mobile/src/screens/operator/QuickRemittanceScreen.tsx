import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { PersianDatePickerModal } from '../../components/common/PersianDatePickerModal';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import {
  validateQuickRemittance,
  buildQuickRemittancePayload,
  type QuickRemittanceInput,
} from '../../features/operator/quickRemittance';
import { toPersianDigits, formatNumberWithCommas } from '../../utils/formatters';
import { jalaliText } from '../../utils/jalali';

interface ProductItem {
  id: string;
  name: string;
  unit?: string;
  type?: string;
}

export function QuickRemittanceScreen() {
  const [type, setType] = useState<'exit' | 'entry'>('exit');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [scaleWeight, setScaleWeight] = useState<string>('');
  const [billWeight, setBillWeight] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [date, setDate] = useState<string>(jalaliText(new Date()));
  const [datePickerVisible, setDatePickerVisible] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Fetch real finished goods for exit or all products from settings
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['operator-products', type],
    queryFn: async () => {
      if (type === 'exit') {
        const res = await apiClient.get(Endpoints.farmer.products);
        return (res.data?.products as ProductItem[]) || [];
      } else {
        const res = await apiClient.get(Endpoints.web.farmers); // fallback to general products if needed
        return [];
      }
    },
  });

  // Fetch settings products as general catalogue
  const { data: allProductsData } = useQuery({
    queryKey: ['settings-all-products'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(Endpoints.web.settings);
        const prods = (res.data?.settings?.products as any[]) || [];
        return prods.filter((p: any) => !p.isDeleted);
      } catch {
        return [];
      }
    },
  });

  const isFinishedType = (t: unknown) =>
    t === 'finishedGood' || t === 'finished' || t === 'finished_good';

  const availableProducts: ProductItem[] =
    type === 'exit'
      ? productsData && productsData.length > 0
        ? productsData
        : (allProductsData || []).filter((p: any) => isFinishedType(p.type))
      : (allProductsData || []).filter((p: any) => !isFinishedType(p.type));

  // Pre-select first product when list arrives
  React.useEffect(() => {
    if (availableProducts.length > 0 && !selectedProductId) {
      setSelectedProductId(availableProducts[0].id);
    }
  }, [availableProducts, selectedProductId]);

  const selectedProduct = availableProducts.find((p) => p.id === selectedProductId);

  const handleSubmit = async () => {
    const numericScale = parseFloat(scaleWeight.replace(/[^\d.]/g, ''));
    const numericBill = billWeight ? parseFloat(billWeight.replace(/[^\d.]/g, '')) : undefined;

    const input: QuickRemittanceInput = {
      type,
      date,
      productId: selectedProductId,
      productName: selectedProduct?.name,
      scaleWeight: numericScale,
      billWeight: numericBill,
      driverName: driverName.trim() || undefined,
      driverPhone: driverPhone.trim() || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      farmerId: type === 'exit' ? undefined : undefined,
      sellerName: type === 'entry' ? partyName.trim() : undefined,
      notes: notes.trim() || (type === 'exit' ? partyName.trim() : undefined),
    };

    const validation = validateQuickRemittance(input);
    if (!validation.valid) {
      Alert.alert('خطا در اعتبارسنجی', validation.error || 'اطلاعات فرم ناقص است.');
      return;
    }

    setSubmitting(true);
    const opId = `op_rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const payload = buildQuickRemittancePayload(input);
      const res = await apiClient.post(Endpoints.operator.createRemittance, payload, {
        headers: {
          'X-Operation-Id': opId,
        },
      });

      const invId = res.data?.data?.id || res.data?.id || 'ثبت شد';
      Alert.alert(
        'ثبت موفق حواله',
        `حواله ${type === 'exit' ? 'خروجی' : 'ورودی'} با شناسه ${invId} در سیستم ثبت شد.`
      );

      // Reset form
      setScaleWeight('');
      setBillWeight('');
      setDriverName('');
      setDriverPhone('');
      setInvoiceNumber('');
      setPartyName('');
      setNotes('');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      Alert.alert('خطا در ثبت حواله', String(errorMsg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      title="ورود سریع حواله"
      subtitle="ثبت لحظه‌ای حواله ورود یا خروج در محل باسکول"
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        {/* Type Toggle: Entry vs Exit */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, type === 'exit' && styles.toggleBtnActiveExit]}
            onPress={() => {
              setType('exit');
              setSelectedProductId('');
            }}
          >
            <Text style={[styles.toggleText, type === 'exit' && styles.toggleTextActive]}>
              حواله خروج (فروش دان)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, type === 'entry' && styles.toggleBtnActiveEntry]}
            onPress={() => {
              setType('entry');
              setSelectedProductId('');
            }}
          >
            <Text style={[styles.toggleText, type === 'entry' && styles.toggleTextActive]}>
              حواله ورود (خرید مواد اولیه)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date Selector */}
        <Text style={styles.fieldLabel}>تاریخ حواله:</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setDatePickerVisible(true)}>
          <Text style={styles.dateVal}>{toPersianDigits(date)}</Text>
          <Text style={styles.dateHint}>تغییر تاریخ شمسی</Text>
        </TouchableOpacity>

        {/* Product Picker */}
        <Text style={styles.fieldLabel}>
          {type === 'exit' ? 'نوع محصول دان خروجی:' : 'ماده اولیه ورودی:'}
        </Text>
        {loadingProducts ? (
          <ActivityIndicator size="small" color="#0284c7" />
        ) : availableProducts.length === 0 ? (
          <Text style={styles.emptyProductText}>هیچ کالای فعالی یافت نشد.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.productScroll}>
            {availableProducts.map((p) => {
              const selected = selectedProductId === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.productChip, selected && styles.productChipActive]}
                  onPress={() => setSelectedProductId(p.id)}
                >
                  <Text style={[styles.productChipText, selected && styles.productChipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Scale Weight */}
        <Text style={styles.fieldLabel}>وزن خالص باسکول (کیلوگرم): *</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="مثال: 15400"
          value={scaleWeight}
          onChangeText={(txt) => setScaleWeight(txt.replace(/[^\d]/g, ''))}
          textAlign="right"
        />
        {scaleWeight ? (
          <Text style={styles.weightHelper}>
            {toPersianDigits(formatNumberWithCommas(parseFloat(scaleWeight) || 0))} کیلوگرم (
            {toPersianDigits(((parseFloat(scaleWeight) || 0) / 1000).toFixed(2))} تن)
          </Text>
        ) : null}

        {/* Bill Weight (optional) */}
        <Text style={styles.fieldLabel}>وزن بارنامه مبدأ (کیلوگرم - اختیاری):</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="مثال: 15350"
          value={billWeight}
          onChangeText={(txt) => setBillWeight(txt.replace(/[^\d]/g, ''))}
          textAlign="right"
        />

        {/* Customer / Farmer or Supplier */}
        <Text style={styles.fieldLabel}>
          {type === 'exit' ? 'نام مرغدار / مشتری مقصد:' : 'نام فروشنده / تأمین‌کننده:'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={type === 'exit' ? 'مثال: مرغداری نوروزی' : 'مثال: شرکت غلات شمال'}
          value={partyName}
          onChangeText={setPartyName}
          textAlign="right"
        />

        {/* Driver Name & Phone */}
        <View style={styles.twoColRow}>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>نام راننده:</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: محمد احمدی"
              value={driverName}
              onChangeText={setDriverName}
              textAlign="right"
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>تلفن راننده:</Text>
            <TextInput
              style={styles.input}
              placeholder="۰۹۱۲..."
              keyboardType="phone-pad"
              value={driverPhone}
              onChangeText={setDriverPhone}
              textAlign="right"
            />
          </View>
        </View>

        {/* Invoice Number */}
        <Text style={styles.fieldLabel}>شماره حواله / شماره قبض:</Text>
        <TextInput
          style={styles.input}
          placeholder="مثال: ۱۴۰۵۰۲۳"
          value={invoiceNumber}
          onChangeText={setInvoiceNumber}
          textAlign="right"
        />

        {/* Notes */}
        <Text style={styles.fieldLabel}>توضیحات تکمیلی:</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="شماره بارنامه، مبدأ بارگیری، یا توضیحات..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
          textAlign="right"
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitBtnText}>ثبت رسمی حواله در سامانه</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <PersianDatePickerModal
        visible={datePickerVisible}
        initialDate={date}
        onSelect={(selected) => {
          setDate(selected);
          setDatePickerVisible(false);
        }}
        onClose={() => setDatePickerVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  toggleRow: {
    flexDirection: 'row-reverse',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleBtnActiveExit: {
    backgroundColor: '#0284c7',
  },
  toggleBtnActiveEntry: {
    backgroundColor: '#0d9488',
  },
  toggleText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#475569',
  },
  toggleTextActive: {
    color: '#ffffff',
    fontFamily: 'Vazirmatn_700Bold',
  },
  fieldLabel: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    textAlign: 'right',
  },
  dateBtn: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  dateVal: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#0f172a',
  },
  dateHint: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#0284c7',
  },
  productScroll: {
    marginBottom: 14,
  },
  productChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 8,
  },
  productChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  productChipText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#475569',
  },
  productChipTextActive: {
    color: '#0284c7',
    fontFamily: 'Vazirmatn_700Bold',
  },
  emptyProductText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 14,
  },
  weightHelper: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#059669',
    textAlign: 'right',
    marginTop: -10,
    marginBottom: 12,
  },
  twoColRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 15,
    color: '#ffffff',
  },
});

export default QuickRemittanceScreen;
