import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orderStatusLabel,
  orderStatusVariant,
  validateOrderInput,
  normalizeOrderRow,
} from '../src/features/farmer/farmerOrders';
import {
  quotaUsageColor,
  normalizeStatement,
} from '../src/features/farmer/farmerStatement';
import {
  validateQuickRemittance,
  buildQuickRemittancePayload,
  type QuickRemittanceInput,
} from '../src/features/operator/quickRemittance';

test('Phase 3 Domain Logic: Farmer Orders (G-9)', async (t) => {
  await t.test('orderStatusLabel maps all known statuses to Persian and handles unknown', () => {
    assert.equal(orderStatusLabel('pending'), 'در انتظار تأیید');
    assert.equal(orderStatusLabel('approved'), 'تأیید شده (در حال تولید/ارسال)');
    assert.equal(orderStatusLabel('rejected'), 'رد شده');
    assert.equal(orderStatusLabel('completed'), 'تحویل شده');
    assert.equal(orderStatusLabel('CUSTOM_STATE'), 'CUSTOM_STATE');
    assert.equal(orderStatusLabel(''), 'نامشخص');
  });

  await t.test('orderStatusVariant maps statuses to appropriate UI badge variants', () => {
    assert.equal(orderStatusVariant('pending'), 'warning');
    assert.equal(orderStatusVariant('approved'), 'success');
    assert.equal(orderStatusVariant('rejected'), 'danger');
    assert.equal(orderStatusVariant('completed'), 'info');
    assert.equal(orderStatusVariant('other'), 'warning');
  });

  await t.test('validateOrderInput strictly rejects invalid inputs', () => {
    assert.equal(
      validateOrderInput({ productId: '', requestedWeightKg: 5000, targetDate: '1403/07/25' }).valid,
      false
    );
    assert.equal(
      validateOrderInput({ productId: 'p1', requestedWeightKg: 0, targetDate: '1403/07/25' }).valid,
      false
    );
    assert.equal(
      validateOrderInput({ productId: 'p1', requestedWeightKg: -100, targetDate: '1403/07/25' }).valid,
      false
    );
    assert.equal(
      validateOrderInput({ productId: 'p1', requestedWeightKg: 5000, targetDate: '' }).valid,
      false
    );
    assert.equal(
      validateOrderInput({ productId: 'p1', requestedWeightKg: 10000, targetDate: '1403/07/25' }).valid,
      true
    );
  });

  await t.test('normalizeOrderRow parses server row safely with defaults', () => {
    const raw = {
      id: '42',
      productId: 'p_feed_grower',
      productName: 'میان‌دان پلت',
      requestedWeight: '12000',
      targetDate: '1403/08/01',
      notes: 'تخلیه فله در انبار ۲',
      status: 'APPROVED',
      createdAt: '2026-10-14T10:00:00Z',
    };
    const normalized = normalizeOrderRow(raw);
    assert.equal(normalized.id, 42);
    assert.equal(normalized.productId, 'p_feed_grower');
    assert.equal(normalized.productName, 'میان‌دان پلت');
    assert.equal(normalized.requestedWeight, 12000);
    assert.equal(normalized.status, 'approved');
    assert.equal(normalized.notes, 'تخلیه فله در انبار ۲');
  });
});

