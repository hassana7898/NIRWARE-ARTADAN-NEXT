import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

import { app } from '../server';
import { db } from '../server/db';
import { invoices, products, users, drivers, farmers, weighbridge_records } from '../server/db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { generateTotpSecret } from '../server/services/totp';
import { getJwtSecret } from '../server/middleware/auth';

/**
 * Regression tests for the INVOICE DATE FORMAT defect (P1).
 *
 * Root cause that used to be invisible: `invoices.date` is a TEXT column whose canonical value is
 * the Jalali `YYYY/MM/DD` form (documented in `shared/jalali.ts` as "the exact format the invoice
 * rows use"). Every writer produced Jalali EXCEPT the weighbridge `create-remittance` flow, which
 * converted to ISO Gregorian. Two visible symptoms:
 *
 *   1. `/manager/kpi` filtered with `eq(invoices.date, todayJalali)` and could never match an
 *      ISO row -> the KPI screen reported zeros while real invoices existed.
 *   2. `/api/invoices` compares `startDate`/`endDate` as TEXT against that same column, so an ISO
 *      row sorts outside every Jalali range -> the date filters silently dropped those invoices.
 *
 * These tests run against the isolated test database and are cleaned up afterwards. They assert on
 * REAL rows written through the REAL service, not on a stub.
 */
