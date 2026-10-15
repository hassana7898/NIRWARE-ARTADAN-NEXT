/**
 * Pure domain logic for Operator Quick Remittance (ثبت سریع حواله).
 * Pure and unit-testable.
 */

export interface QuickRemittanceInput {
  type: 'entry' | 'exit';
  date: string;
  productId: string;
  productName?: string;
  scaleWeight: number;
  billWeight?: number;
  driverName?: string;
  driverPhone?: string;
  invoiceNumber?: string;
  billNumber?: string;
  farmerId?: string;
  sellerName?: string;
  notes?: string;
}

export const validateQuickRemittance = (
  input: Partial<QuickRemittanceInput>
): { valid: boolean; error?: string } => {
  if (!input.type || (input.type !== 'entry' && input.type !== 'exit')) {
    return { valid: false, error: 'نوع حواله (ورودی یا خروجی) باید مشخص باشد.' };
  }
  if (!input.productId || !input.productId.trim()) {
    return { valid: false, error: 'انتخاب نوع کالا الزامی است.' };
  }
  const scale = Number(input.scaleWeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    return { valid: false, error: 'وزن باسکول باید مقداری مثبت و معتبر باشد.' };
  }
  if (!input.date || !input.date.trim()) {
    return { valid: false, error: 'تاریخ حواله الزامی است.' };
  }
  if (input.type === 'exit' && !input.farmerId && !input.notes) {
    // Exit invoices usually require a farmer or customer
    return { valid: false, error: 'برای حواله خروج، انتخاب مرغدار یا ثبت نام مشتری در توضیحات الزامی است.' };
  }
  return { valid: true };
};

export const buildQuickRemittancePayload = (
  input: QuickRemittanceInput
): Record<string, any> => {
  const payload: Record<string, any> = {
    type: input.type,
    date: input.date.trim(),
    productId: input.productId.trim(),
    scaleWeight: Number(input.scaleWeight),
  };

  if (input.productName) payload.productName = input.productName.trim();
  if (input.billWeight && Number(input.billWeight) > 0) payload.billWeight = Number(input.billWeight);
  if (input.type === 'exit') {
    // In NIR schema, exit invoices carry weight as the main weight column
    payload.weight = Number(input.scaleWeight);
  }
  if (input.driverName) payload.driverName = input.driverName.trim();
  if (input.driverPhone) payload.driverPhone = input.driverPhone.trim();
  if (input.invoiceNumber) payload.invoiceNumber = input.invoiceNumber.trim();
  if (input.billNumber) payload.billNumber = input.billNumber.trim();
  if (input.farmerId) payload.farmerId = input.farmerId.trim();
  if (input.sellerName) payload.sellerName = input.sellerName.trim();
  if (input.notes) payload.notes = input.notes.trim();

  return payload;
};
