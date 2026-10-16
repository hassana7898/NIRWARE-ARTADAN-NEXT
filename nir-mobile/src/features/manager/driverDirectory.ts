/**
 * Pure helpers for mobile DRIVER management (list / create / edit / activate-deactivate).
 *
 * Contract source: `server/routes/drivers.ts`
 *   GET    /api/drivers            any authenticated role   (`?status=active|inactive|all`)
 *   POST   /api/drivers            ADMIN | MANAGER | OPERATOR  (upsert by name == create AND edit)
 *   DELETE /api/drivers/:name      ADMIN | MANAGER             (soft delete == deactivate)
 *
 * Critical domain rule this file encodes: a driver's `id` IS their trimmed name, and the row is only
 * ever SOFT deleted. Therefore editing must never silently rename a driver (that would create a
 * second row and leave every historical invoice pointing at the old one); the name is locked while
 * editing and only `phone` / `iban` may change. Reactivation is a re-POST of the same name, which the
 * route's `onConflictDoUpdate` turns into `deleted_at = null`.
 */

export const DRIVER_NAME_LOCKED_MESSAGE =
  'نام راننده شناسهٔ پروندهٔ او است؛ برای حفظ سوابق حواله‌ها قابل تغییر نیست.';

export interface DriverFormInput {
  name?: string;
  phone?: string | null;
  iban?: string | null;
}

export interface DriverValidation {
  valid: boolean;
  errors: Partial<Record<'name' | 'phone' | 'iban', string>>;
}

const digitsOnly = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

/**
 * `isEdit` locks the name: the server keys the driver on the name, so a rename would fork the file.
 * Name is required on create (the route 400s without it).
 */
export const validateDriverInput = (
  input: DriverFormInput & { isEdit?: boolean }
): DriverValidation => {
  const errors: DriverValidation['errors'] = {};
  const name = String(input.name ?? '').trim();
  if (!input.isEdit && !name) errors.name = 'نام راننده الزامی است.';
  if (input.isEdit && !name) errors.name = DRIVER_NAME_LOCKED_MESSAGE;

  const rawPhone = String(input.phone ?? '').trim();
  if (rawPhone) {
    const digits = digitsOnly(rawPhone);
    if (digits.length < 8 || digits.length > 13) errors.phone = 'شماره تماس معتبر نیست.';
  }

  const rawIban = String(input.iban ?? '').replace(/\s/g, '');
  if (rawIban && !/^IR\d{24}$/i.test(rawIban)) {
    errors.iban = 'شماره شبا باید با IR و ۲۴ رقم باشد.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

/** Shape the POST route reads: `{ name, phone, iban }`. Blank optionals become NULL; the phone is
 *  normalised to digits so the stored value is stable across searches. */
export const buildDriverPayload = (input: DriverFormInput): Record<string, unknown> => {
  const iban = String(input.iban ?? '').replace(/\s/g, '').toUpperCase();
  const phone = digitsOnly(input.phone);
  return {
    name: String(input.name ?? '').trim(),
    phone: phone === '' ? null : phone,
    iban: iban === '' ? null : iban,
  };
};

/**
 * Capability matrix (route guards).
 *   create / edit (POST): ADMIN | MANAGER | OPERATOR
 *   deactivate (DELETE) : ADMIN | MANAGER
 */
export const canCreateDriver = (role: unknown): boolean =>
  ['ADMIN', 'MANAGER', 'OPERATOR'].includes(String(role || '').toUpperCase());

export const canEditDriver = (role: unknown): boolean => canCreateDriver(role);

export const canDeactivateDriver = (role: unknown): boolean =>
  ['ADMIN', 'MANAGER'].includes(String(role || '').toUpperCase());

export interface DriverRow {
  id: string;
  name: string;
  phone: string | null;
  iban: string | null;
  deletedAt?: string | null;
}

export const normalizeDriverRow = (raw: unknown): DriverRow | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? '').trim();
  const id = String(row.id ?? name).trim();
  if (!name && !id) return null;
  return {
    id: id || name,
    name: name || id,
    phone: row.phone == null || String(row.phone).trim() === '' ? null : String(row.phone),
    iban: row.iban == null || String(row.iban).trim() === '' ? null : String(row.iban),
    deletedAt: row.deletedAt == null ? null : String(row.deletedAt),
  };
};

export const normalizeDriverRows = (raw: unknown): DriverRow[] => {
  const list = Array.isArray(raw) ? raw : [];
  return list.map(normalizeDriverRow).filter((d): d is DriverRow => d !== null);
};

export const isDriverActive = (driver: DriverRow | null | undefined): boolean =>
  !!driver && (driver.deletedAt === null || driver.deletedAt === undefined);

/** Digits-aware search over name/phone so "0912" finds "0912 345 6789". */
export const filterDrivers = (drivers: DriverRow[], search?: string | null): DriverRow[] => {
  const term = String(search ?? '').trim().toLowerCase();
  if (!term) return drivers;
  const digits = term.replace(/[^\d]/g, '');
  return drivers.filter((driver) => {
    if (driver.name.toLowerCase().includes(term)) return true;
    const phone = String(driver.phone || '');
    return digits.length > 1 ? phone.replace(/[^\d]/g, '').includes(digits) : phone.toLowerCase().includes(term);
  });
};

export const driversQueryFor = (status: 'active' | 'inactive' | 'all'): Record<string, string> =>
  status === 'active' ? {} : { status };
