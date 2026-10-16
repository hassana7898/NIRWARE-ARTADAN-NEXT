import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { ScreenState } from '../../components/common/ScreenState';
import { palette } from '../../theme/tokens';
import { StatusBadge } from '../../components/common/StatusBadge';
import { apiClient } from '../../api/client';
import { extractApiErrorMessage } from '../../api/errors';
import { Endpoints } from '../../api/endpoints';
import {
  buildCreateRemittancePayload,
  buildMapPayload,
  canCreateRemittance,
  canMapTicket,
  canUnmapTicket,
  inferredDirection,
  isTicketNetted,
  readWeighbridgeOutcome,
  validateCreateRemittance,
  type TicketRecord,
} from '../../features/manager/weighbridgeActions';
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
  remittanceNumber?: string | null;
  isMismatch?: boolean;
}

/** Which sheet is open, and for which ticket. 
ull means no sheet is showing. */
type Sheet =
  | { kind: 'none' }
  | { kind: 'menu'; ticket: WeighbridgeRecordItem }
  | {
      kind: 'map';
      ticket: WeighbridgeRecordItem;
      candidates: Array<{
        id: string;
        invoiceNumber: string | null;
        productName: string | null;
        date: string | null;
        weight: number | null;
      }>;
      loadingCandidates: boolean;
      candidatesError: string | null;
      selectedId: string | null;
    }
  | {
      kind: 'create';
      ticket: WeighbridgeRecordItem;
      type: 'entry' | 'exit';
      productId: string;
      weight: string;
      farmerName: string;
      notes: string;
      submitting: boolean;
      error: string | null;
    };

