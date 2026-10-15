import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { palette } from '../../theme/tokens';
import { StatusBadge } from '../../components/common/StatusBadge';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import { formatWeight, toPersianDigits } from '../../utils/formatters';

interface WeighbridgeRecordItem {
  id: number;
  externalId: number;
  ticketNumber?: string;
  plateNumber?: string;
  driverName?: string;
  customerName?: string;
  goods?: string;
  grossWeight?: string | number;
  tareWeight?: string | number;
  netWeight?: string | number;
  weighTime?: string;
  direction: string;
  status: string;
  mappedRemittanceId?: string | null;
}

export function OperatorWeighbridgeScreen() {
  const [directionFilter, setDirectionFilter] = useState<'all' | 'entry' | 'exit'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'netted' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['operator-weighbridge', directionFilter],
    queryFn: async () => {
      const params: Record<string, any> = { limit: 100 };
      if (directionFilter !== 'all') params.direction = directionFilter;
      const res = await apiClient.get(Endpoints.operator.weighbridge, { params });
      return res.data;
    },
  });

  const records: WeighbridgeRecordItem[] = data?.records || [];

  const filteredRecords = records.filter((r) => {
    const isNetted = Number(r.netWeight) > 0;
    if (statusFilter === 'netted' && !isNetted) return false;
    if (statusFilter === 'pending' && isNetted) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        String(r.ticketNumber || r.externalId).includes(q) ||
        String(r.plateNumber || '').toLowerCase().includes(q) ||
        String(r.driverName || '').toLowerCase().includes(q) ||
        String(r.goods || '').toLowerCase().includes(q) ||
        String(r.customerName || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const renderTicketCard = ({ item }: { item: WeighbridgeRecordItem }) => {
    const isMapped = !!item.mappedRemittanceId;
    const netWeight = Number(item.netWeight) || 0;
    const isNetted = netWeight > 0;
    const isExit = item.direction === 'exit';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.ticketBox}>
            <Text style={styles.ticketLabel}>قبض:</Text>
            <Text style={styles.ticketNum}>
              {toPersianDigits(item.ticketNumber || item.externalId)}
            </Text>
            <View style={[styles.directionTag, isExit ? styles.dirExit : styles.dirEntry]}>
              <Text style={styles.dirText}>{isExit ? 'خروج' : 'ورود'}</Text>
            </View>
          </View>

          <View style={styles.statusBox}>
            {isMapped ? (
              <StatusBadge status="success" label="حواله دارد" size="sm" />
            ) : (
              <StatusBadge status="warning" label="بدون حواله" size="sm" />
            )}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>کالا / نهاده:</Text>
          <Text style={styles.value}>{item.goods || 'کالای نامشخص'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>{isExit ? 'مشتری / مرغدار:' : 'فروشنده / مبدأ:'}</Text>
          <Text style={styles.value}>{item.customerName || '—'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>راننده و خودرو:</Text>
          <Text style={styles.value}>
            {item.driverName || 'نامشخص'}{' '}
            {item.plateNumber ? `(پلاک: ${toPersianDigits(item.plateNumber)})` : ''}
          </Text>
        </View>

        {/* Weights */}
        <View style={styles.weightRow}>
          <View style={styles.weightCol}>
            <Text style={styles.weightLabel}>وزن خالص:</Text>
            <Text style={[styles.weightVal, isNetted ? styles.netDone : styles.netPending]}>
              {isNetted ? formatWeight(netWeight) : 'در انتظار خروج'}
            </Text>
          </View>

          <View style={styles.weightCol}>
            <Text style={styles.weightLabel}>پر / خالی:</Text>
            <Text style={styles.weightSub}>
              {toPersianDigits(Number(item.grossWeight || 0))} / {toPersianDigits(Number(item.tareWeight || 0))}
            </Text>
          </View>
        </View>

        {item.weighTime ? (
          <Text style={styles.timeText}>
            زمان توزین: {toPersianDigits(String(item.weighTime).slice(0, 16).replace('T', ' '))}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenContainer
      title="پایش قبوض باسکول"
      subtitle="رهگیری آنلاین توزین‌های ثبت‌شده در باسکول نگار کارخانه"
      scrollable={false}
      onRefresh={refetch}
      refreshing={isRefetching}
    >
      <View style={styles.filterSection}>
        {/* Direction Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, directionFilter === 'all' && styles.tabBtnActive]}
            onPress={() => setDirectionFilter('all')}
          >
            <Text style={[styles.tabText, directionFilter === 'all' && styles.tabTextActive]}>
              همه قبوض
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, directionFilter === 'exit' && styles.tabBtnActive]}
            onPress={() => setDirectionFilter('exit')}
          >
            <Text style={[styles.tabText, directionFilter === 'exit' && styles.tabTextActive]}>
              خروجی (فروش)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, directionFilter === 'entry' && styles.tabBtnActive]}
            onPress={() => setDirectionFilter('entry')}
          >
            <Text style={[styles.tabText, directionFilter === 'entry' && styles.tabTextActive]}>
              ورودی (خرید)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Status Chips */}
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'all' && styles.chipActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>
              همه وضعیت‌ها
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'netted' && styles.chipActive]}
            onPress={() => setStatusFilter('netted')}
          >
            <Text style={[styles.chipText, statusFilter === 'netted' && styles.chipTextActive]}>
              توزین کامل (خالص)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'pending' && styles.chipActive]}
            onPress={() => setStatusFilter('pending')}
          >
            <Text style={[styles.chipText, statusFilter === 'pending' && styles.chipTextActive]}>
              در انتظار توزین دوم
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          style={styles.searchInput}
          placeholder="جستجو در قبوض (شماره، پلاک، راننده، کالا)..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          textAlign="right"
        />
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت قبوض باسکول...</Text>
        </View>
      ) : isError ? (
        <ScreenState
          isError
          error={error}
          onRetry={() => void refetch()}
          messages={{ error: 'دریافت قبوض باسکول ناموفق بود.' }}
        />
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => String(item.id || item.externalId)}
          renderItem={renderTicketCard}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>قبضی با این مشخصات یافت نشد.</Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabRow: {
    flexDirection: 'row-reverse',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0284c7',
    fontFamily: 'Vazirmatn_700Bold',
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  chipText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#64748b',
  },
  chipTextActive: {
    color: '#0284c7',
    fontFamily: 'Vazirmatn_700Bold',
  },
  searchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 13,
    color: '#64748b',
    marginTop: 10,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  ticketBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  ticketLabel: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#64748b',
  },
  ticketNum: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 15,
    color: '#0f172a',
  },
  directionTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dirExit: {
    backgroundColor: '#e0f2fe',
  },
  dirEntry: {
    backgroundColor: '#ccfbf1',
  },
  dirText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 10,
    color: '#0369a1',
  },
  statusBox: {
    flexDirection: 'row-reverse',
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#64748b',
  },
  value: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#1e293b',
  },
  weightRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  weightCol: {
    alignItems: 'flex-end',
  },
  weightLabel: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  weightVal: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
  },
  netDone: {
    color: '#059669',
  },
  netPending: {
    color: '#d97706',
    fontSize: 12,
  },
  weightSub: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#475569',
  },
  timeText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'left',
    marginTop: 6,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 14,
    color: '#94a3b8',
  },
});

export default OperatorWeighbridgeScreen;
