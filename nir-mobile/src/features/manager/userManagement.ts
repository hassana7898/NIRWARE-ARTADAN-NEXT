/**
 * Pure helpers for the mobile «مدیریت کاربران» (user administration) screen.
 *
 * Why this file exists: the web panel has NO user-management UI, so the ONLY contract is the API
 * itself (`server/routes/users.ts`). The role matrix, the payload shapes, the filters and the
 * validation live here with no React/axios import, so `tests/phase3Management.test.ts` can pin every
 * rule against the real route contract instead of a screenshot.
 *
 * Server contract (authoritative — the UI only mirrors it):
 *   GET    /api/users              requireRole(ADMIN, MANAGER)   -> { success, data: User[] }
 *   POST   /api/users              requireRole(ADMIN)            -> 400 on duplicate username / zod
 *   PATCH  /api/users/:id          requireRole(ADMIN)            -> role | fullName | phone
 *   PUT    /api/users/:id/password requireRole(ADMIN)            -> newPassword (min 6)
 *   DELETE /api/users/:id          requireRole(ADMIN)            -> refuses to remove the last ADMIN
 *
 * `requireRole` grants ADMIN implicitly, so every ADMIN check below is also "ADMIN passes".
 */

/** The roles the users table accepts (server/routes/users.ts `ROLES`). NOT the mobile session roles. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'ACCOUNTING', 'OPERATOR', 'VIEWER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<AssignableRole, string> = {
  ADMIN: 'مدیر ارشد سامانه',
  MANAGER: 'مدیر کارخانه',
  ACCOUNTING: 'حسابدار',
  OPERATOR: 'اپراتور باسکول',
  VIEWER: 'مشاهده‌گر (فقط خواندن)',
};

export const ROLE_OPTIONS: { value: AssignableRole; label: string }[] = ASSIGNABLE_ROLES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

export const isAssignableRole = (value: unknown): value is AssignableRole =>
  (ASSIGNABLE_ROLES as readonly string[]).includes(String(value || '').toUpperCase());

export const roleLabel = (value: unknown): string => {
  const normalized = String(value || '').toUpperCase();
  return isAssignableRole(normalized) ? ROLE_LABELS[normalized] : String(value || 'نامشخص');
};

/**
 * Capability matrix, mirroring the route guards exactly.
 * Users screen: ADMIN + MANAGER may READ; only ADMIN may WRITE.
 */
export const canViewUsers = (role: unknown): boolean =>
  ['ADMIN', 'MANAGER'].includes(String(role || '').toUpperCase());

export const canManageUsers = (role: unknown): boolean => String(role || '').toUpperCase() === 'ADMIN';

export interface ManagedUser {
  id: string;
  username: string;
  role: string;
  fullName: string | null;
  phone: string | null;
  createdAt?: string | null;
}

/** Never throws on a shapeless payload: an unusable row is dropped, not rendered as garbage. */
export const normalizeManagedUser = (raw: unknown): ManagedUser | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? '').trim();
  const username = String(row.username ?? '').trim();
  if (!id && !username) return null;
  const fullName = row.fullName == null ? null : String(row.fullName).trim();
  const phoneRaw = row.phone == null ? '' : String(row.phone).trim();
  return {
    id: id || username,
    username: username || id,
    role: String(row.role ?? '').toUpperCase() || 'OPERATOR',
    fullName: fullName === '' ? null : fullName,
    phone: phoneRaw === '' ? null : phoneRaw,
    createdAt: row.createdAt == null ? null : String(row.createdAt),
  };
};

export const normalizeManagedUsers = (raw: unknown): ManagedUser[] => {
  const list = Array.isArray(raw) ? raw : [];
  return list.map(normalizeManagedUser).filter((u): u is ManagedUser => u !== null);
};

export interface UserFilterInput {
  search?: string | null;
  role?: AssignableRole | 'ALL' | null;
}

