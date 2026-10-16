import React from 'react';
import { Badge, type BadgeVariant } from '../../design-system/components/Badge';

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'mismatch'
  | 'done';

interface StatusBadgeProps {
  status: StatusVariant | string;
  label?: string;
  size?: 'sm' | 'md';
}

const statusLabels: Record<string, string> = {
  success: 'موفق',
  done: 'انجام شد',
  delivered: 'تحویل شد',
  warning: 'در انتظار',
  pending: 'در حال بررسی',
  in_transit: 'در مسیر',
  error: 'خطا',
  mismatch: 'مغایرت',
  info: 'اطلاعیه',
};

/**
 * Status → design-system Badge variant. Every status pill in the app now renders through the
 * shared Badge primitive (NativeWind + cva), so admin/farmer/driver/operator screens carry the
 * exact same Slate/Emerald status language.
 */
const VARIANT_BY_STATUS: Record<string, BadgeVariant> = {
  success: 'success',
  delivered: 'success',
  done: 'success',
  approved: 'success',
  completed: 'success',
  warning: 'warning',
  pending: 'warning',
  in_transit: 'warning',
  error: 'destructive',
  mismatch: 'destructive',
  rejected: 'destructive',
  info: 'primary',
};

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const normalizedStatus = String(status || '').toLowerCase();
  const variant: BadgeVariant = VARIANT_BY_STATUS[normalizedStatus] ?? 'secondary';
  const displayText = label || statusLabels[normalizedStatus] || status;

  return (
    <Badge variant={variant} size={size === 'sm' ? 'sm' : 'default'}>
      {displayText}
    </Badge>
  );
}

export default StatusBadge;
