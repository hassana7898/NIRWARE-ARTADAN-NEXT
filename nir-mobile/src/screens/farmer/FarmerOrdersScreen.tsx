import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { palette } from '../../theme/tokens';
import { StatusBadge } from '../../components/common/StatusBadge';
import { OrderFeedModal } from './OrderFeedModal';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';
import {
  orderStatusLabel,
  orderStatusVariant,
  normalizeOrderRow,
  type FarmerOrder,
  type OrderStatus,
} from '../../features/farmer/farmerOrders';
import { formatWeight, toPersianDigits, formatJalaliDate } from '../../utils/formatters';

export function FarmerOrdersScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['farmer-orders', statusFilter],
    queryFn: async () => {
      const params: Record<string, any> = { limit: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await apiClient.get(Endpoints.farmer.orders, { params });
      return res.data;
    },
  });

  const rawOrders = data?.orders || [];
  const orders: FarmerOrder[] = rawOrders.map(normalizeOrderRow);

  const renderOrderCard = ({ item }: { item: FarmerOrder }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerRightBox}>
            <Text style={styles.orderNum}>سفارش #{toPersianDigits(item.id)}</Text>
            <Text style={styles.dateText}>
              تاریخ درخواستی: {toPersianDigits(item.targetDate)}
            </Text>
          </View>
          <StatusBadge
            status={orderStatusVariant(item.status)}
            label={orderStatusLabel(item.status)}
            size="sm"
          />
        </View>

        <View style={styles.bodyRow}>
          <Text style={styles.label}>نوع جیره / محصول:</Text>
          <Text style={styles.value}>{item.productName}</Text>
        </View>

        <View style={styles.bodyRow}>
          <Text style={styles.label}>تناژ درخواستی:</Text>
          <Text style={[styles.value, styles.weightVal]}>
            {formatWeight(item.requestedWeight)} ({toPersianDigits((item.requestedWeight / 1000).toFixed(1))} تن)
          </Text>
        </View>

        {item.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>توضیحات مرغدار:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.timestamp}>
            ثبت در سامانه: {formatJalaliDate(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer
      title="سفارش‌های دان من"
      subtitle="رهگیری و پیگیری آنلاین سفارش‌های جیره کارخانه"
      scrollable={false}
      onRefresh={refetch}
      refreshing={isRefetching}
      headerRight={
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.headerBtnText}>+ ثبت سفارش</Text>
        </TouchableOpacity>
      }
    >
      {/* Filter Chips */}
      <View style={styles.chipsRow}>
        <TouchableOpacity
          style={[styles.chip, statusFilter === 'all' && styles.chipActive]}
          onPress={() => setStatusFilter('all')}
        >
          <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>
            همه
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, statusFilter === 'pending' && styles.chipActive]}
          onPress={() => setStatusFilter('pending')}
        >
          <Text style={[styles.chipText, statusFilter === 'pending' && styles.chipTextActive]}>
            در انتظار تأیید
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, statusFilter === 'approved' && styles.chipActive]}
          onPress={() => setStatusFilter('approved')}
        >
          <Text style={[styles.chipText, statusFilter === 'approved' && styles.chipTextActive]}>
            تأیید شده
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, statusFilter === 'completed' && styles.chipActive]}
          onPress={() => setStatusFilter('completed')}
        >
          <Text style={[styles.chipText, statusFilter === 'completed' && styles.chipTextActive]}>
            تحویل شده
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, statusFilter === 'rejected' && styles.chipActive]}
          onPress={() => setStatusFilter('rejected')}
        >
          <Text style={[styles.chipText, statusFilter === 'rejected' && styles.chipTextActive]}>
            رد شده
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت وضعیت سفارش‌ها...</Text>
        </View>
      ) : isError ? (
        <ScreenState
          isError
          error={error}
          onRetry={() => void refetch()}
          messages={{ error: 'دریافت سفارش‌های شما ناموفق بود.' }}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderOrderCard}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>سفارشی یافت نشد</Text>
              <Text style={styles.emptySubtitle}>
                شما در این وضعیت هنوز سفارشی ثبت نکرده‌اید. برای ثبت سفارش دان جدید، دکمه «+ ثبت سفارش» را بزنید.
              </Text>
            </View>
          }
        />
      )}

      <OrderFeedModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => refetch()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 12,
    color: '#ffffff',
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
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
  headerRightBox: {
    alignItems: 'flex-end',
  },
  orderNum: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#0f172a',
  },
  dateText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  bodyRow: {
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
  weightVal: {
    color: '#0284c7',
    fontFamily: 'Vazirmatn_700Bold',
  },
  notesBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  notesLabel: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 11,
    color: '#475569',
    textAlign: 'right',
  },
  notesText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#334155',
    textAlign: 'right',
    marginTop: 2,
  },
  footerRow: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
    paddingTop: 6,
  },
  timestamp: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'left',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 15,
    color: '#475569',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default FarmerOrdersScreen;
