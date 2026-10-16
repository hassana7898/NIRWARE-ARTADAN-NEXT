/**
 * Pure helpers for mobile FARMER management (create / edit / activate-deactivate).
 *
 * Contract source: `server/routes/farmers.ts`
 *   GET    /api/farmers              any authenticated role   (`?status=active|inactive|all`)
 *   POST   /api/farmers              ADMIN | MANAGER          (name required; de-duplicates by name)
 *   PUT    /api/farmers/:id          ADMIN | MANAGER
 *   DELETE /api/farmers/:id          ADMIN                    (soft delete == deactivate)
 *   PUT    /api/farmers/:id/restore  ADMIN | MANAGER          (reactivate)
 *
 * Backend rules that the form must honour: the NAME is required (400 without it) and is normalised
 * (`normalizePersianText`) so the same human cannot be created twice; the phone is optional and is
 * normalised to digits. No React/axios import so the rules are unit-testable.
 */

import { normalizePersianText, normalizePhone } from '../../utils/persianText';

/** Digits-only phone (a leading `+` is dropped so the stored value matches the server's format). */
const digitsPhone = (value: unknown): string => normalizePhone(value).replace(/^\+/, '');

export interface FarmerFormInput {
  name?: string;
  phone?: string | null;
}

export interface FarmerValidation {
  valid: boolean;
  errors: Partial<Record<'name' | 'phone', string>>;
}

/** The backend requires the name; the phone is optional but must not be garbage. */
export const validateFarmerInput = (input: FarmerFormInput): FarmerValidation => {
  const errors: FarmerValidation['errors'] = {};
  const name = normalizePersianText(input.name);
  if (!name) errors.name = 'نام مرغدار الزامی است.';

  const rawPhone = String(input.phone ?? '').trim();
  if (rawPhone) {
    const digits = digitsPhone(rawPhone);
    if (digits.length < 8 || digits.length > 13) errors.phone = 'شماره تماس معتبر نیست.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
};

/**
 * Payload for POST (create) / PUT (edit). `id` is omitted on create unless the caller has a real one.
 * Blank strings are dropped so the server stores NULL, exactly like the web list does.
 */
export const buildFarmerPayload = (
  input: FarmerFormInput & { id?: string | null }
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    name: normalizePersianText(input.name),
  };
  const phone = digitsPhone(input.phone ?? '');
  payload.phone = phone === '' ? null : phone;
  if (input.id) payload.id = String(input.id);
  return payload;
};

/**
 * Capability matrix, mirroring the route guards.
 *   create / edit / restore : ADMIN | MANAGER
 *   deactivate (soft delete): ADMIN  (DELETE route is stricter than PUT)
 */
export const canCreateFarmer = (role: unknown): boolean =>
  ['ADMIN', 'MANAGER'].includes(String(role || '').toUpperCase());

export const canEditFarmer = (role: unknown): boolean =>
  ['ADMIN', 'MANAGER'].includes(String(role || '').toUpperCase());

export const canRestoreFarmer = (role: unknown): boolean =>
  ['ADMIN', 'MANAGER'].includes(String(role || '').toUpperCase());

export const canDeactivateFarmer = (role: unknown): boolean =>
  String(role || '').toUpperCase() === 'ADMIN';

/** A farmer is "inactive" when the row carries a soft-delete stamp. */
export const isFarmerActive = (farmer: { deletedAt?: string | null | Date } | null | undefined): boolean =>
  !!farmer && (farmer.deletedAt === null || farmer.deletedAt === undefined);

export const farmersQueryFor = (status: 'active' | 'inactive' | 'all'): Record<string, string> =>
  status === 'active' ? {} : { status };
