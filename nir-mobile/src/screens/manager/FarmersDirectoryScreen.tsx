import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal,
  ScrollView,
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
import {
  buildFarmerPayload,
  canCreateFarmer,
  canDeactivateFarmer,
  canEditFarmer,
  canRestoreFarmer,
  farmersQueryFor,
  validateFarmerInput,
} from '../../features/manager/farmerDirectory';
import {
  formatNumberWithCommas,
  toPersianDigits,
  formatJalaliDate,
} from '../../utils/formatters';
import { dateDayNumber, jalaliText } from '../../utils/jalali';

export function FarmersDirectoryScreen({ navigation }: any) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = canCreateFarmer(role);
  const canEdit = canEditFarmer(role);
  const canDeactivate = canDeactivateFarmer(role);
  const canRestore = canRestoreFarmer(role);

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active_brood' | 'has_brood'>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active');
  const [form, setForm] = useState<{ id: string | null; name: string; phone: string } | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['manager', 'farmers-directory', statusFilter],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.web.farmers, { params: farmersQueryFor(statusFilter) });
      return (res.data?.data || []) as any[];
    },
  });

  const refreshFarmers = () => queryClient.invalidateQueries({ queryKey: ['manager', 'farmers-directory'] });

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string | null; payload: Record<string, unknown> }) => {
      const res = id
        ? await apiClient.put(Endpoints.web.farmerById(id), payload)
        : await apiClient.post(Endpoints.web.farmers, payload);
      return res.data;
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(Endpoints.web.farmerById(id));
      return res.data;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.put(Endpoints.web.farmerRestore(id), {});
      return res.data;
    },
  });

  const busy = saveMutation.isPending || deactivateMutation.isPending || restoreMutation.isPending;

  const openCreate = () => setForm({ id: null, name: '', phone: '' });
  const openEdit = (farmer: any) =>
    setForm({ id: farmer.id, name: String(farmer.name || ''), phone: String(farmer.phone || '') });

  const submitForm = () => {
    if (!form || busy) return;
    const validation = validateFarmerInput({ name: form.name, phone: form.phone });
    if (!validation.valid) {
      Alert.alert('اطلاعات ناقص', Object.values(validation.errors)[0] || 'لطفاً فیلدها را بررسی کنید.');
      return;
    }
    saveMutation.mutate(
      { id: form.id, payload: buildFarmerPayload({ id: form.id, name: form.name, phone: form.phone }) },
      {
        onSuccess: async (result: any) => {
          await refreshFarmers();
          const reused = !!result?.data?.reused;
          setForm(null);
          Alert.alert(
            'موفقیت',
            reused
              ? 'مرغدار تکراری بود؛ اطلاعات در پروندهٔ موجود ادغام شد.'
              : form.id
              ? 'اطلاعات مرغدار ذخیره شد.'
              : 'مرغدار جدید ثبت شد.'
          );
        },
        onError: (err) => Alert.alert('خطا', extractApiErrorMessage(err, 'ذخیره اطلاعات مرغدار ناموفق بود.')),
      }
    );
  };

  const confirmDeactivate = (farmer: any) => {
    if (busy) return;
    Alert.alert(
      'غیرفعال‌سازی مرغدار',
      `مرغدار «${farmer.name}» از فهرست فعال خارج می‌شود. سوابق دوره‌ها و حواله‌ها حفظ می‌شوند و بعداً قابل بازیابی است. ادامه می‌دهید؟`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'غیرفعال کن',
          style: 'destructive',
          onPress: () =>
            deactivateMutation.mutate(farmer.id, {
              onSuccess: async () => {
                await refreshFarmers();
                setForm(null);
                Alert.alert('موفقیت', 'مرغدار غیرفعال شد.');
              },
              onError: (err) =>
                Alert.alert('خطا', extractApiErrorMessage(err, 'غیرفعال‌سازی مرغدار ناموفق بود.')),
            }),
        },
      ]
    );
  };

  const confirmRestore = (farmer: any) => {
    if (busy) return;
    Alert.alert('فعال‌سازی مجدد', `مرغدار «${farmer.name}» دوباره فعال شود؟`, [
      { text: 'انصراف', style: 'cancel' },
      {
        text: 'فعال کن',
        onPress: () =>
          restoreMutation.mutate(farmer.id, {
            onSuccess: async () => {
              await refreshFarmers();
              setForm(null);
              Alert.alert('موفقیت', 'مرغدار فعال شد.');
            },
            onError: (err) =>
              Alert.alert('خطا', extractApiErrorMessage(err, 'فعال‌سازی مرغدار ناموفق بود.')),
          }),
      },
    ]);
  };

  const todayJalali = jalaliText(new Date());
  const todayDayNum = dateDayNumber(todayJalali) || 0;

  const enrichedFarmers = (data || []).map((f: any) => {
    const rawBroods = Array.isArray(f.broods) ? f.broods : [];
    const nonDeletedBroods = rawBroods
      .filter((b: any) => b && !b.deletedAt)
      .map((b: any) => {
        const isActive = !b.endDate && !b.isArchived;
        const startDay = dateDayNumber(b.startDate);
        const endDay = b.endDate ? dateDayNumber(b.endDate) : todayDayNum;
        const ageDays =
          startDay !== null && endDay !== null ? Math.max(0, endDay - startDay) + 1 : Number(b.ageDays || 0);
        const chickCount = Number(b.chickCount || b.flockCount || 0);
        return {
          ...b,
          isActive,
          ageDays,
          chickCount,
          startDateJalali: jalaliText(b.startDate),
          endDateJalali: b.endDate ? jalaliText(b.endDate) : null,
        };
      })
      .sort((a: any, b: any) => (dateDayNumber(b.startDate) || 0) - (dateDayNumber(a.startDate) || 0));

    const activeBroods = nonDeletedBroods.filter((b: any) => b.isActive);
    const archivedBroods = nonDeletedBroods.filter((b: any) => !b.isActive);

    return {
      ...f,
      allBroods: nonDeletedBroods,
      activeBroods,
      archivedBroods,
    };
  });

  // Sort: farmers with active broods first, then farmers with archived broods, then alphabetically
  enrichedFarmers.sort((a, b) => {
    if (b.activeBroods.length !== a.activeBroods.length) {
      return b.activeBroods.length - a.activeBroods.length;
    }
    if (b.allBroods.length !== a.allBroods.length) {
      return b.allBroods.length - a.allBroods.length;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
  });

  const filteredFarmers = enrichedFarmers.filter((f: any) => {
    if (filterMode === 'active_brood' && f.activeBroods.length === 0) return false;
    if (filterMode === 'has_brood' && f.allBroods.length === 0) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const name = (f.name || '').toLowerCase();
    const phone = (f.phone || '').toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  const totalActiveBroodsCount = enrichedFarmers.reduce(
    (acc, f) => acc + f.activeBroods.length,
    0
  );
  const totalActiveChicksCount = enrichedFarmers.reduce(
    (acc, f) =>
      acc + f.activeBroods.reduce((s: number, b: any) => s + (b.chickCount || 0), 0),
    0
  );

  const handleCall = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const openFarmerDashboard = (farmer: any, broodId?: string) => {
    navigation.navigate('ManagerFarmerDetail', {
      farmerId: farmer.id,
      farmerName: farmer.name,
      ...(broodId ? { broodId } : {}),
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const allBroods = item.allBroods || [];
    const activeCount = item.activeBroods?.length || 0;

    return (
      <View style={styles.card}>
        {/* Farmer Header */}
        <View style={styles.cardHeader}>
          <View style={styles.headerActions}>
            {item.phone ? (
              <TouchableOpacity style={styles.callBtn} onPress={() => handleCall(item.phone)}>
                <Text style={styles.callBtnText}>📞 {toPersianDigits(item.phone)}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.noPhoneTag}>بدون تلفن</Text>
            )}
          </View>

          <View style={styles.farmerTitleBox}>
            <Text style={styles.farmerName}>{item.name}</Text>
            <Text style={styles.farmerSubMeta}>
              {activeCount > 0
                ? `● ${toPersianDigits(activeCount)} دوره فعال جوجه‌ریزی`
                : allBroods.length > 0
                ? `${toPersianDigits(allBroods.length)} دوره خاتمه‌یافته`
                : 'بدون دوره ثبت‌شده'}
            </Text>
          </View>
        </View>

        {/* Brood Periods section */}
        <View style={styles.broodsSection}>
          <View style={styles.broodsSectionHeader}>
            <TouchableOpacity
              style={styles.openDashboardBtn}
              onPress={() => openFarmerDashboard(item)}
            >
              <Icon name="farmerDashboard" size={12} color={palette.inkInverse} decorative />
              <Text style={styles.openDashboardBtnText}>مشاهده کارنامه و دوره‌ها ‹</Text>
            </TouchableOpacity>
            <Text style={styles.broodsTitle}>
              دوره‌های پرورشی ({toPersianDigits(allBroods.length)}):
            </Text>
          </View>

          {allBroods.length > 0 ? (
            allBroods.map((b: any) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.broodItem, b.isActive && styles.broodItemActive]}
                onPress={() => openFarmerDashboard(item, b.id)}
                activeOpacity={0.8}
              >
                <View style={styles.broodHeader}>
                  <View
                    style={[
                      styles.broodAgeBadge,
                      !b.isActive && styles.broodArchivedBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.broodAgeBadgeText,
                        !b.isActive && styles.broodArchivedBadgeText,
                      ]}
                    >
                      {b.isActive
                        ? `فعال — روز ${toPersianDigits(b.ageDays)}`
                        : `بایگانی (${toPersianDigits(b.ageDays)} روز)`}
                    </Text>
                  </View>
                  <Text style={styles.broodName}>
                    {b.name || `دوره جوجه‌ریزی ${toPersianDigits(b.startDateJalali)}`}
                  </Text>
                </View>
                <View style={styles.broodStatsRow}>
                  <Text style={styles.broodStatText}>
                    🐤 ظرفیت: {toPersianDigits(formatNumberWithCommas(b.chickCount || 0))} قطعه
                  </Text>
                  <View style={styles.broodStatTextRow}>
                    <Icon name="calendar" size={12} color={palette.inkMuted} decorative />
                    <Text style={styles.broodStatText}>
                      شروع: {toPersianDigits(b.startDateJalali || formatJalaliDate(b.startDate))}
                      {b.endDateJalali ? ` | پایان: ${toPersianDigits(b.endDateJalali)}` : ''}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <TouchableOpacity
              style={styles.noBroodBox}
              onPress={() => openFarmerDashboard(item)}
            >
              <Text style={styles.noBroodText}>
                دوره پرورشی ثبت نشده است — برای تعریف دوره جدید یا مشاهده حواله‌ها ضربه بزنید.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Phase 3 management actions. Role-gated exactly like the routes: edit = ADMIN|MANAGER,
            deactivate = ADMIN, restore = ADMIN|MANAGER. The server re-checks every call. */}
        {canEdit || (statusFilter === 'inactive' ? canRestore : canDeactivate) ? (
          <View style={styles.cardActionsRow}>
            {canEdit ? (
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={() => openEdit(item)}
                disabled={busy}
              >
                <Icon name="pencil" size={13} color={palette.primary} decorative />
                <Text style={styles.cardActionBtnText}>ویرایش</Text>
              </TouchableOpacity>
            ) : null}

            {statusFilter === 'inactive'
              ? canRestore && (
                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.cardActionBtnSuccess]}
                    onPress={() => confirmRestore(item)}
                    disabled={busy}
                  >
                    <Icon name="check" size={13} color="#047857" decorative />
                    <Text style={styles.cardActionBtnSuccessText}>فعال‌سازی مجدد</Text>
                  </TouchableOpacity>
                )
              : canDeactivate && (
                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.cardActionBtnDanger]}
                    onPress={() => confirmDeactivate(item)}
                    disabled={busy}
                  >
                    <Text style={styles.cardActionBtnDangerText}>غیرفعال‌سازی</Text>
                  </TouchableOpacity>
                )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenContainer
      title="مرغداران و دوره‌های پرورش"
      subtitle="واحدهای پرورشی، دوره‌های فعال جوجه‌ریزی و کارنامه مصرف دان"
      scrollable={false}
      showBack={!!navigation?.canGoBack?.()}
      onBack={() => navigation?.goBack?.()}
    >
      {/* Top Summary Banner */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{toPersianDigits(enrichedFarmers.length)}</Text>
          <Text style={styles.summaryLbl}>کل مرغداران</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: '#059669' }]}>
            {toPersianDigits(totalActiveBroodsCount)}
          </Text>
          <Text style={styles.summaryLbl}>دوره فعال جاری</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: '#0284c7' }]}>
            {toPersianDigits(formatNumberWithCommas(totalActiveChicksCount))}
          </Text>
          <Text style={styles.summaryLbl}>قطعه جوجه فعال</Text>
        </View>
      </View>

      {/* Phase 3: active/inactive switch + create. Both are role-gated client-side and re-checked
          by the server (`requireRole`) on every call. */}
      <View style={styles.manageRow}>
        <View style={styles.statusToggle}>
          <TouchableOpacity
            style={[styles.statusOption, statusFilter === 'active' && styles.statusOptionActive]}
            onPress={() => setStatusFilter('active')}
          >
            <Text style={[styles.statusOptionText, statusFilter === 'active' && styles.statusOptionTextActive]}>
              فعال
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusOption, statusFilter === 'inactive' && styles.statusOptionActive]}
            onPress={() => setStatusFilter('inactive')}
          >
            <Text style={[styles.statusOptionText, statusFilter === 'inactive' && styles.statusOptionTextActive]}>
              غیرفعال
            </Text>
          </TouchableOpacity>
        </View>

        {canCreate ? (
          <TouchableOpacity style={styles.addFarmerBtn} onPress={openCreate} disabled={busy}>
            <Icon name="userRound" size={15} color={palette.inkInverse} decorative />
            <Text style={styles.addFarmerBtnText}>مرغدار جدید</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Search & Filter */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="جستجوی نام مرغدار یا شماره همراه..."
          placeholderTextColor="#94a3b8"
        />
        <View style={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'all' && styles.filterChipActive]}
            onPress={() => setFilterMode('all')}
          >
            <Text style={[styles.filterChipText, filterMode === 'all' && styles.filterChipTextActive]}>
              همه مرغداران ({toPersianDigits(enrichedFarmers.length)})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'active_brood' && styles.filterChipActive]}
            onPress={() => setFilterMode('active_brood')}
          >
            <Text style={[styles.filterChipText, filterMode === 'active_brood' && styles.filterChipTextActive]}>
              دارای دوره فعال ({toPersianDigits(enrichedFarmers.filter((f) => f.activeBroods.length > 0).length)})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'has_brood' && styles.filterChipActive]}
            onPress={() => setFilterMode('has_brood')}
          >
            <Text style={[styles.filterChipText, filterMode === 'has_brood' && styles.filterChipTextActive]}>
              دارای سابقه دوره ({toPersianDigits(enrichedFarmers.filter((f) => f.allBroods.length > 0).length)})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت لیست مرغداران و دوره‌ها...</Text>
        </View>
      ) : isError ? (
        <ScreenState
          isError
          error={error}
          onRetry={() => void refetch()}
          messages={{ error: 'دریافت فهرست مرغداران ناموفق بود.' }}
        />
      ) : (
        <FlatList
          data={filteredFarmers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>مرغداری با این مشخصات یافت نشد.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{form?.id ? 'ویرایش مرغدار' : 'ثبت مرغدار جدید'}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalFieldLabel}>نام مرغدار:</Text>
              <TextInput
                style={styles.modalInput}
                value={form?.name ?? ''}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, name: text } : prev))}
                placeholder="نام و نام خانوادگی مرغدار"
              />

              <Text style={styles.modalFieldLabel}>شماره تماس (اختیاری):</Text>
              <TextInput
                style={styles.modalInput}
                value={form?.phone ?? ''}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, phone: text } : prev))}
                keyboardType="phone-pad"
                placeholder="09123456789"
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setForm(null)} disabled={busy}>
                <Text style={styles.modalCancelText}>انصراف</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, busy && styles.modalBtnDisabled]}
                onPress={submitForm}
                disabled={busy}
              >
                <Text style={styles.modalSaveText}>{form?.id ? 'ذخیره تغییرات' : 'ثبت مرغدار'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  summaryBar: {
    flexDirection: 'row-reverse',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryVal: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },
  summaryLbl: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#334155',
  },
  searchBox: {
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
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
  filterChipsRow: {
    flexDirection: 'row-reverse',
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  filterChipText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#475569',
  },
  filterChipTextActive: {
    fontFamily: 'Vazirmatn_700Bold',
    color: '#0284c7',
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  farmerTitleBox: {
    flex: 1,
    alignItems: 'flex-end',
  },
  farmerName: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 15,
    color: '#0f172a',
  },
  farmerSubMeta: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
  },
  callBtn: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  callBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 11,
    color: '#16a34a',
  },
  noPhoneTag: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 10,
    color: '#94a3b8',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  broodsSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
  },
  broodsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  broodsTitle: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#334155',
    textAlign: 'right',
  },
  openDashboardBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  openDashboardBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 11,
    color: '#ffffff',
  },
  broodItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  broodItemActive: {
    borderColor: '#7dd3fc',
    backgroundColor: '#f0f9ff',
  },
  broodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  broodName: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#0f172a',
  },
  broodAgeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  broodArchivedBadge: {
    backgroundColor: '#e2e8f0',
  },
  broodAgeBadgeText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 10,
    color: '#15803d',
  },
  broodArchivedBadgeText: {
    color: '#475569',
  },
  broodStatsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  broodStatText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#475569',
  },
  broodStatTextRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  noBroodBox: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  noBroodText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 13,
    color: '#94a3b8',
  },
  /* ---- Phase 3: active/inactive switch + create/edit modal ---- */
  manageRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  statusToggle: {
    flexDirection: 'row-reverse',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusOptionActive: {
    backgroundColor: '#0284c7',
  },
  statusOptionText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#334155',
  },
  statusOptionTextActive: {
    color: '#ffffff',
  },
  addFarmerBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addFarmerBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#ffffff',
  },
  cardActionsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cardActionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cardActionBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#0369a1',
  },
  cardActionBtnDanger: {
    backgroundColor: '#fef2f2',
  },
  cardActionBtnDangerText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#b91c1c',
  },
  cardActionBtnSuccess: {
    backgroundColor: '#ecfdf5',
  },
  cardActionBtnSuccessText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#047857',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    maxHeight: '88%',
  },
  modalTitle: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 16,
    color: '#0f172a',
    textAlign: 'right',
    marginBottom: 10,
  },
  modalFieldLabel: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#334155',
    textAlign: 'right',
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
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
  modalBtnRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#64748b',
  },
  modalSaveBtn: {
    flex: 2,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalSaveText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 13,
    color: '#ffffff',
  },
  modalBtnDisabled: {
    opacity: 0.6,
  },
});

export default FarmersDirectoryScreen;