test('Phase 3 Domain Logic: Farmer Statement & Quota', async (t) => {
  await t.test('quotaUsageColor provides correct semantic threshold colors', () => {
    assert.equal(quotaUsageColor(40), '#10b981'); // Green
    assert.equal(quotaUsageColor(74), '#10b981');
    assert.equal(quotaUsageColor(75), '#f59e0b'); // Amber
    assert.equal(quotaUsageColor(94), '#f59e0b');
    assert.equal(quotaUsageColor(95), '#ef4444'); // Red
    assert.equal(quotaUsageColor(110), '#ef4444');
  });

  await t.test('normalizeStatement computes summary tonnages and safe defaults', () => {
    const raw = {
      farmer: { id: 'fmr_1', name: 'مرغداری بهاران' },
      activeBrood: {
        id: 'brd_1',
        name: 'دوره پاییز ۱۴۰۳',
        chickCount: 20000,
        herdAgeDays: 32,
        startDate: '1403/06/15',
      },
      summary: {
        totalQuotaKg: 80000,
        totalDeliveredKg: 60000,
        invoicesCount: 6,
      },
      breakdown: [
        {
          productId: 'p1',
          productName: 'پیش‌دان',
          quotaKg: 20000,
          deliveredKg: 20000,
          remainingKg: 0,
          usagePercentage: 100,
        },
      ],
      invoices: [
        {
          id: 'inv_1',
          invoiceNumber: '1001',
          date: '1403/07/01',
          scaleWeight: 10050,
          billWeight: 10000,
          toleranceStatus: 'matched',
        },
      ],
    };

    const result = normalizeStatement(raw);
    assert.equal(result.farmer?.name, 'مرغداری بهاران');
    assert.equal(result.activeBrood?.chickCount, 20000);
    assert.equal(result.summary.totalQuotaTon, 80);
    assert.equal(result.summary.totalDeliveredTon, 60);
    assert.equal(result.summary.totalRemainingTon, 20);
    assert.equal(result.summary.overallUsagePercentage, 75);
    assert.equal(result.breakdown.length, 1);
    assert.equal(result.invoices.length, 1);
    assert.equal(result.invoices[0].toleranceStatus, 'matched');
  });
});

test('Phase 3 Domain Logic: Operator Quick Remittance', async (t) => {
  await t.test('validateQuickRemittance checks required fields strictly', () => {
    const invalidNoProduct: QuickRemittanceInput = {
      type: 'exit',
      date: '1403/07/25',
      productId: '',
      scaleWeight: 15000,
      notes: 'مشتری آزاد',
    };
    assert.equal(validateQuickRemittance(invalidNoProduct).valid, false);

    const invalidNoScaleWeight: QuickRemittanceInput = {
      type: 'exit',
      date: '1403/07/25',
      productId: 'p1',
      scaleWeight: 0,
      notes: 'مشتری آزاد',
    };
    assert.equal(validateQuickRemittance(invalidNoScaleWeight).valid, false);

    const invalidExitNoParty: QuickRemittanceInput = {
      type: 'exit',
      date: '1403/07/25',
      productId: 'p1',
      scaleWeight: 15000,
      // Missing farmerId and notes
    };
    assert.equal(validateQuickRemittance(invalidExitNoParty).valid, false);

    const validExit: QuickRemittanceInput = {
      type: 'exit',
      date: '1403/07/25',
      productId: 'p1',
      scaleWeight: 15000,
      farmerId: 'fmr_1',
      driverName: 'علی راننده',
    };
    assert.equal(validateQuickRemittance(validExit).valid, true);

    const validEntry: QuickRemittanceInput = {
      type: 'entry',
      date: '1403/07/25',
      productId: 'p2',
      scaleWeight: 22000,
      billWeight: 22100,
      sellerName: 'تأمین‌کننده غلات',
    };
    assert.equal(validateQuickRemittance(validEntry).valid, true);
  });

  await t.test('buildQuickRemittancePayload correctly shapes backend payload', () => {
    const exitInput: QuickRemittanceInput = {
      type: 'exit',
      date: '1403/07/25',
      productId: 'prd_finisher',
      productName: 'پس‌دان طیور',
      scaleWeight: 12500,
      farmerId: 'fmr_1',
      driverName: 'حسین رضایی',
      driverPhone: '09123334455',
      invoiceNumber: 'EX-9988',
      notes: 'تحویل فوری',
    };

    const payload = buildQuickRemittancePayload(exitInput);
    assert.equal(payload.type, 'exit');
    assert.equal(payload.date, '1403/07/25');
    assert.equal(payload.productId, 'prd_finisher');
    assert.equal(payload.scaleWeight, 12500);
    assert.equal(payload.weight, 12500);
    assert.equal(payload.farmerId, 'fmr_1');
    assert.equal(payload.driverName, 'حسین رضایی');
    assert.equal(payload.invoiceNumber, 'EX-9988');
    assert.equal(payload.notes, 'تحویل فوری');
  });
});
