process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server';
import { db } from '../server/db';
import { delivery_proofs, drivers, farmer_orders, farmers, invoices, otp_codes, products, users } from '../server/db/schema';
import { and, desc, eq, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateSync } from 'otplib';
import { generateTotpSecret } from '../server/services/totp';
import { normalizePersianText } from '../shared/persianText';

test('Mobile API Endpoints Test Suite', async (t) => {
  // Start server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testDriverPhone = '09129990001';
  const testFarmerPhone = '09129990002';
  const testDriverId = `test-drv-${Date.now()}`;
  const testFarmerId = `test-fmr-${Date.now()}`;
  const testAdminId = `test-adm-${Date.now()}`;
  const testPassword = 'AdminSecret123!';

  // Clean up any stale records from previous runs
  await db.delete(users).where(or(eq(users.phone, testDriverPhone), eq(users.username, testDriverPhone))).catch(() => {});
  await db.delete(users).where(or(eq(users.phone, testFarmerPhone), eq(users.username, testFarmerPhone))).catch(() => {});
  await db.delete(users).where(eq(users.username, 'mobile_admin_test')).catch(() => {});
  await db.delete(drivers).where(or(eq(drivers.name, 'علی راننده تست'), eq(drivers.phone, testDriverPhone))).catch(() => {});
  await db.delete(farmers).where(or(eq(farmers.name, 'مرغداری البرز تست'), eq(farmers.phone, testFarmerPhone))).catch(() => {});
  await db.delete(otp_codes).where(eq(otp_codes.phone, testDriverPhone)).catch(() => {});

  // Seed test records
  await db.insert(drivers).values({
    id: testDriverId,
    name: 'علی راننده تست',
    phone: testDriverPhone,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(farmers).values({
    id: testFarmerId,
    name: 'مرغداری البرز تست',
    phone: testFarmerPhone,
    broods: [
      { id: 'b1', name: 'دوره تابستان', startDate: '1404/05/01', flockCount: 15000 }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  const passwordHash = await bcrypt.hash(testPassword, 10);
  await db.insert(users).values({
    id: testAdminId,
    username: 'mobile_admin_test',
    passwordHash,
    role: 'ADMIN',
    fullName: 'مدیر تست موبایل',
    is2faEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await t.test('GET /api/mobile/meta returns versioning and server state', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/meta`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(typeof body.minAppVersion, 'string');
    assert.equal(typeof body.currentAppVersion, 'string');
    assert.equal(typeof body.maintenanceMode, 'boolean');
    assert.ok(body.todayJalali);
  });

  await t.test('POST /api/mobile/auth/otp/request rejects invalid phone format', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '12345' }),
    });
    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.ok(body.error);
  });

  let driverOtpCode = '';
  await t.test('POST /api/mobile/auth/otp/request accepts valid phone and stores code', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testDriverPhone }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.expiresIn, 120);

    driverOtpCode = body.debugCode;
    if (!driverOtpCode) {
      const rows = await db
        .select()
        .from(otp_codes)
        .where(eq(otp_codes.phone, testDriverPhone))
        .orderBy(desc(otp_codes.createdAt))
        .limit(1);
      assert.ok(rows.length > 0);
      driverOtpCode = rows[0].code;
    }
    assert.equal(driverOtpCode.length, 6);
  });

  await t.test('POST /api/mobile/auth/otp/verify rejects invalid code', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testDriverPhone, code: '000000' }),
    });
    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.ok(body.error);
  });

  let driverAccessToken = '';
  let driverRefreshToken = '';
  await t.test('POST /api/mobile/auth/otp/verify verifies code and issues driver session', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testDriverPhone, code: driverOtpCode }),
    });
    const body: any = await res.json();
    if (res.status !== 200) {
      console.error('Verify response error:', res.status, body);
    }
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);
    assert.equal(body.user.role, 'DRIVER');
    assert.equal(body.user.driverId, testDriverId);
    driverAccessToken = body.accessToken;
    driverRefreshToken = body.refreshToken;
  });

  await t.test('POST /api/mobile/auth/refresh rotates tokens successfully', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: driverRefreshToken }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.accessToken);
    assert.ok(body.refreshToken);
    driverAccessToken = body.accessToken;
  });

  await t.test('GET /api/mobile/driver/loads returns driver load queues', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/driver/loads`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    const body: any = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.driver);
    assert.equal(body.driver.id, testDriverId);
    assert.ok(Array.isArray(body.activeLoads));
    assert.ok(Array.isArray(body.completedLoads));
  });

  let adminAccessToken = '';
  await t.test('POST /api/mobile/auth/login logs in manager/admin credentials', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mobile_admin_test', password: testPassword }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.accessToken);
    assert.equal(body.user.role, 'ADMIN');
    adminAccessToken = body.accessToken;
  });

  await t.test('GET /api/mobile/manager/kpi returns live operational KPIs', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/manager/kpi`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(body.todayJalali);
    assert.equal(typeof body.entryTonnageKg, 'number');
    assert.equal(typeof body.exitTonnageKg, 'number');
    assert.ok(Array.isArray(body.inventory));
  });

  await t.test('POST /api/mobile/device-token registers push token', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/device-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAccessToken}`,
      },
      body: JSON.stringify({ token: 'fcm_test_token_123456789', platform: 'android' }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
  });

  // ------------------------------------------------------------------------------------------
  // Phase 1 additions: POD contract (canonical path + deprecated alias + idempotency) and the
  // three manager cartable endpoints that used to exist only inside the client's mock engine.
  // ------------------------------------------------------------------------------------------
  const testProductId = `test-prd-${Date.now()}`;
  const testInvoiceId = `test-inv-${Date.now()}`;
  const testOrderId = `test-order-${Date.now()}`;

  await t.test('POST /api/mobile/driver/proof (deprecated alias) stores the receipt with a driver FK', async () => {
    await db.insert(products).values({
      id: testProductId,
      name: 'Test Feed',
      type: 'finished',
      unit: 'kg',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    await db.insert(invoices).values({
      id: testInvoiceId,
      type: 'exit',
      date: '1404/01/01',
      productId: testProductId,
      invoiceNumber: 'TEST-0001',
      driverId: testDriverId,
      driverName: 'Test Driver',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    const res = await fetch(`${baseUrl}/api/mobile/driver/proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAccessToken}`,
      },
      body: JSON.stringify({
        invoice_id: testInvoiceId,
        signature_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wBHq2v0AAAAAElFTkSuQmCC',
        latitude: 35.7,
        longitude: 51.4,
      }),
    });
    assert.equal(res.status, 201);
    const body: any = await res.json();
    assert.equal(body.success, true);
    // The regression this test locks down: driver_id used to receive the invoice's driver *name*.
    assert.equal(body.proof.driverId, testDriverId);
    assert.ok(body.proof.signatureUrl, 'the base64 signature must be persisted as an upload path');
  });

  await t.test('POST /api/mobile/driver/delivery-receipt twice is idempotent', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/driver/delivery-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAccessToken}`,
      },
      body: JSON.stringify({ invoice_id: testInvoiceId, latitude: 35.7, longitude: 51.4 }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.alreadyRegistered, true);

    const stored = await db
      .select()
      .from(delivery_proofs)
      .where(eq(delivery_proofs.invoiceId, testInvoiceId));
    assert.equal(stored.length, 1, 'a retry must not create a second delivery receipt');
  });

  await t.test('GET /api/mobile/manager/orders returns the cartable payload for a manager', async () => {
    await db.insert(farmer_orders).values({
      farmerId: testFarmerId,
      productId: testProductId,
      requestedWeight: '5000.00',
      targetDate: '1404/02/01',
      notes: 'Phase 1 cartable test',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    const res = await fetch(`${baseUrl}/api/mobile/manager/orders`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.orders));
    assert.ok(body.orders.some((o: any) => o.productName === 'Test Feed'));
  });

  await t.test('GET /api/mobile/manager/orders is forbidden for a driver token', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/manager/orders`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    assert.equal(res.status, 403);
  });

  await t.test('PATCH /api/mobile/manager/orders/:id validates and applies the status', async () => {
    const pending = await db
      .select()
      .from(farmer_orders)
      .where(and(eq(farmer_orders.status, 'pending'), eq(farmer_orders.notes, 'Phase 1 cartable test')))
      .limit(1);
    assert.ok(pending.length > 0);
    const orderId = pending[0].id;

    const badRes = await fetch(`${baseUrl}/api/mobile/manager/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAccessToken}` },
      body: JSON.stringify({ status: 'not-a-status' }),
    });
    assert.equal(badRes.status, 400);

    const okRes = await fetch(`${baseUrl}/api/mobile/manager/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAccessToken}` },
      body: JSON.stringify({ status: 'approved' }),
    });
    assert.equal(okRes.status, 200);
    const body: any = await okRes.json();
    assert.equal(body.success, true);
    assert.equal(body.order.status, 'approved');
  });

  await t.test('GET /api/mobile/manager/proofs lists the submitted delivery receipt', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/manager/proofs`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.proofs));
    const mine = body.proofs.find((p: any) => p.invoiceId === testInvoiceId);
    assert.ok(mine, 'the receipt submitted through the alias route must be visible to the manager');
    assert.ok(String(mine.photoBillUrl || mine.signatureUrl).startsWith('http'));
  });

  // ------------------------------------------------------------------------------------------
  // Phase 2 additions: driver trip status (G-8), load-history paging (G-16) and the manager's
  // unmatched-driver report (G-7). Every assertion below drives the real HTTP app against the real
  // database, exactly like the Phase 1 block above.
  // ------------------------------------------------------------------------------------------
  const tripInvoiceId = `test-trip-${Date.now()}`;
  const tripDeliveredId = `test-trip-pod-${Date.now()}`;
  const otherInvoiceId = `test-inv-other-${Date.now()}`;
  const otherDriverId = `test-drv-other-${Date.now()}`;
  const unmatchedDriverId = `test-drv-unmatched-${Date.now()}`;
  const unmatchedInvoiceId = `test-inv-unmatched-${Date.now()}`;
  const unmatchedDriverName = 'راهبر آزمایشی نامطابق';
  // The report groups by `textMatchKey` and DISPLAYS `normalizePersianText(name)` (the same
  // Arabic-letter folding the web app uses for farmers), so «آ» arrives as «ا» and «ي» as «ی».
  const unmatchedDriverDisplayName = normalizePersianText(unmatchedDriverName);

  await db.insert(drivers).values({
    id: otherDriverId,
    name: 'Another Driver',
    phone: '09129990009',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(drivers).values({
    id: unmatchedDriverId,
    name: unmatchedDriverName,
    phone: '09129990008',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(invoices).values({
    id: tripInvoiceId,
    type: 'exit',
    date: '1404/03/01',
    productId: testProductId,
    invoiceNumber: 'TEST-TRIP',
    driverId: testDriverId,
    driverName: 'Test Driver',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(invoices).values({
    id: tripDeliveredId,
    type: 'exit',
    date: '1404/03/02',
    productId: testProductId,
    invoiceNumber: 'TEST-TRIP-POD',
    driverId: testDriverId,
    driverName: 'Test Driver',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(invoices).values({
    id: otherInvoiceId,
    type: 'exit',
    date: '1404/03/03',
    productId: testProductId,
    invoiceNumber: 'TEST-TRIP-OTHER',
    driverId: otherDriverId,
    driverName: 'Another Driver',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(invoices).values({
    id: unmatchedInvoiceId,
    type: 'exit',
    date: '1404/03/04',
    productId: testProductId,
    invoiceNumber: 'TEST-UNMATCHED',
    // No driver_id on purpose: this is exactly the row shape the manager's unmatched report looks for.
    driverId: null,
    driverName: unmatchedDriverName,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await t.test('PATCH /api/mobile/driver/loads/:id/trip-status validates its input', async () => {
    const badStatus = await fetch(`${baseUrl}/api/mobile/driver/loads/${tripInvoiceId}/trip-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAccessToken}` },
      body: JSON.stringify({ status: 'flying' }),
    });
    assert.equal(badStatus.status, 400);

    const missing = await fetch(`${baseUrl}/api/mobile/driver/loads/no-such-invoice/trip-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAccessToken}` },
      body: JSON.stringify({ status: 'loading' }),
    });
    assert.equal(missing.status, 404);
  });

  await t.test('PATCH /api/mobile/driver/loads/:id/trip-status is forward-only and idempotent', async () => {
    const patch = async (status: string) =>
      fetch(`${baseUrl}/api/mobile/driver/loads/${tripInvoiceId}/trip-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAccessToken}` },
        body: JSON.stringify({ status }),
      });

    const loading = await patch('loading');
    assert.equal(loading.status, 200);
    const loadingBody: any = await loading.json();
    assert.equal(loadingBody.tripStatus, 'loading');
    assert.equal(loadingBody.previousStatus, 'assigned');
    assert.equal(loadingBody.unchanged, false);

    // An offline queue replaying the same report must not be an error.
    const replay = await patch('loading');
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as any).unchanged, true);

    // Going backwards is refused (a stale replay must not rewind the trip).
    const backwards = await patch('at_origin');
    assert.equal(backwards.status, 409);

    // `delivered` is the receipt's job, not a button.
    const delivered = await patch('delivered');
    assert.equal(delivered.status, 409);

    const cancelled = await patch('cancelled');
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json() as any).tripStatus, 'cancelled');

    const afterCancel = await patch('unloading');
    assert.equal(afterCancel.status, 409);
  });

  await t.test("PATCH /api/mobile/driver/loads/:id/trip-status refuses another driver's load", async () => {
    const res = await fetch(`${baseUrl}/api/mobile/driver/loads/${otherInvoiceId}/trip-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAccessToken}` },
      body: JSON.stringify({ status: 'loading' }),
    });
    assert.equal(res.status, 403);
  });

  await t.test('the delivery receipt closes the trip and locks the status', async () => {
    const receipt = await fetch(`${baseUrl}/api/mobile/driver/delivery-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAccessToken}` },
      body: JSON.stringify({
        invoice_id: tripDeliveredId,
        signature_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wBHq2v0AAAAAElFTkSuQmCC',
      }),
    });
    assert.equal(receipt.status, 201);

    const stored = await db.select().from(invoices).where(eq(invoices.id, tripDeliveredId)).limit(1);
    assert.equal(stored[0].tripStatus, 'delivered', 'the receipt must stamp the trip as delivered');
    assert.ok(stored[0].tripStatusAt, 'the receipt must record when the trip closed');

    const reopen = await fetch(`${baseUrl}/api/mobile/driver/loads/${tripDeliveredId}/trip-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAccessToken}` },
      body: JSON.stringify({ status: 'loading' }),
    });
    assert.equal(reopen.status, 409, 'a closed trip must not be reopened');
  });

  await t.test('GET /api/mobile/driver/loads pages the history and reports the trip state', async () => {
    const first = await fetch(`${baseUrl}/api/mobile/driver/loads`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    assert.equal(first.status, 200);
    const firstBody: any = await first.json();
    // Defaults keep the pre-Phase-2 answer (page 1, 100 rows, both lists) so old APKs are unaffected...
    assert.equal(firstBody.page, 1);
    assert.equal(firstBody.limit, 100);
    assert.equal(typeof firstBody.total, 'number');
    assert.equal(typeof firstBody.hasMore, 'boolean');
    assert.ok(Array.isArray(firstBody.activeLoads) && Array.isArray(firstBody.completedLoads));

    // ...while `scope` now pages exactly the list the screen renders (the POD filter runs in SQL).
    const completed = await fetch(`${baseUrl}/api/mobile/driver/loads?scope=completed&limit=2`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    const completedBody: any = await completed.json();
    assert.equal(completedBody.scope, 'completed');
    assert.ok(completedBody.completedLoads.length <= 2);
    assert.ok(completedBody.completedLoads.every((l: any) => l.hasProofOfDelivery === true));
    assert.equal(completedBody.activeLoads.length, 0);

    const active = await fetch(`${baseUrl}/api/mobile/driver/loads?scope=active&limit=2`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    const activeBody: any = await active.json();
    assert.ok(activeBody.activeLoads.every((l: any) => l.hasProofOfDelivery === false));
    assert.equal(activeBody.completedLoads.length, 0);
    assert.ok(activeBody.activeLoads.every((l: any) => typeof l.tripStatus === 'string'));

    // The page size is clamped, so a hostile client cannot ask for the whole table.
    const clamped = await fetch(`${baseUrl}/api/mobile/driver/loads?limit=9999`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    assert.equal((await clamped.json() as any).limit, 200);
  });

  await t.test('GET /api/mobile/manager/unmatched-drivers is manager-only and suggests the right driver', async () => {
    const forbidden = await fetch(`${baseUrl}/api/mobile/manager/unmatched-drivers`, {
      headers: { Authorization: `Bearer ${driverAccessToken}` },
    });
    assert.equal(forbidden.status, 403);

    const res = await fetch(
      `${baseUrl}/api/mobile/manager/unmatched-drivers?type=exit&search=${encodeURIComponent(unmatchedDriverName)}`,
      { headers: { Authorization: `Bearer ${adminAccessToken}` } },
    );
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.groups));
    assert.equal(typeof body.totalGroups, 'number');
    assert.equal(typeof body.totalInvoices, 'number');
    assert.equal(body.type, 'exit');

    const mine = body.groups.find((g: any) => g.driverName === unmatchedDriverDisplayName);
    assert.ok(mine, 'the unmapped invoice must appear in the unmatched report');
    assert.ok(mine.count >= 1);
    assert.ok(mine.exitCount >= 1, 'the filter is applied before grouping');
    assert.equal(mine.entryCount, 0);
    // The name is spelled exactly like the driver record, so the report must offer that driver - and
    // only as a suggestion (this endpoint never writes).
    assert.equal(mine.suggestedDriverId, unmatchedDriverId);
    assert.equal(mine.suggestionReason, 'name-exact');
    assert.ok(mine.sampleInvoices.includes('TEST-UNMATCHED'));
    assert.ok(mine.invoiceIds.includes(unmatchedInvoiceId));
  });

  // ------------------------------------------------------------------------------------------
  // Phase 3 additions: farmer order lifecycle, products list, statement/quota, operator monitor
  // ------------------------------------------------------------------------------------------
  let farmerAccessToken = '';
  await t.test('Farmer OTP login resolves to FARMER role', async () => {
    const otpRes = await fetch(`${baseUrl}/api/mobile/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testFarmerPhone }),
    });
    assert.equal(otpRes.status, 200);
    const otpBody: any = await otpRes.json();
    const code = otpBody.debugCode || '123456';

    const verifyRes = await fetch(`${baseUrl}/api/mobile/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testFarmerPhone, code }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody: any = await verifyRes.json();
    assert.equal(verifyBody.user.role, 'FARMER');
    farmerAccessToken = verifyBody.accessToken;
    assert.ok(farmerAccessToken);
  });

  await t.test('GET /api/mobile/farmer/products returns active finished goods (both finishedGood and legacy finished) and excludes raw materials', async () => {
    const v2FinishedId = `test-prd-fg-${Date.now()}`;
    const rawMatId = `test-prd-raw-${Date.now()}`;
    try {
      await db.insert(products).values([
        {
          id: v2FinishedId,
          name: 'دان میان‌دان پلت V2',
          type: 'finishedGood',
          unit: 'kg',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: rawMatId,
          name: 'ذرت دامی تست',
          type: 'rawMaterial',
          unit: 'kg',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await fetch(`${baseUrl}/api/mobile/farmer/products`, {
        headers: { Authorization: `Bearer ${farmerAccessToken}` },
      });
      assert.equal(res.status, 200);
      const body: any = await res.json();
      assert.ok(Array.isArray(body.products));
      // Must include both the `type: 'finished'` product (`testProductId`) and the `type: 'finishedGood'` product (`v2FinishedId`)
      const returnedIds = body.products.map((p: any) => p.id);
      assert.ok(returnedIds.includes(testProductId), 'legacy/seeded type="finished" product must be returned');
      assert.ok(returnedIds.includes(v2FinishedId), 'canonical V2 type="finishedGood" product must be returned');
      assert.ok(!returnedIds.includes(rawMatId), 'rawMaterial product must not be returned to farmer order list');
      for (const p of body.products) {
        assert.equal(p.type, 'finishedGood', 'returned product type must be normalised to finishedGood');
      }
    } finally {
      await db.delete(products).where(eq(products.id, v2FinishedId)).catch(() => {});
      await db.delete(products).where(eq(products.id, rawMatId)).catch(() => {});
    }
  });

  const phase3OpId = `op-phase3-order-${Date.now()}`;
  await t.test('POST /api/mobile/farmer/orders creates order with X-Operation-Id and validates productId', async () => {
    // Bad product id
    const badRes = await fetch(`${baseUrl}/api/mobile/farmer/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${farmerAccessToken}` },
      body: JSON.stringify({
        productId: 'non-existent-product',
        requestedWeight: 12000,
        targetDate: '1405/07/28',
      }),
    });
    assert.equal(badRes.status, 400);

    // Valid order with X-Operation-Id
    const okRes = await fetch(`${baseUrl}/api/mobile/farmer/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farmerAccessToken}`,
        'X-Operation-Id': phase3OpId,
      },
      body: JSON.stringify({
        productId: testProductId,
        requestedWeight: 15000,
        targetDate: '1405/07/28',
        notes: 'تست سفارش فاز ۳',
      }),
    });
    assert.equal(okRes.status, 201);
    const body: any = await okRes.json();
    assert.equal(body.success, true);
    assert.ok(body.order.id);
    assert.equal(body.order.productName, 'Test Feed');

    // Replay with same X-Operation-Id returns idempotent result
    const replayRes = await fetch(`${baseUrl}/api/mobile/farmer/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farmerAccessToken}`,
        'X-Operation-Id': phase3OpId,
      },
      body: JSON.stringify({
        productId: testProductId,
        requestedWeight: 15000,
        targetDate: '1405/07/28',
        notes: 'تست سفارش فاز ۳',
      }),
    });
    assert.equal(replayRes.status, 201);
  });

  await t.test('GET /api/mobile/farmer/orders returns orders for the authenticated farmer', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/farmer/orders`, {
      headers: { Authorization: `Bearer ${farmerAccessToken}` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.orders));
    assert.ok(body.orders.length >= 1);
    const created = body.orders.find((o: any) => o.notes === 'تست سفارش فاز ۳');
    assert.ok(created);
    assert.equal(created.requestedWeight, 15000);
    assert.equal(created.status, 'pending');
  });

  await t.test('GET /api/mobile/farmer/statement returns quota, delivered and breakdown', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/farmer/statement`, {
      headers: { Authorization: `Bearer ${farmerAccessToken}` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(body.farmer);
    assert.ok(body.summary);
    assert.equal(typeof body.summary.totalQuotaKg, 'number');
    assert.equal(typeof body.summary.totalDeliveredKg, 'number');
    assert.equal(typeof body.summary.totalRemainingKg, 'number');
    assert.ok(Array.isArray(body.breakdown));
    assert.ok(Array.isArray(body.invoices));
  });

  await t.test('Farmer brood lifecycle: dashboard activePeriod, POST /broods, PATCH /broods/:id, and statement?broodId', async () => {
    // 1. Check initial dashboard returns both activeBrood and activePeriod + broods array
    const dashRes1 = await fetch(`${baseUrl}/api/mobile/farmer/dashboard`, {
      headers: { Authorization: `Bearer ${farmerAccessToken}` },
    });
    assert.equal(dashRes1.status, 200);
    const dash1: any = await dashRes1.json();
    assert.ok(dash1.activeBrood);
    assert.ok(dash1.activePeriod);
    assert.equal(dash1.activePeriod.id, dash1.activeBrood.id);
    assert.ok(Array.isArray(dash1.broods));
    assert.ok(dash1.broods.length >= 1);

    // 2. Create a new brood period via POST /api/mobile/farmer/broods
    const createRes = await fetch(`${baseUrl}/api/mobile/farmer/broods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farmerAccessToken}`,
      },
      body: JSON.stringify({
        name: 'دوره پاییز تست',
        startDate: '1405/07/01',
        chickCount: 22000,
      }),
    });
    assert.equal(createRes.status, 201);
    const createBody: any = await createRes.json();
    assert.equal(createBody.success, true);
    const createdBroodId = createBody.brood.id;
    assert.ok(createdBroodId);

    // 3. Update mortality and close/archive the brood via PATCH /api/mobile/farmer/broods/:broodId
    const patchRes = await fetch(`${baseUrl}/api/mobile/farmer/broods/${createdBroodId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farmerAccessToken}`,
      },
      body: JSON.stringify({
        mortalityCount: 350,
        finalWeight: 52000,
        endDate: '1405/08/20',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchBody: any = await patchRes.json();
    assert.equal(patchBody.success, true);
    assert.equal(patchBody.brood.mortalityCount, 350);
    assert.equal(patchBody.brood.finalWeight, 52000);
    assert.equal(patchBody.brood.isArchived, true);

    // 4. Fetch statement filtered by ?broodId=createdBroodId
    const stmtRes = await fetch(`${baseUrl}/api/mobile/farmer/statement?broodId=${encodeURIComponent(createdBroodId)}`, {
      headers: { Authorization: `Bearer ${farmerAccessToken}` },
    });
    assert.equal(stmtRes.status, 200);
    const stmtBody: any = await stmtRes.json();
    assert.equal(stmtBody.activeBrood.id, createdBroodId);
    assert.equal(stmtBody.summary.totalChicks, 22000);
    assert.equal(stmtBody.summary.mortalityCount, 350);
    assert.equal(stmtBody.summary.liveChicks, 21650);
    assert.equal(stmtBody.summary.finalWeight, 52000);
  });

  const testOperatorId = `test-opr-${Date.now()}`;
  const testOperatorPhone = '09129990005';
  let operatorAccessToken = '';
  await t.test('Operator user can log in and access weighbridge monitor', async () => {
    await db.insert(users).values({
      id: testOperatorId,
      username: testOperatorPhone,
      passwordHash: '',
      role: 'OPERATOR',
      fullName: 'اپراتور تست',
      phone: testOperatorPhone,
      is2faEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    const otpRes = await fetch(`${baseUrl}/api/mobile/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testOperatorPhone }),
    });
    assert.equal(otpRes.status, 200);
    const otpBody: any = await otpRes.json();
    const code = otpBody.debugCode || '123456';

    const verifyRes = await fetch(`${baseUrl}/api/mobile/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testOperatorPhone, code }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody: any = await verifyRes.json();
    assert.equal(verifyBody.user.role, 'OPERATOR');
    operatorAccessToken = verifyBody.accessToken;

    // Both manager/weighbridge and operator/weighbridge succeed for operator
    const wbRes1 = await fetch(`${baseUrl}/api/mobile/operator/weighbridge`, {
      headers: { Authorization: `Bearer ${operatorAccessToken}` },
    });
    assert.equal(wbRes1.status, 200);

    const wbRes2 = await fetch(`${baseUrl}/api/mobile/manager/weighbridge`, {
      headers: { Authorization: `Bearer ${operatorAccessToken}` },
    });
    assert.equal(wbRes2.status, 200);

    await db.delete(users).where(eq(users.id, testOperatorId)).catch(() => {});
  });

  await t.test('POST /api/mobile/auth/login supports OPERATOR password login, rejects bad credentials, and enforces 2FA (totp + totpCode)', async () => {
    const opUserId = `test-op-pwd-${Date.now()}`;
    const mgr2faId = `test-mgr-2fa-${Date.now()}`;
    const secret2fa = generateTotpSecret();

    try {
      await db.insert(users).values([
        {
          id: opUserId,
          username: 'mobile_operator_pwd_test',
          passwordHash,
          role: 'OPERATOR',
          fullName: 'اپراتور باسکول تست رمز',
          is2faEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: mgr2faId,
          username: 'mobile_manager_2fa_test',
          passwordHash,
          role: 'MANAGER',
          fullName: 'مدیر دارای ورود دو مرحله‌ای',
          is2faEnabled: true,
          totpSecret: secret2fa,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // 1. Invalid password rejected with 401
      const badRes = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'mobile_operator_pwd_test', password: 'wrong-password' }),
      });
      assert.equal(badRes.status, 401);

      // 2. OPERATOR password login succeeds and returns role OPERATOR
      const opRes = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'mobile_operator_pwd_test', password: testPassword }),
      });
      assert.equal(opRes.status, 200);
      const opBody: any = await opRes.json();
      assert.equal(opBody.success, true);
      assert.equal(opBody.user.role, 'OPERATOR');
      assert.ok(opBody.accessToken);

      // 3. 2FA Manager without code -> twoFactorRequired + requires2FA
      const step1Res = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'mobile_manager_2fa_test', password: testPassword }),
      });
      assert.equal(step1Res.status, 200);
      const step1Body: any = await step1Res.json();
      assert.equal(step1Body.success, false);
      assert.equal(step1Body.twoFactorRequired, true);
      assert.equal(step1Body.requires2FA, true);

      // 4. 2FA Manager with invalid code -> 401
      const badTotpRes = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'mobile_manager_2fa_test',
          password: testPassword,
          totp: '000000',
        }),
      });
      assert.equal(badTotpRes.status, 401);

      // 5. 2FA Manager with valid code via `totp` -> 200 + token
      const validCode = generateSync({
        strategy: 'totp',
        secret: secret2fa,
        algorithm: 'sha1',
        digits: 6,
        period: 30,
      });

      const step2Res = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'mobile_manager_2fa_test',
          password: testPassword,
          totp: validCode,
        }),
      });
      assert.equal(step2Res.status, 200);
      const step2Body: any = await step2Res.json();
      assert.equal(step2Body.success, true);
      assert.equal(step2Body.user.role, 'MANAGER');
      assert.ok(step2Body.accessToken);

      // 6. Also succeeds when client sends `totpCode`
      const step3Res = await fetch(`${baseUrl}/api/mobile/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'mobile_manager_2fa_test',
          password: testPassword,
          totpCode: validCode,
        }),
      });
      assert.equal(step3Res.status, 200);
      const step3Body: any = await step3Res.json();
      assert.equal(step3Body.success, true);
      assert.equal(step3Body.user.role, 'MANAGER');
    } finally {
      await db.delete(users).where(eq(users.id, opUserId)).catch(() => {});
      await db.delete(users).where(eq(users.id, mgr2faId)).catch(() => {});
    }
  });

  // Cleanup test artifacts
  await db.delete(delivery_proofs).where(eq(delivery_proofs.invoiceId, testInvoiceId)).catch(() => {});
  await db.delete(delivery_proofs).where(eq(delivery_proofs.invoiceId, tripDeliveredId)).catch(() => {});
  for (const invoiceId of [testInvoiceId, tripInvoiceId, tripDeliveredId, otherInvoiceId, unmatchedInvoiceId]) {
    await db.delete(invoices).where(eq(invoices.id, invoiceId)).catch(() => {});
  }
  await db.delete(drivers).where(eq(drivers.id, otherDriverId)).catch(() => {});
  await db.delete(drivers).where(eq(drivers.id, unmatchedDriverId)).catch(() => {});
  await db.delete(farmer_orders).where(eq(farmer_orders.notes, 'Phase 1 cartable test')).catch(() => {});
  await db.delete(farmer_orders).where(eq(farmer_orders.productId, testProductId)).catch(() => {});
  await db.delete(invoices).where(eq(invoices.id, testInvoiceId)).catch(() => {});
  await db.delete(products).where(eq(products.id, testProductId)).catch(() => {});
  await db.delete(users).where(eq(users.id, testAdminId)).catch(() => {});
  await db.delete(drivers).where(eq(drivers.id, testDriverId)).catch(() => {});
  await db.delete(farmers).where(eq(farmers.id, testFarmerId)).catch(() => {});

  // Close HTTP test server
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
});
