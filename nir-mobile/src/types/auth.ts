export type UserRole = 'DRIVER' | 'FARMER' | 'MANAGER' | 'ADMIN' | 'OPERATOR' | 'ACCOUNTING';

/**
 * Roles the MOBILE app can open a session for.
 *
 * `ACCOUNTING` is included because the backend already grants it write access on the invoice
 * surface (`server/routes/invoices.ts` allows ACCOUNTING on POST/PUT/bulk-move/order, and
 * `server/routes/sync.ts` allows it too). Excluding it here used to bounce a real accounting user
 * straight back to the login screen after a successful server-side authentication.
 *
 * `VIEWER` stays OUT on purpose: it is the read-only web role, and the backend rejects every write
 * it attempts (`blockViewerWrites`), so giving it a navigator would only produce 403s.
 */
export const KNOWN_ROLES: UserRole[] = ['DRIVER', 'FARMER', 'MANAGER', 'ADMIN', 'OPERATOR', 'ACCOUNTING'];

/** Fail-closed role check: anything the server did not explicitly issue keeps the user signed out. */
export const isKnownRole = (role: unknown): role is UserRole =>
  KNOWN_ROLES.includes(String(role || '').toUpperCase() as UserRole);

export interface MobileUser {
  id: string;
  username: string;
  role: UserRole;
  fullName?: string | null;
  driverId?: string | null;
  farmerId?: string | null;
  phone?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  success: boolean;
  user: MobileUser;
  accessToken: string;
  refreshToken: string;
  message?: string;
}

export interface OtpRequestResponse {
  success: boolean;
  message?: string;
  expiresIn?: number;
  debugCode?: string;
}

export interface LoginResponse {
  success: boolean;
  user?: MobileUser;
  accessToken?: string;
  refreshToken?: string;
  twoFactorRequired?: boolean;
  requires2FA?: boolean;
  message?: string;
}

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: MobileUser | null;
  role: UserRole | null;
}
