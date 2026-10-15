import React, { useState } from 'react';
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
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { Icon } from '../../components/common/Icon';
import { palette } from '../../theme/tokens';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import {
  formatNumberWithCommas,
  toPersianDigits,
  formatJalaliDate,
} from '../../utils/formatters';
import { dateDayNumber, jalaliText } from '../../utils/jalali';

export function FarmersDirectoryScreen({ navigation }: any) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active_brood' | 'has_brood'>('all');

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['manager', 'farmers-directory'],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.web.farmers);
      return (res.data?.data || []) as any[];
    },
  });

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
});

export default FarmersDirectoryScreen;