export function WeighbridgeMonitorScreen() {
  const [filter, setFilter] = useState<'all' | 'done' | 'pending' | 'mismatch'>('all');
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' });
  const queryClient = useQueryClient();

  const recordsQuery = useQuery({
    queryKey: ['manager-weighbridge'],
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.manager.weighbridge);
      return res.data;
    },
  });
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = recordsQuery;

  /**
   * One mutation for all three write operations. They share the same failure handling (the server
   * answers `{ success: false, error }` with 4xx/5xx) and the same follow-up: refresh the list AND
   * the invoice lists, because a map changes an invoice weight and a create adds a new invoice.
   */
  const writeMutation = useMutation({
    mutationFn: async (vars: { action: 'map' | 'unmap' | 'create'; ticketId: string | number; body: Record<string, unknown> }) => {
      const base = Endpoints.weighbridge;
      if (vars.action === 'map') {
        return apiClient.post(base.map(vars.ticketId), vars.body);
      }
      if (vars.action === 'unmap') {
        return apiClient.post(base.unmap(vars.ticketId), vars.body);
      }
      return apiClient.post(base.createRemittance(vars.ticketId), vars.body);
    },
    onSuccess: () => {
      // Both surfaces change: the weighbridge list and the invoice lists.
      queryClient.invalidateQueries({ queryKey: ['manager-weighbridge'] });
      queryClient.invalidateQueries({ queryKey: ['manager', 'remittances'] });
    },
  });

  const records: WeighbridgeRecordItem[] = data?.records || [];

  const notify = (outcome: { ok: boolean; message: string }) => {
    if (outcome.ok) Alert.alert('انجام شد', outcome.message);
    else Alert.alert('انجام نشد', outcome.message);
  };

  /** Opens the ticket sheet and, for a map, loads the candidate invoices for it. */
  const openMenu = (ticket: WeighbridgeRecordItem) => setSheet({ kind: 'menu', ticket });

  const openMapSheet = async (ticket: WeighbridgeRecordItem) => {
    setSheet({
      kind: 'map',
      ticket,
      candidates: [],
      loadingCandidates: true,
      candidatesError: null,
      selectedId: null,
    });
    try {
      const res = await apiClient.get(Endpoints.weighbridge.candidates(ticket.id));
      const rows: any[] = Array.isArray(res.data?.candidates)
        ? res.data.candidates
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      const candidates = rows.map((r) => ({
        id: String(r.id ?? r.invoiceId ?? ''),
        invoiceNumber: r.invoiceNumber == null ? null : String(r.invoiceNumber),
        productName: r.productName == null ? null : String(r.productName),
        date: r.date == null ? null : String(r.date),
        weight: r.weight == null ? null : Number(r.weight),
      }));
      setSheet({
        kind: 'map',
        ticket,
        candidates,
        loadingCandidates: false,
        candidatesError: null,
        selectedId: candidates.length > 0 ? candidates[0].id : null,
      });
    } catch (err: any) {
      setSheet({
        kind: 'map',
        ticket,
        candidates: [],
        loadingCandidates: false,
        candidatesError: extractApiErrorMessage(err, 'دریافت حواله‌های پیشنهادی این قبض ناموفق بود.'),
        selectedId: null,
      });
    }
  };

  const openCreateSheet = (ticket: WeighbridgeRecordItem) => {
    const direction = inferredDirection(ticket as TicketRecord);
    const net = Number(ticket.netWeight) || 0;
    setSheet({
      kind: 'create',
      ticket,
      type: direction,
      productId: '',
      weight: net > 0 ? String(net) : '',
      farmerName: '',
      notes: '',
      submitting: false,
      error: null,
    });
  };

  const submitMap = async (invoiceId: string) => {
    if (sheet.kind !== 'map') return;
    const ticket = sheet.ticket;
    const body = buildMapPayload({ ticketId: ticket.id, invoiceId });
    try {
      const res = await writeMutation.mutateAsync({ action: 'map', ticketId: ticket.id, body });
      const outcome = readWeighbridgeOutcome(res.status, res.data, 'قبض باسکول به حواله تخصیص داده شد.');
      notify(outcome);
      if (outcome.ok) setSheet({ kind: 'none' });
    } catch (err: any) {
      notify({
        ok: false,
        message: err?.response
          ? readWeighbridgeOutcome(err.response.status, err.response.data, 'تخصیص انجام نشد.').message
          : 'اتصال به سرور برقرار نشد؛ عملیات انجام نشد.',
      });
    }
  };

  const submitUnmap = async (ticket: WeighbridgeRecordItem) => {
    Alert.alert(
      'لغو تخصیص',
      'اتصال این قبض به حواله برداشته می‌شود. آیا مطمئن هستید؟',
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'لغو تخصیص',
          style: 'destructive',
          onPress: async () => {
            try {
              // `deleteInvoice: false` is EXPLICIT: the route's default removes the remittance too,
              // which is only correct for an invoice this very ticket created. Unassigning is the
              // reversible action the UI promises, so it must not delete the operator's data.
              const res = await writeMutation.mutateAsync({
                action: 'unmap',
                ticketId: ticket.id,
                body: { deleteInvoice: false },
              });
              const outcome = readWeighbridgeOutcome(res.status, res.data, 'اتصال قبض به حواله برداشته شد.');
              notify(outcome);
              if (outcome.ok) setSheet({ kind: 'none' });
            } catch (err: any) {
              notify({
                ok: false,
                message: err?.response
                  ? readWeighbridgeOutcome(err.response.status, err.response.data, 'لغو تخصیص انجام نشد.').message
                  : 'اتصال به سرور برقرار نشد؛ عملیات انجام نشد.',
              });
            }
          },
        },
      ]
    );
  };

  const submitCreate = async () => {
    if (sheet.kind !== 'create') return;
    const ticket = sheet.ticket;
    const input = {
      ticketId: ticket.id,
      type: sheet.type,
      productId: sheet.productId.trim(),
      weight: sheet.weight ? Number(sheet.weight.replace(/[^\d.]/g, '')) : undefined,
      farmerName: sheet.type === 'exit' ? sheet.farmerName.trim() : undefined,
      notes: sheet.notes.trim() || undefined,
    };
    const validation = validateCreateRemittance(input);
    if (!validation.valid) {
      setSheet({ ...sheet, error: validation.error || 'اطلاعات ناقص است.' });
      return;
    }

    setSheet({ ...sheet, submitting: true, error: null });
    const body = buildCreateRemittancePayload(input);
    try {
      const res = await writeMutation.mutateAsync({ action: 'create', ticketId: ticket.id, body });
      const outcome = readWeighbridgeOutcome(res.status, res.data, 'حواله ایجاد و به قبض متصل شد.');
      notify(outcome);
      if (outcome.ok) setSheet({ kind: 'none' });
    } catch (err: any) {
      setSheet({
        ...sheet,
        submitting: false,
        error: err?.response
          ? readWeighbridgeOutcome(err.response.status, err.response.data, 'ایجاد حواله انجام نشد.').message
          : 'اتصال به سرور برقرار نشد؛ حواله ایجاد نشد.',
      });
    }
  };

  const filteredRecords = records.filter((r) => {
    const hasNet = Number(r.netWeight) > 0;
    if (filter === 'done') return hasNet;
    if (filter === 'pending') return !hasNet;
    if (filter === 'mismatch') return !!r.isMismatch;
    return true;
  });

  const renderTicketCard = ({ item }: { item: WeighbridgeRecordItem }) => {
    const isMapped = !!item.mappedRemittanceId;
    const netWeight = Number(item.netWeight) || 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.ticketBox}>
            <Text style={styles.ticketLabel}>قبض:</Text>
            <Text style={styles.ticketNum}>
              {toPersianDigits(item.ticketNumber || item.externalId)}
            </Text>
          </View>

          <View style={styles.statusBox}>
            {isMapped ? (
              <StatusBadge status="success" label="حواله متصل شد" size="sm" />
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
          <Text style={styles.label}>مشتری / مرغدار:</Text>
          <Text style={styles.value}>{item.customerName || '—'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>راننده و خودرو:</Text>
          <Text style={styles.value}>
            {item.driverName || '—'} {item.plateNumber ? `(${toPersianDigits(item.plateNumber)})` : ''}
          </Text>
        </View>

        {/* Weights & Time */}
        <View style={styles.weightRow}>
          <View>
            <Text style={styles.weightLabel}>وزن خالص باسکول:</Text>
            <Text style={[styles.weightVal, netWeight > 0 ? styles.netDone : styles.netPending]}>
              {netWeight > 0 ? formatWeight(netWeight) : 'در انتظار خروج'}
            </Text>
          </View>

          {item.weighTime && (
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>زمان توزین:</Text>
              <Text style={styles.timeVal}>{toPersianDigits(item.weighTime)}</Text>
            </View>
          )}
        </View>

        {/* Operations: the three writes the web panel has. Every route itself requires
            ADMIN|MANAGER server-side, so this is only the entry point. */}
        <TouchableOpacity
          style={styles.actionsBtn}
          onPress={() => openMenu(item)}
          accessibilityRole="button"
          accessibilityLabel={`عملیات قبض ${item.ticketNumber || item.externalId}`}
        >
          <Text style={styles.actionsBtnText}>
            عملیات: {isMapped ? 'مدیریت اتصال' : isTicketNetted(item as TicketRecord) ? 'ایجاد حواله' : 'تخصیص به حواله'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScreenContainer
      title="مانیتورینگ باسکول دیجیتال"
      subtitle="توزین‌نگار کارخانه آرادان"
      scrollable={false}
      onRefresh={refetch}
      refreshing={isRefetching}
    >
      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            همه ({toPersianDigits(records.length)})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filter === 'done' && styles.filterPillActive]}
          onPress={() => setFilter('done')}
        >
          <Text style={[styles.filterText, filter === 'done' && styles.filterTextActive]}>
            خالص‌شده
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filter === 'pending' && styles.filterPillActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            ناخالص
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filter === 'mismatch' && styles.filterPillActive]}
          onPress={() => setFilter('mismatch')}
        >
          <Text style={[styles.filterText, filter === 'mismatch' && styles.filterTextActive]}>
            مغایرت
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت رکوردهای توزین...</Text>
        </View>
      ) : isError ? (
        <ScreenState
          isError
          error={error}
          onRetry={() => void refetch()}
          messages={{ error: 'دریافت رکوردهای توزین ناموفق بود.' }}
        />
      ) : filteredRecords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>رکوردی مطابق فیلتر انتخابی یافت نشد.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => String(item.id || item.externalId)}
          renderItem={renderTicketCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      {/* ================= Operations sheets ================= */}
      <Modal
        visible={sheet.kind === 'menu'}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet({ kind: 'none' })}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>عملیات قبض باسکول</Text>
            {sheet.kind === 'menu' ? (
              <>
                <Text style={styles.sheetSub}>
                  قبض {toPersianDigits(sheet.ticket.ticketNumber || sheet.ticket.externalId)}
                </Text>

                {canMapTicket(sheet.ticket as TicketRecord) ? (
                  <TouchableOpacity
                    style={styles.sheetAction}
                    onPress={() => openMapSheet(sheet.ticket)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.sheetActionText}>تخصیص به حوالهٔ موجود</Text>
                  </TouchableOpacity>
                ) : null}

                {canUnmapTicket(sheet.ticket as TicketRecord) ? (
                  <TouchableOpacity
                    style={[styles.sheetAction, styles.sheetActionDanger]}
                    onPress={() => submitUnmap(sheet.ticket)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.sheetActionText, styles.sheetActionTextDanger]}>لغو تخصیص حواله</Text>
                  </TouchableOpacity>
                ) : null}

                {canCreateRemittance(sheet.ticket as TicketRecord) ? (
                  <TouchableOpacity
                    style={styles.sheetAction}
                    onPress={() => openCreateSheet(sheet.ticket)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.sheetActionText}>ایجاد حواله از این قبض</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity style={styles.sheetCancel} onPress={() => setSheet({ kind: 'none' })}>
                  <Text style={styles.sheetCancelText}>بستن</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Assign sheet: pick one existing invoice from the server's own candidate list. */}
      <Modal
        visible={sheet.kind === 'map'}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet({ kind: 'none' })}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>تخصیص به حواله</Text>
            {sheet.kind === 'map' ? (
              <>
                {sheet.loadingCandidates ? (
                  <ActivityIndicator size="small" color={palette.primary} />
                ) : sheet.candidatesError ? (
                  <View style={styles.sheetErrorBox}>
                    <Text style={styles.sheetErrorText}>{sheet.candidatesError}</Text>
                  </View>
                ) : sheet.candidates.length === 0 ? (
                  <Text style={styles.sheetEmpty}>حوالهٔ پیشنهادی برای این قبض یافت نشد.</Text>
                ) : (
                  <ScrollView style={styles.candidateList}>
                    {sheet.candidates.map((c) => {
                      const active = sheet.kind === 'map' && sheet.selectedId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.candidate, active && styles.candidateActive]}
                          onPress={() =>
                            setSheet(
                              sheet.kind === 'map'
                                ? { ...sheet, selectedId: c.id }
                                : sheet
                            )
                          }
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={styles.candidateTitle} numberOfLines={1}>
                            {c.productName || 'حواله'} · {toPersianDigits(c.invoiceNumber || c.id)}
                          </Text>
                          <Text style={styles.candidateMeta} numberOfLines={1}>
                            {c.date ? toPersianDigits(c.date) : '—'}
                            {c.weight ? ` · ${formatWeight(c.weight)}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                <TouchableOpacity
                  style={[styles.sheetAction, (!sheet.selectedId || writeMutation.isPending) && styles.sheetActionDisabled]}
                  disabled={!sheet.selectedId || writeMutation.isPending}
                  onPress={() => sheet.kind === 'map' && submitMap(sheet.selectedId as string)}
                  accessibilityRole="button"
                >
                  {writeMutation.isPending ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.sheetActionText}>تخصیص یافت</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetCancel} onPress={() => setSheet({ kind: 'none' })}>
                  <Text style={styles.sheetCancelText}>انصراف</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      {/* Create sheet: build a new invoice FROM this ticket through the shared backend route. */}
      <Modal
        visible={sheet.kind === 'create'}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet({ kind: 'none' })}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>ایجاد حواله از قبض باسکول</Text>
            {sheet.kind === 'create' ? (
              <>
                <Text style={styles.sheetSub}>
                  قبض {toPersianDigits(sheet.ticket.ticketNumber || sheet.ticket.externalId)}
                </Text>

                <View style={styles.segmentRow}>
                  <TouchableOpacity
                    style={[styles.segment, sheet.type === 'entry' && styles.segmentActive]}
                    onPress={() => setSheet({ ...sheet, type: 'entry' })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sheet.type === 'entry' }}
                  >
                    <Text style={[styles.segmentText, sheet.type === 'entry' && styles.segmentTextActive]}>
                      حوالهٔ ورود
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segment, sheet.type === 'exit' && styles.segmentActive]}
                    onPress={() => setSheet({ ...sheet, type: 'exit' })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sheet.type === 'exit' }}
                  >
                    <Text style={[styles.segmentText, sheet.type === 'exit' && styles.segmentTextActive]}>
                      حوالهٔ خروج
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>محصول</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={sheet.productId}
                  onChangeText={(t) => setSheet({ ...sheet, productId: t })}
                  placeholder="شناسهٔ محصول"
                  placeholderTextColor="#94a3b8"
                  textAlign="right"
                />

                <Text style={styles.fieldLabel}>وزن (کیلوگرم)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={sheet.weight}
                  onChangeText={(t) => setSheet({ ...sheet, weight: t.replace(/[^\d.]/g, '') })}
                  placeholder="۰"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  textAlign="right"
                />

                {sheet.type === 'exit' ? (
                  <>
                    <Text style={styles.fieldLabel}>نام مرغدار</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={sheet.farmerName}
                      onChangeText={(t) => setSheet({ ...sheet, farmerName: t })}
                      placeholder="نام مرغداری"
                      placeholderTextColor="#94a3b8"
                      textAlign="right"
                    />
                  </>
                ) : null}

                <Text style={styles.fieldLabel}>توضیحات (اختیاری)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={sheet.notes}
                  onChangeText={(t) => setSheet({ ...sheet, notes: t })}
                  placeholder=""
                  placeholderTextColor="#94a3b8"
                  textAlign="right"
                />

                {sheet.error ? (
                  <View style={styles.sheetErrorBox}>
                    <Text style={styles.sheetErrorText}>{sheet.error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.sheetAction, sheet.submitting && styles.sheetActionDisabled]}
                  disabled={sheet.submitting}
                  onPress={submitCreate}
                  accessibilityRole="button"
                >
                  {sheet.submitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.sheetActionText}>ایجاد حواله و اتصال به قبض</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetCancel} onPress={() => setSheet({ kind: 'none' })}>
                  <Text style={styles.sheetCancelText}>انصراف</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  actionsBtn: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionsBtnText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 13,
    color: '#ffffff',
  },  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    paddingBottom: 28,
    gap: 10,
    maxHeight: '88%',
  },
  sheetTitle: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 16,
    color: '#0f172a',
    textAlign: 'right',
  },
  sheetSub: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
  },
  sheetAction: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  sheetActionDanger: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  sheetActionDisabled: {
    opacity: 0.6,
  },
  sheetActionText: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#ffffff',
  },
  sheetActionTextDanger: {
    color: '#b91c1c',
  },
  sheetCancel: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#64748b',
  },
  sheetEmpty: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 13,
    color: '#64748b',
    textAlign: 'right',
    paddingVertical: 12,
  },
  sheetErrorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
  },
  sheetErrorText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#b91c1c',
    textAlign: 'right',
  },
  candidateList: {
    maxHeight: 240,
  },
  candidate: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  candidateActive: {
    borderColor: '#059669',
    backgroundColor: '#ecfdf5',
  },
  candidateTitle: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 13,
    color: '#0f172a',
    textAlign: 'right',
  },
  candidateMeta: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#64748b',
    textAlign: 'right',
    marginTop: 2,
  },
  segmentRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  segmentText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#64748b',
  },
  segmentTextActive: {
    fontFamily: 'Vazirmatn_700Bold',
    color: '#047857',
  },
  fieldLabel: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#334155',
    textAlign: 'right',
    marginTop: 4,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 14,
    color: '#0f172a',
    textAlign: 'right',
  },
  filterRow: {
    flexDirection: 'row-reverse',
    gap: 6,
    marginBottom: 12,
  },
  filterPill: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterText: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#64748b',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  ticketBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  ticketLabel: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#64748b',
  },
  ticketNum: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    color: '#0f172a',
  },
  statusBox: {
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  label: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 12,
    color: '#64748b',
  },
  value: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 13,
    color: '#1e293b',
  },
  weightRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  weightLabel: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#475569',
  },
  weightVal: {
    fontFamily: 'Vazirmatn_700Bold',
    fontSize: 14,
    marginTop: 2,
  },
  netDone: {
    color: '#16a34a',
  },
  netPending: {
    color: '#d97706',
  },
  timeBox: {
    alignItems: 'flex-start',
  },
  timeLabel: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 11,
    color: '#64748b',
  },
  timeVal: {
    fontFamily: 'Vazirmatn_500Medium',
    fontSize: 12,
    color: '#0f172a',
    marginTop: 2,
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
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontFamily: 'Vazirmatn_400Regular',
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

export default WeighbridgeMonitorScreen;