/**
 * Client-side narrowing over the already-fetched list. The list endpoint has no server-side search,
 * so the screen filters the real rows it received — it never fabricates matches.
 */
export const filterManagedUsers = (users: ManagedUser[], input: UserFilterInput = {}): ManagedUser[] => {
  const term = String(input.search ?? '').trim().toLowerCase();
  const digits = term.replace(/[^\d]/g, '');
  const role = input.role && input.role !== 'ALL' ? String(input.role).toUpperCase() : '';

  return users.filter((user) => {
    if (role && user.role.toUpperCase() !== role) return false;
    if (!term) return true;
    const name = `${user.fullName || ''} ${user.username}`.toLowerCase();
    const phone = String(user.phone || '');
    const nameMatch = name.includes(term);
    // "0912" must find "0912 345 6789": compare digits when the term is numeric.
    const phoneMatch = digits.length > 1 ? phone.replace(/[^\d]/g, '').includes(digits) : phone.includes(term);
    return nameMatch || phoneMatch;
  });
};

export interface UserFormInput {
  username?: string;
  password?: string;
  role?: string;
  fullName?: string | null;
  phone?: string | null;
}

export interface FormValidation {
  valid: boolean;
  errors: Partial<Record<'username' | 'password' | 'role' | 'fullName' | 'phone', string>>;
}

const phoneError = (phone: string): string | null => {
  const raw = String(phone).trim();
  if (!raw) return null; // optional
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 13) return 'شماره تماس معتبر نیست.';
  return null;
};

/** Mirrors `userCreateSchema` (username >= 3, password >= 6, role enum). */
export const validateUserCreate = (input: UserFormInput): FormValidation => {
  const errors: FormValidation['errors'] = {};
  const username = String(input.username ?? '').trim();
  if (username.length < 3) errors.username = 'نام کاربری باید حداقل ۳ کاراکتر باشد.';
  if (String(input.password ?? '').length < 6) errors.password = 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
  if (!isAssignableRole(input.role)) errors.role = 'نقش انتخاب‌شده معتبر نیست.';
  const pe = phoneError(String(input.phone ?? ''));
  if (pe) errors.phone = pe;
  return { valid: Object.keys(errors).length === 0, errors };
};

/** Mirrors `userUpdateSchema`: at least one field, role must be a real role, phone optional. */
export const validateUserEdit = (input: UserFormInput): FormValidation => {
  const errors: FormValidation['errors'] = {};
  if (!isAssignableRole(input.role)) errors.role = 'نقش انتخاب‌شده معتبر نیست.';
  const pe = phoneError(String(input.phone ?? ''));
  if (pe) errors.phone = pe;
  return { valid: Object.keys(errors).length === 0, errors };
};

const emptyToNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

/** Trims and drops blank optional fields, exactly like the create route stores them. */
export const buildCreateUserPayload = (input: UserFormInput): Record<string, unknown> => ({
  username: String(input.username ?? '').trim(),
  password: String(input.password ?? ''),
  role: isAssignableRole(input.role) ? String(input.role).toUpperCase() : undefined,
  fullName: emptyToNull(input.fullName),
  phone: emptyToNull(input.phone),
});

export const buildUpdateUserPayload = (input: UserFormInput): Record<string, unknown> => ({
  role: isAssignableRole(input.role) ? String(input.role).toUpperCase() : undefined,
  fullName: emptyToNull(input.fullName),
  phone: emptyToNull(input.phone),
});

/**
 * True when `userId` is the ONLY ADMIN in the list. The screen uses this to warn BEFORE the call;
 * the server refuses the operation regardless (server/routes/users.ts LAST_ADMIN guard).
 */
export const isOnlyAdmin = (users: ManagedUser[], userId: string): boolean => {
  const admins = users.filter((u) => u.role.toUpperCase() === 'ADMIN');
  return admins.length === 1 && admins[0].id === userId;
};

export const adminCount = (users: ManagedUser[]): number =>
  users.filter((u) => u.role.toUpperCase() === 'ADMIN').length;
