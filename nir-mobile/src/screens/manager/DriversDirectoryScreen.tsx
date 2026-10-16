import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { Icon } from '../../components/common/Icon';
import { palette } from '../../theme/tokens';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { extractApiErrorMessage } from '../../api/errors';
import { useAuth } from '../../hooks/useAuth';
import { toPersianDigits } from '../../utils/formatters';
import {
  DRIVER_NAME_LOCKED_MESSAGE,
  buildDriverPayload,
  canCreateDriver,
  canDeactivateDriver,
  driversQueryFor,
  filterDrivers,
  isDriverActive,
  normalizeDriverRows,
  validateDriverInput,
  type DriverRow,
} from '../../features/manager/driverDirectory';

type StatusFilter = 'active' | 'inactive' | 'all';
const DRIVERS_QUERY_KEY = ['manager', 'drivers'] as const;
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'فعال' },
  { value: 'inactive', label: 'غیرفعال' },
  { value: 'all', label: 'همه' },
];

interface FormState {
  originalName: string | null;
  name: string;
  phone: string;
  iban: string;
}

export function DriversDirectoryScreen({ navigation }: any) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = canCreateDriver(role);
  const canDeactivate = canDeactivateDriver(role);

  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);

  const driversQuery = useQuery({
    queryKey: [...DRIVERS_QUERY_KEY, status],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.web.drivers, { params: driversQueryFor(status) });
      return normalizeDriverRows(res.data?.data);
    },
  });

  const drivers = driversQuery.data ?? [];
  const visibleDrivers = useMemo(() => filterDrivers(drivers, search), [drivers, search]);

  const refreshDrivers = () => queryClient.invalidateQueries({ queryKey: DRIVERS_QUERY_KEY });

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiClient.post(Endpoints.web.drivers, payload);
      return res.data;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.delete(Endpoints.web.driverByName(name));
      return res.data;
    },
  });

  const busy = saveMutation.isPending || deactivateMutation.isPending;

  const openCreate = () => setForm({ originalName: null, name: '', phone: '', iban: '' });
  const openEdit = (driver: DriverRow) =>
    setForm({
      originalName: driver.name,
      name: driver.name,
      phone: driver.phone || '',
      iban: driver.iban || '',
    });

  const submitForm = () => {
    if (!form || busy) return;
    const isEdit = !!form.originalName;
    const validation = validateDriverInput({ ...form, isEdit });
    if (!validation.valid) {
      Alert.alert('اطلاعات ناقص', Object.values(validation.errors)[0] || 'لطفاً فیلدها را بررسی کنید.');
      return;
    }
    saveMutation.mutate(buildDriverPayload(form), {
      onSuccess: async () => {
        await refreshDrivers();
        setForm(null);
        Alert.alert('موفقیت', 'اطلاعات راننده ذخیره شد.');
      },
      onError: (error) => Alert.alert('خطا', extractApiErrorMessage(error, 'ذخیره اطلاعات راننده ناموفق بود.')),
    });
  };

  const confirmDeactivate = (driver: DriverRow) => {
    if (busy) return;
    Alert.alert(
      'غیرفعال‌سازی راننده',
      `راننده «${driver.name}» از فهرست فعال حذف می‌شود اما پرونده و تمام حواله‌های گذشته او حفظ می‌شوند. ادامه می‌دهید؟`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'غیرفعال کن',
          style: 'destructive',
          onPress: () =>
            deactivateMutation.mutate(driver.name, {
              onSuccess: async () => {
                await refreshDrivers();
                setForm(null);
                Alert.alert('موفقیت', 'راننده غیرفعال شد. سوابق حواله‌ها دست‌نخورده باقی ماند.');
              },
              onError: (error) =>
                Alert.alert('خطا', extractApiErrorMessage(error, 'غیرفعال‌سازی راننده ناموفق بود.')),
            }),
        },
      ]
    );
  };

  const reactivate = (driver: DriverRow) => {
    if (busy) return;
    Alert.alert(
      'فعال‌سازی مجدد',
      `راننده «${driver.name}» دوباره فعال شود؟ پروندهٔ قبلی او با همان نام بازیابی می‌شود.`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'فعال کن',
          style: 'default',
          onPress: () =>
            saveMutation.mutate(buildDriverPayload({ name: driver.name, phone: driver.phone, iban: driver.iban }), {
              onSuccess: async () => {
                await refreshDrivers();
                setForm(null);
                Alert.alert('موفقیت', 'راننده فعال شد.');
              },
              onError: (error) =>
                Alert.alert('خطا', extractApiErrorMessage(error, 'فعال‌سازی راننده ناموفق بود.')),
            }),
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: DriverRow }) => {
    const active = isDriverActive(item);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, active ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
            <Text style={[styles.statusBadgeText, !active && styles.statusBadgeTextInactive]}>
              {active ? 'فعال' : 'غیرفعال'}
            </Text>
          </View>
          <Text style={styles.driverName}>{item.name}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>شماره تماس:</Text>
          <Text style={styles.infoValue}>{item.phone ? toPersianDigits(item.phone) : 'ثبت نشده'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>شماره شبا:</Text>
          <Text style={styles.infoValue}>{item.iban || 'ثبت نشده'}</Text>
        </View>

        <View style={styles.actionsRow}>
          {canCreate ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)} disabled={busy}>
              <Icon name="pencil" size={14} color={palette.primary} decorative />
              <Text style={styles.actionBtnText}>ویرایش</Text>
            </TouchableOpacity>
          ) : null}

          {active && canDeactivate ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDanger]}
              onPress={() => confirmDeactivate(item)}
              disabled={busy}
            >
              <Text style={styles.actionBtnDangerText}>غیرفعال‌سازی</Text>
            </TouchableOpacity>
          ) : null}

          {!active && canCreate ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSuccess]}
              onPress={() => reactivate(item)}
              disabled={busy}
            >
              <Icon name="check" size={14} color="#047857" decorative />
              <Text style={styles.actionBtnSuccessText}>فعال‌سازی</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const isEdit = !!form?.originalName;

  return (
    <ScreenContainer
      scrollable={false}
      showBack
      onBack={() => navigation?.goBack?.()}
      title="مدیریت رانندگان"
      subtitle="پروندهٔ رانندگان، شماره تماس و شبا — بدون حذف سوابق"
    >
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="جستجوی نام راننده یا شماره تماس..."
          placeholderTextColor="#94a3b8"
        />
        {canCreate ? (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} disabled={busy}>
            <Icon name="truck" size={16} color={palette.inkInverse} decorative />
            <Text style={styles.addBtnText}>راننده جدید</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabRow}>
        {STATUS_OPTIONS.map((option) => {
          const active = option.value === status;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setStatus(option.value)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {driversQuery.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت رانندگان...</Text>
        </View>
      ) : driversQuery.isError ? (
        <ScreenState
          isError
          error={driversQuery.error}
          onRetry={() => void driversQuery.refetch()}
          messages={{ error: 'دریافت فهرست رانندگان ناموفق بود.' }}
        />
      ) : (
        <FlatList
          data={visibleDrivers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={driversQuery.isRefetching} onRefresh={() => void driversQuery.refetch()} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {status === 'inactive'
                  ? 'رانندهٔ غیرفعالی ثبت نشده است.'
                  : 'راننده‌ای با این مشخصات یافت نشد.'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{isEdit ? 'ویرایش راننده' : 'افزودن راننده جدید'}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>نام راننده:</Text>
              <TextInput
                style={[styles.input, isEdit && styles.inputDisabled]}
                value={form?.name ?? ''}
                editable={!isEdit}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, name: text } : prev))}
                placeholder="نام و نام خانوادگی"
              />
              {isEdit ? <Text style={styles.hintText}>{DRIVER_NAME_LOCKED_MESSAGE}</Text> : null}

              <Text style={styles.fieldLabel}>شماره تماس:</Text>
              <TextInput
                style={styles.input}
                value={form?.phone ?? ''}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, phone: text } : prev))}
                keyboardType="phone-pad"
                placeholder="09123456789"
              />

              <Text style={styles.fieldLabel}>شماره شبا (اختیاری):</Text>
              <TextInput
                style={styles.input}
                value={form?.iban ?? ''}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, iban: text } : prev))}
                autoCapitalize="characters"
                placeholder="IR000000000000000000000000"
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setForm(null)} disabled={busy}>
                <Text style={styles.cancelText}>انصراف</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, busy && styles.btnDisabled]}
                onPress={submitForm}
                disabled={busy}
              >
                <Text style={styles.saveText}>{isEdit ? 'ذخیره تغییرات' : 'افزودن راننده'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 8, alignItems: 'center' },
  searchInput: {
    flex: 1,
    fontFamily: 'Vazirmatn_400Regular',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    textAlign: 'right',
  },
  addBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addBtnText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#ffffff' },
  tabRow: {
    flexDirection: 'row-reverse',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    marginBottom: 8,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#059669' },
  tabText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#334155' },
  tabTextActive: { color: '#ffffff' },
  listContent: { paddingBottom: 24, gap: 10 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  driverName: { fontFamily: 'Vazirmatn_700Bold', fontSize: 15, color: '#0f172a', flexShrink: 1, textAlign: 'right' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeActive: { backgroundColor: '#dcfce7' },
  statusBadgeInactive: { backgroundColor: '#e2e8f0' },
  statusBadgeText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 11, color: '#15803d' },
  statusBadgeTextInactive: { color: '#475569' },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  infoLabel: { fontFamily: 'Vazirmatn_400Regular', fontSize: 12, color: '#64748b' },
  infoValue: { fontFamily: 'Vazirmatn_500Medium', fontSize: 13, color: '#1e293b', textAlign: 'right', flexShrink: 1 },
  actionsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBtnText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#047857' },
  actionBtnDanger: { backgroundColor: '#fef2f2' },
  actionBtnDangerText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#b91c1c' },
  actionBtnSuccess: { backgroundColor: '#ecfdf5' },
  actionBtnSuccessText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#047857' },
  loadingBox: { padding: 40, alignItems: 'center' },
  loadingText: { fontFamily: 'Vazirmatn_500Medium', fontSize: 13, color: '#64748b', marginTop: 8 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Vazirmatn_400Regular', fontSize: 13, color: '#94a3b8' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, maxHeight: '88%' },
  modalTitle: { fontFamily: 'Vazirmatn_700Bold', fontSize: 16, color: '#0f172a', textAlign: 'right', marginBottom: 10 },
  fieldLabel: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#334155',
    textAlign: 'right',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    fontFamily: 'Vazirmatn_400Regular',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    textAlign: 'right',
  },
  inputDisabled: { backgroundColor: '#e2e8f0', color: '#64748b' },
  hintText: { fontFamily: 'Vazirmatn_400Regular', fontSize: 10, color: '#b45309', textAlign: 'right', marginTop: 4 },
  modalBtnRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  cancelText: { fontFamily: 'Vazirmatn_500Medium', fontSize: 13, color: '#64748b' },
  saveBtn: { flex: 2, backgroundColor: '#059669', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 13, color: '#ffffff' },
  btnDisabled: { opacity: 0.6 },
});

export default DriversDirectoryScreen;
