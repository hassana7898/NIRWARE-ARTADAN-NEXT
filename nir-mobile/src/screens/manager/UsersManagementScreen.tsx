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
import { formatJalaliDate, toPersianDigits } from '../../utils/formatters';
import {
  ROLE_OPTIONS,
  adminCount,
  buildCreateUserPayload,
  buildUpdateUserPayload,
  canManageUsers,
  canViewUsers,
  filterManagedUsers,
  isOnlyAdmin,
  normalizeManagedUsers,
  roleLabel,
  validateUserCreate,
  validateUserEdit,
  type AssignableRole,
  type ManagedUser,
} from '../../features/manager/userManagement';

const USERS_QUERY_KEY = ['manager', 'users'] as const;
const ROLE_FILTERS: { value: AssignableRole | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'همه نقش‌ها' },
  ...ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
];

interface FormState {
  id: string | null;
  username: string;
  password: string;
  role: AssignableRole;
  fullName: string;
  phone: string;
  newPassword: string;
}

const emptyForm = (): FormState => ({
  id: null,
  username: '',
  password: '',
  role: 'OPERATOR',
  fullName: '',
  phone: '',
  newPassword: '',
});

export function UsersManagementScreen({ navigation }: any) {
  const { user: currentUser, role } = useAuth();
  const queryClient = useQueryClient();
  const canView = canViewUsers(role);
  const canWrite = canManageUsers(role);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AssignableRole | 'ALL'>('ALL');
  const [form, setForm] = useState<FormState | null>(null);

  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    enabled: canView,
    queryFn: async () => {
      const res = await apiClient.get(Endpoints.web.users);
      return normalizeManagedUsers(res.data?.data);
    },
  });

  const users = usersQuery.data ?? [];
  const visibleUsers = useMemo(
    () => filterManagedUsers(users, { search, role: roleFilter }),
    [users, search, roleFilter]
  );

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiClient.post(Endpoints.web.users, payload);
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await apiClient.patch(Endpoints.web.userById(id), payload);
      return res.data;
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      const res = await apiClient.put(Endpoints.web.userPassword(id), { newPassword });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete(Endpoints.web.userById(id));
      return res.data;
    },
  });

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    passwordMutation.isPending ||
    deleteMutation.isPending;

  if (!canView) {
    return (
      <ScreenContainer scrollable={false} showBack onBack={() => navigation?.goBack?.()} title="مدیریت کاربران">
        <ScreenState
          isError
          onRetry={undefined}
          messages={{ error: 'عدم دسترسی: مدیریت کاربران فقط برای مدیر ارشد و مدیر کارخانه فعال است.' }}
        />
      </ScreenContainer>
    );
  }

  const openCreate = () => setForm(emptyForm());
  const openEdit = (user: ManagedUser) =>
    setForm({
      id: user.id,
      username: user.username,
      password: '',
      role: (String(user.role).toUpperCase() as AssignableRole) || 'OPERATOR',
      fullName: user.fullName || '',
      phone: user.phone || '',
      newPassword: '',
    });

  const submitForm = () => {
    if (!form || busy) return;
    const isEdit = !!form.id;

    const validation = isEdit
      ? validateUserEdit({ role: form.role, phone: form.phone, fullName: form.fullName })
      : validateUserCreate(form);
    if (!validation.valid) {
      const first = Object.values(validation.errors)[0];
      Alert.alert('اطلاعات ناقص', first || 'لطفاً فیلدها را بررسی کنید.');
      return;
    }

    const onSuccess = async (message: string) => {
      await refreshUsers();
      setForm(null);
      Alert.alert('موفقیت', message);
    };
    const onError = (error: unknown) =>
      Alert.alert('خطا', extractApiErrorMessage(error, 'عملیات انجام نشد.'));

    if (isEdit) {
      updateMutation.mutate(
        { id: form.id as string, payload: buildUpdateUserPayload(form) },
        { onSuccess: () => void onSuccess('اطلاعات کاربر به‌روزرسانی شد.'), onError }
      );
    } else {
      createMutation.mutate(buildCreateUserPayload(form), {
        onSuccess: () => void onSuccess('کاربر جدید ایجاد شد.'),
        onError,
      });
    }
  };

  const resetPassword = () => {
    if (!form?.id || busy) return;
    if (form.newPassword.length < 6) {
      Alert.alert('خطا', 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    passwordMutation.mutate(
      { id: form.id, newPassword: form.newPassword },
      {
        onSuccess: () => {
          setForm({ ...form, newPassword: '' });
          Alert.alert('موفقیت', 'رمز عبور کاربر تغییر کرد.');
        },
        onError: (error) => Alert.alert('خطا', extractApiErrorMessage(error, 'تغییر رمز عبور ناموفق بود.')),
      }
    );
  };

  const confirmDelete = (user: ManagedUser) => {
    if (busy) return;
    if (isOnlyAdmin(users, user.id)) {
      Alert.alert(
        'تنها مدیر ارشد',
        'این کاربر تنها مدیر ارشد سامانه است؛ حذف او مدیریت کاربران را قفل می‌کند. سرور این عملیات را رد می‌کند.'
      );
      return;
    }
    Alert.alert(
      'حذف کاربر',
      `آیا از حذف «${user.fullName || user.username}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.`,
      [
        { text: 'انصراف', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(user.id, {
              onSuccess: async () => {
                await refreshUsers();
                setForm(null);
                Alert.alert('موفقیت', 'کاربر حذف شد.');
              },
              onError: (error) => Alert.alert('خطا', extractApiErrorMessage(error, 'حذف کاربر ناموفق بود.')),
            }),
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ManagedUser }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={canWrite ? 0.75 : 1}
      disabled={!canWrite}
      onPress={() => openEdit(item)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleLabel(item.role)}</Text>
        </View>
        <View style={styles.cardTitleBox}>
          <Text style={styles.userName}>{item.fullName || item.username}</Text>
          <Text style={styles.userMeta}>نام کاربری: {item.username}</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>تماس:</Text>
        <Text style={styles.infoValue}>{item.phone ? toPersianDigits(item.phone) : 'ثبت نشده'}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>تاریخ ایجاد:</Text>
        <Text style={styles.infoValue}>
          {item.createdAt ? formatJalaliDate(item.createdAt) : '—'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const isEditMode = !!form?.id;

  return (
    <ScreenContainer
      scrollable={false}
      showBack
      onBack={() => navigation?.goBack?.()}
      title="مدیریت کاربران"
      subtitle="ایجاد، ویرایش نقش و مدیریت حساب‌های سامانه"
    >
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{toPersianDigits(users.length)}</Text>
          <Text style={styles.summaryLbl}>کل کاربران</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: '#38bdf8' }]}>{toPersianDigits(adminCount(users))}</Text>
          <Text style={styles.summaryLbl}>مدیر ارشد</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryVal, { color: canWrite ? '#34d399' : '#fbbf24' }]}>
            {canWrite ? 'کامل' : 'فقط خواندن'}
          </Text>
          <Text style={styles.summaryLbl}>سطح دسترسی شما</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="جستجوی نام یا شماره همراه..."
          placeholderTextColor="#94a3b8"
        />
        {canWrite ? (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} disabled={busy}>
            <Icon name="userRound" size={16} color={palette.inkInverse} decorative />
            <Text style={styles.addBtnText}>کاربر جدید</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {ROLE_FILTERS.map((option) => {
          const active = option.value === roleFilter;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setRoleFilter(option.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {usersQuery.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>در حال دریافت کاربران...</Text>
        </View>
      ) : usersQuery.isError ? (
        <ScreenState
          isError
          error={usersQuery.error}
          onRetry={() => void usersQuery.refetch()}
          messages={{ error: 'دریافت فهرست کاربران ناموفق بود.' }}
        />
      ) : (
        <FlatList
          data={visibleUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={usersQuery.isRefetching} onRefresh={() => void usersQuery.refetch()} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>کاربری با این مشخصات یافت نشد.</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!form} transparent animationType="fade" onRequestClose={() => setForm(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{isEditMode ? 'ویرایش کاربر' : 'ایجاد کاربر جدید'}</Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>نام کاربری:</Text>
              <TextInput
                style={[styles.input, isEditMode && styles.inputDisabled]}
                value={form?.username ?? ''}
                editable={!isEditMode}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, username: text } : prev))}
                autoCapitalize="none"
                placeholder="admin"
              />

              {!isEditMode ? (
                <>
                  <Text style={styles.fieldLabel}>رمز عبور (حداقل ۶ کاراکتر):</Text>
                  <TextInput
                    style={styles.input}
                    value={form?.password ?? ''}
                    onChangeText={(text) => setForm((prev) => (prev ? { ...prev, password: text } : prev))}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="••••••••"
                  />
                </>
              ) : null}

              <Text style={styles.fieldLabel}>نام و نام خانوادگی:</Text>
              <TextInput
                style={styles.input}
                value={form?.fullName ?? ''}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, fullName: text } : prev))}
                placeholder="نام کاربر"
              />

              <Text style={styles.fieldLabel}>شماره همراه (اختیاری):</Text>
              <TextInput
                style={styles.input}
                value={form?.phone ?? ''}
                onChangeText={(text) => setForm((prev) => (prev ? { ...prev, phone: text } : prev))}
                keyboardType="phone-pad"
                placeholder="09123456789"
              />

              <Text style={styles.fieldLabel}>نقش کاربری:</Text>
              <View style={styles.roleGrid}>
                {ROLE_OPTIONS.map((option) => {
                  const active = form?.role === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.roleOption, active && styles.roleOptionActive]}
                      onPress={() =>
                        setForm((prev) => (prev ? { ...prev, role: option.value } : prev))
                      }
                    >
                      <Text style={[styles.roleOptionText, active && styles.roleOptionTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {isEditMode ? (
                <View style={styles.dangerZone}>
                  <Text style={styles.fieldLabel}>تغییر رمز عبور کاربر:</Text>
                  <View style={styles.inlineRow}>
                    <TextInput
                      style={[styles.input, styles.inlineInput]}
                      value={form?.newPassword ?? ''}
                      onChangeText={(text) =>
                        setForm((prev) => (prev ? { ...prev, newPassword: text } : prev))
                      }
                      secureTextEntry
                      placeholder="رمز جدید"
                    />
                    <TouchableOpacity style={styles.inlineBtn} onPress={resetPassword} disabled={busy}>
                      <Icon name="keyRound" size={15} color={palette.primary} decorative />
                      <Text style={styles.inlineBtnText}>تغییر رمز</Text>
                    </TouchableOpacity>
                  </View>
                  {canWrite ? (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => form && confirmDelete({ ...form, id: form.id as string } as ManagedUser)}
                      disabled={busy}
                    >
                      <Text style={styles.deleteBtnText}>حذف این کاربر</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setForm(null)} disabled={busy}>
                <Text style={styles.cancelText}>انصراف</Text>
              </TouchableOpacity>
              {canWrite ? (
                <TouchableOpacity
                  style={[styles.saveBtn, busy && styles.btnDisabled]}
                  onPress={submitForm}
                  disabled={busy}
                >
                  <Text style={styles.saveText}>{isEditMode ? 'ذخیره تغییرات' : 'ایجاد کاربر'}</Text>
                </TouchableOpacity>
              ) : null}
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
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryVal: { fontFamily: 'Vazirmatn_700Bold', fontSize: 16, color: '#ffffff' },
  summaryLbl: { fontFamily: 'Vazirmatn_400Regular', fontSize: 10, color: '#94a3b8', marginTop: 2 },
  summaryDivider: { width: 1, height: 26, backgroundColor: '#334155' },
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
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addBtnText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#ffffff' },
  chipsRow: { flexDirection: 'row-reverse', gap: 6, paddingBottom: 8 },
  chip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  chipText: { fontFamily: 'Vazirmatn_500Medium', fontSize: 11, color: '#475569' },
  chipTextActive: { fontFamily: 'Vazirmatn_700Bold', color: '#0284c7' },
  listContent: { paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
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
  cardTitleBox: { flex: 1, alignItems: 'flex-end' },
  userName: { fontFamily: 'Vazirmatn_700Bold', fontSize: 15, color: '#0f172a' },
  userMeta: { fontFamily: 'Vazirmatn_400Regular', fontSize: 11, color: '#64748b', marginTop: 2 },
  roleBadge: { backgroundColor: '#e0f2fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 11, color: '#0369a1' },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  infoLabel: { fontFamily: 'Vazirmatn_400Regular', fontSize: 12, color: '#64748b' },
  infoValue: { fontFamily: 'Vazirmatn_500Medium', fontSize: 13, color: '#1e293b' },
  loadingBox: { padding: 40, alignItems: 'center' },
  loadingText: { fontFamily: 'Vazirmatn_500Medium', fontSize: 13, color: '#64748b', marginTop: 8 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Vazirmatn_400Regular', fontSize: 13, color: '#94a3b8' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, maxHeight: '88%' },
  modalTitle: { fontFamily: 'Vazirmatn_700Bold', fontSize: 16, color: '#0f172a', textAlign: 'right', marginBottom: 10 },
  modalScroll: { maxHeight: 420 },
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
  roleGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  roleOption: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roleOptionActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  roleOptionText: { fontFamily: 'Vazirmatn_500Medium', fontSize: 11, color: '#475569' },
  roleOptionTextActive: { fontFamily: 'Vazirmatn_700Bold', color: '#0284c7' },
  dangerZone: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#fee2e2', paddingTop: 6 },
  inlineRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1 },
  inlineBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inlineBtnText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 12, color: '#0369a1' },
  deleteBtn: {
    marginTop: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteBtnText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 13, color: '#b91c1c' },
  modalBtnRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
  cancelBtn: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  cancelText: { fontFamily: 'Vazirmatn_500Medium', fontSize: 13, color: '#64748b' },
  saveBtn: { flex: 2, backgroundColor: '#0284c7', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveText: { fontFamily: 'Vazirmatn_700Bold', fontSize: 13, color: '#ffffff' },
  btnDisabled: { opacity: 0.6 },
});

export default UsersManagementScreen;
