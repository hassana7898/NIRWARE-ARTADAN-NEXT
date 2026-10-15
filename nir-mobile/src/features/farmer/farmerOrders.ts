/**
 * Pure domain logic for Farmer Orders (G-9).
 * Fully decoupled from UI and testable without React Native runtime.
 */

export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface FarmerOrder {
  id: number;
  productId: string | null;
  productName: string;
  requestedWeight: number;
  targetDate: string;
  notes: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFormInput {
  productId: string;
  requestedWeightKg: number;
  targetDate: string;
  notes?: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'در انتظار تأیید',
  approved: 'تأیید شده (در حال تولید/ارسال)',
  rejected: 'رد شده',
  completed: 'تحویل شده',
};

export const orderStatusLabel = (status: string): string => {
  const s = String(status || '').toLowerCase() as OrderStatus;
  return ORDER_STATUS_LABELS[s] || status || 'نامشخص';
};

export const orderStatusVariant = (
  status: string
): 'warning' | 'success' | 'danger' | 'info' | 'pending' => {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'approved':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'completed':
      return 'info';
    case 'pending':
    default:
      return 'warning';
  }
};

export const validateOrderInput = (
  input: Partial<OrderFormInput>
): { valid: boolean; error?: string } => {
  if (!input.productId || !input.productId.trim()) {
    return { valid: false, error: 'انتخاب نوع کالا الزامی است.' };
  }
  const weight = Number(input.requestedWeightKg);
  if (!Number.isFinite(weight) || weight <= 0) {
    return { valid: false, error: 'تناژ درخواستی باید بزرگتر از صفر باشد.' };
  }
  if (!input.targetDate || !input.targetDate.trim()) {
    return { valid: false, error: 'تعیین تاریخ پیشنهادی تحویل الزامی است.' };
  }
  return { valid: true };
};

export const normalizeOrderRow = (row: any): FarmerOrder => {
  const rawStatus = String(row?.status || 'pending').toLowerCase();
  const validStatus: OrderStatus =
    rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'completed'
      ? rawStatus
      : 'pending';

  return {
    id: Number(row?.id) || 0,
    productId: row?.productId ? String(row?.productId) : null,
    productName: row?.productName ? String(row?.productName) : 'دان مصرفی',
    requestedWeight: Number(row?.requestedWeight) || 0,
    targetDate: String(row?.targetDate || ''),
    notes: row?.notes ? String(row?.notes) : null,
    status: validStatus,
    createdAt: String(row?.createdAt || ''),
    updatedAt: String(row?.updatedAt || ''),
  };
};
