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
import { buildInvoiceQuery } from '../src/features/manager/remittanceList';
import {
  buildMapPayload,
  buildCreateRemittancePayload,
  canCreateRemittance,
  canMapTicket,
  canUnmapTicket,
  inferredDirection,
  isTicketNetted,
  readWeighbridgeOutcome,
  validateCreateRemittance,
} from '../src/features/manager/weighbridgeActions';

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

test('Phase 2 - Weighbridge mobile operations contract', async (t) => {
  const ticket = {
    id: 4491,
    ticketNumber: 'TK-8841',
    plateNumber: '۴۵ ب ۱۲۳ ایران ۱۰',
    driverName: 'رضا کریمی',
    grossWeight: 26400,
    tareWeight: 13950,
    netWeight: 12450,
    status: 'unmapped',
    isMapped: false,
  };

  await t.test('map payload carries only the invoiceId', () => {
    assert.deepEqual(buildMapPayload({ ticketId: 4491, invoiceId: ' inv-77 ' }), { invoiceId: 'inv-77' });
    assert.deepEqual(buildMapPayload({ ticketId: 1, invoiceId: '' }), { invoiceId: '' });
  });

  await t.test('a ticket that is already linked cannot be mapped again (server 409s it)', () => {
    assert.equal(canMapTicket(ticket as any), true);
    assert.equal(canMapTicket({ ...ticket, isMapped: true } as any), false);
    // A re-map to the SAME invoice is the only legal no-op.
    assert.equal(
      canMapTicket({ ...ticket, isMapped: true, mappedRemittanceId: 'inv-77' } as any, 'inv-77'),
      true
    );
    assert.equal(
      canMapTicket({ ...ticket, isMapped: true, mappedRemittanceId: 'inv-77' } as any, 'inv-88'),
      false
    );
  });

  await t.test('unmap and create are exactly inverse gates', () => {
    const linked = { ...ticket, isMapped: true, mappedRemittanceId: 'inv-77' };
    assert.equal(canUnmapTicket(ticket as any), false);
    assert.equal(canUnmapTicket(linked as any), true);
    assert.equal(canCreateRemittance(ticket as any), true);
    assert.equal(canCreateRemittance(linked as any), false);
  });

  await t.test('netted requires BOTH weighings (the half-weighed-ticket rule)', () => {
    assert.equal(isTicketNetted(ticket as any), true);
    assert.equal(isTicketNetted({ ...ticket, grossWeight: 26400, tareWeight: 0 } as any), false);
    assert.equal(isTicketNetted({ ...ticket, grossWeight: 0, tareWeight: 13950 } as any), false);
    assert.equal(isTicketNetted({ ...ticket, netWeight: 0 } as any), false);
  });

  await t.test('the server infers exit from a net weight, entry without one', () => {
    assert.equal(inferredDirection(ticket as any), 'exit');
    assert.equal(inferredDirection({ ...ticket, netWeight: 0 } as any), 'entry');
  });

  await t.test('create-remittance validation refuses the same shapes the server 400s', () => {
    assert.equal(
      validateCreateRemittance({ ticketId: 4491, type: 'exit', productId: '' }).valid,
      false
    );
    assert.equal(
      validateCreateRemittance({ ticketId: 4491, type: 'exit', productId: 'p1', weight: 0 }).valid,
      false
    );
    assert.equal(
      validateCreateRemittance({ ticketId: 4491, type: 'exit', productId: 'p1', weight: -5 }).valid,
      false
    );
    assert.equal(
      validateCreateRemittance({ ticketId: 4491, type: 'exit', productId: 'p1', date: 'garbage' }).valid,
      false
    );
    assert.equal(
      validateCreateRemittance({ ticketId: 4491, type: 'exit', productId: 'p1', weight: 12450 }).valid,
      true
    );
  });

  await t.test('create-remittance payload sends real input, normalised, in Jalali', () => {
    const payload = buildCreateRemittancePayload({
      ticketId: 4491,
      type: 'exit',
      productId: ' prod-grower-2 ',
      weight: 12450,
      date: '2025-09-16',
      farmerName: '  مرغداری دره سرخ  ',
      farmerId: 'far-01',
      notes: '   ',
      productName: '',
    });
    assert.equal(payload.type, 'exit');
    assert.equal(payload.productId, 'prod-grower-2');
    assert.equal(payload.weight, 12450);
    // An ISO date is normalised to the column's canonical Jalali form before it is sent.
    assert.equal(payload.date, '1404/06/25');
    assert.equal(payload.farmerName, 'مرغداری دره سرخ');
    assert.equal(payload.farmerId, 'far-01');
    // Blank strings are never sent: the server would store them as empty values.
    assert.equal('notes' in payload, false);
    assert.equal('productName' in payload, false);
    assert.equal('driverName' in payload, false);
  });

  await t.test('an existing Jalali date is passed through verbatim', () => {
    const payload = buildCreateRemittancePayload({
      ticketId: 4491,
      type: 'entry',
      productId: 'p-raw',
      date: '1404/06/25',
    });
    assert.equal(payload.date, '1404/06/25');
  });

  await t.test('a write outcome is never a silent success', () => {
    const serverFail = readWeighbridgeOutcome(409, { success: false, error: 'این حواله قبلاً متصل شده است' }, 'x');
    assert.equal(serverFail.ok, false);
    assert.equal(serverFail.error, true);
    assert.match(serverFail.message, /متصل شده/);

    const ok = readWeighbridgeOutcome(200, { success: true, message: 'تخصیص یافت' }, 'x');
    assert.equal(ok.ok, true);
    assert.equal(ok.error, false);
    assert.equal(ok.message, 'تخصیص یافت');

    // success:false inside a 200 must still be a failure.
    const softFail = readWeighbridgeOutcome(200, { success: false }, 'پیش‌فرض');
    assert.equal(softFail.ok, false);

    // A non-2xx without a readable body still gets a specific Persian message.
    const notFound = readWeighbridgeOutcome(404, {}, 'x');
    assert.match(notFound.message, /یافت نشد/);
    const forbidden = readWeighbridgeOutcome(403, {}, 'x');
    assert.match(forbidden.message, /دسترسی/);
  });
});

test('Phase 2 - remittance farmer filter reaches the server query', async (t) => {
  await t.test('farmerId and productId are forwarded when present', () => {
    const q = buildInvoiceQuery({ tab: 'exit', farmerId: ' far-01 ', productId: ' prod-9 ' });
    assert.equal(q.farmerId, 'far-01');
    assert.equal(q.productId, 'prod-9');
  });

  await t.test('blank filters are omitted so they cannot narrow the result', () => {
    const q = buildInvoiceQuery({ tab: 'entry', farmerId: '   ', productId: null });
    assert.equal('farmerId' in q, false);
    assert.equal('productId' in q, false);
  });

  await t.test('the other parameters are unchanged', () => {
    const q = buildInvoiceQuery({
      tab: 'exit',
      search: '  کریمی  ',
      startDate: '1404/06/25',
      endDate: 'garbage',
      page: 3,
      pageSize: 500,
      farmerId: 'far-01',
    });
    assert.equal(q.type, 'exit');
    assert.equal(q.search, 'کریمی');
    assert.equal(q.startDate, '1404/06/25');
    assert.equal('endDate' in q, false);
    assert.equal(q.page, 3);
    assert.equal(q.limit, 200);
    assert.equal(q.farmerId, 'far-01');
  });
});