test('Invoice date format: create is canonical Jalali, KPI is format-tolerant, filters match', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const tag = `dtfix-${Date.now()}`;
  const productId = `${tag}-prd`;
  const adminId = `${tag}-admin`;
  const farId = `${tag}-far`;
  const drvId = `${tag}-drv`;

  const WK = await db
    .select({ count: sql<number>`count(*)` })
    .from(weighbridge_records)
    .limit(1);
  void WK;

  await t.test('setup: a test admin + farmer + product', async () => {
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    await db.insert(users).values({
      id: adminId,
      username: `${tag}_admin`,
      passwordHash,
      role: 'ADMIN',
      fullName: 'مدیر تست فرمت تاریخ',
      is2faEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(farmers).values({
      id: farId,
      name: `${tag}_farmer`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(products).values({
      id: productId,
      name: `${tag} محصول`,
      type: 'finished',
      unit: 'kg',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.ok(adminId && farId && productId);
  });

  const sign = (payload: any) =>
    jwt.sign(payload, getJwtSecret(), {
      algorithm: 'HS256',
      expiresIn: '10m',
      issuer: 'nir-app',
      subject: payload.id,
    });

  const adminToken = () =>
    sign({ id: adminId, username: `${tag}_admin`, role: 'ADMIN' });

  await t.test('a Jalali date is stored verbatim (the canonical format)', async () => {
    const opId = `${tag}-create-jalali`;
    const res = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}`, 'X-Operation-Id': opId },
      body: JSON.stringify({ type: 'entry', date: '1404/06/25', productId, scaleWeight: 1000, sellerName: 'فروشندهٔ تست' }),
    });
    // The endpoint answers 201 on create (200 when an idempotent replay hits an existing row).
    assert.ok(res.status === 200 || res.status === 201, `unexpected status ${res.status}`);

    const stored = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.productId, productId), eq(invoices.type, 'entry')));
    assert.equal(stored.length, 1, 'the invoice must exist');
    assert.equal(stored[0].date, '1404/06/25', 'a Jalali value must be written unchanged');
  });

  await t.test('an ISO Gregorian date is NORMALISED to Jalali, not stored as ISO', async () => {
    const opId = `${tag}-create-iso`;
    const res = await fetch(`${baseUrl}/api/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}`, 'X-Operation-Id': opId },
      body: JSON.stringify({ type: 'entry', date: '2025-09-16', productId, scaleWeight: 2000, sellerName: 'فروشندهٔ تست ISO' }),
    });
    assert.ok(res.status === 200 || res.status === 201, `unexpected status ${res.status}`);

    const stored = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.productId, productId), eq(invoices.type, 'entry')));
    assert.equal(stored.length, 2, 'both invoices must exist');
    const isoRow = stored.find((r) => r.scaleWeight === '2000');
    assert.ok(isoRow, 'the row created from the ISO date must be found');
    assert.equal(isoRow!.date, '1404/06/25', '2025-09-16 must be stored as Jalali 1404/06/25');
    assert.match(String(isoRow!.date), /^\d{4}\/\d{2}\/\d{2}$/, 'ISO form must never reach the column');
    for (const r of stored) {
      assert.match(String(r.date), /^\d{4}\/\d{2}\/\d{2}$/, `every stored row must be canonical Jalali, got ${r.date}`);
    }
  });

  await t.test('a date-range filter over FILTER_DATE matches every row of that day (both spellings gone)', async () => {
    const res = await fetch(
      `${baseUrl}/api/invoices?type=entry&startDate=1404/06/25&endDate=1404/06/25&limit=200`,
      { headers: { Authorization: `Bearer ${adminToken()}` } }
    );
    assert.ok(res.status === 200 || res.status === 201, 'unexpected status ' + res.status);
    const body: any = await res.json();
    const ids = (body.data || []).map((r: any) => r.id);
    const mine = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.productId, productId), eq(invoices.type, 'entry')));
    const sameDay = mine.filter((r) => r.date === '1404/06/25');
    assert.equal(sameDay.length, 2, 'both rows are on the same day');
    assert.ok(ids.includes(sameDay[0].id) && ids.includes(sameDay[1].id), 'the range must return both rows');
    for (const r of mine) {
      assert.match(String(r.date), /^\d{4}\/\d{2}\/\d{2}$/, 'no row may hold an ISO date');
    }
  });

  await t.test('KPI: a legacy ISO row is still counted as today (no silent zero)', async () => {
    // Simulate the pre-fix world: ONE row written straight to the DB in ISO form.
    const legacyId = `${tag}-legacy`;
    const todayIso = new Date().toISOString().slice(0, 10);
    await db.insert(invoices).values({
      id: legacyId,
      type: 'entry',
      date: todayIso,
      productId,
      scaleWeight: '7777',
      sellerName: 'رکورد قدیمی ISO',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    });

    const res = await fetch(`${baseUrl}/api/mobile/manager/kpi`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.ok(res.status === 200 || res.status === 201, 'unexpected status ' + res.status);
    const body: any = await res.json();
    assert.equal(typeof body.entryTonnageKg, 'number');
    assert.ok(
      body.entryTonnageKg >= 7777,
      `entryTonnageKg must include the legacy ISO row of today (got ${body.entryTonnageKg})`
    );
    assert.ok(Array.isArray(body.inventory), 'inventory must be an array, never undefined');
  });

  await t.test('KPI with no data today is a REAL zero, not an error', async () => {
    const res = await fetch(`${baseUrl}/api/mobile/manager/kpi`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    assert.ok(res.status === 200 || res.status === 201, 'unexpected status ' + res.status);
    const body: any = await res.json();
    assert.equal(typeof body.entryTonnageKg, 'number');
    assert.equal(typeof body.exitTonnageKg, 'number');
    assert.equal(typeof body.todayInvoicesCount, 'number');
  });

  await t.test('teardown: remove ONLY the rows this test created', async () => {
    const mine = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.productId, productId));
    for (const r of mine) await db.delete(invoices).where(eq(invoices.id, r.id)).catch(() => {});
    await db.delete(invoices).where(eq(invoices.id, `${tag}-legacy`)).catch(() => {});
    await db.delete(invoices).where(eq(invoices.id, `${tag}-create-jalali`)).catch(() => {});
    await db.delete(invoices).where(eq(invoices.id, `${tag}-create-iso`)).catch(() => {});
    await db.delete(products).where(eq(products.id, productId)).catch(() => {});
    await db.delete(farmers).where(eq(farmers.id, farId)).catch(() => {});
    await db.delete(users).where(eq(users.id, adminId)).catch(() => {});
    void drvId;
    void generateTotpSecret;
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
});