import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { eq, like, sql } from 'drizzle-orm';

import { app } from '../server';
import { db } from '../server/db';
import { users, farmers, drivers, invoices, products } from '../server/db/schema';
import { getJwtSecret } from '../server/middleware/auth';
import { evaluateAdminMutation, LAST_ADMIN_MESSAGE } from '../server/services/userAdminPolicy';

/**
 * Phase 3 integration: mobile user / farmer / driver management.
 *
 * Everything is driven through the REAL Express app against the REAL database so the contract the
 * mobile screens depend on is proven end-to-end (RBAC, validation, role picker, soft delete,
 * history preservation) — not pinned against a stub.
 *
 * Routes under test:
 *   users   : GET/POST/PATCH/PUT :id/password/DELETE  (server/routes/users.ts)
 *   farmers : GET(?status=) / POST / PUT :id / DELETE :id / PUT :id/restore  (server/routes/farmers.ts)
 *   drivers : GET(?status=) / POST / DELETE :name  (server/routes/drivers.ts)
 *
 * Every row this suite writes carries a unique `tag`, and teardown deletes ONLY those rows in
 * FK-safe order and then asserts the tag left nothing behind. No pre-existing row is touched and no
 * record is ever copied in from another environment.
 */
test('Phase 3: mobile user / farmer / driver management (RBAC + lifecycle)', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const tag = `p3ops-${Date.now()}`;
  const adminId = `${tag}-adm`;
  const admin2Id = `${tag}-adm2`;
  const managerId = `${tag}-mgr`;
  const operatorId = `${tag}-opr`;
  const viewerId = `${tag}-view`;
  const farmerId = `${tag}-far`;
  const productId = `${tag}-prd`;

  const sign = (payload: any) =>
    jwt.sign(payload, getJwtSecret(), {
      algorithm: 'HS256',
      expiresIn: '10m',
      issuer: 'nir-app',
      subject: payload.id,
    });

  const tokenFor = (id: string, username: string, role: string) => sign({ id, username, role });
  const adminToken = () => tokenFor(adminId, `${tag}_adm`, 'ADMIN');
  const managerToken = () => tokenFor(managerId, `${tag}_mgr`, 'MANAGER');
  const operatorToken = () => tokenFor(operatorId, `${tag}_opr`, 'OPERATOR');
  const viewerToken = () => tokenFor(viewerId, `${tag}_view`, 'VIEWER');

  const api = (path: string, method: string, token: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  await t.test('setup: tagged users (admin x2, manager, operator, viewer), a farmer, a product', async () => {
    const passwordHash = await bcrypt.hash('Phase3Pass!', 10);
    await db.insert(users).values([
      { id: adminId, username: `${tag}_adm`, passwordHash, role: 'ADMIN', fullName: 'مدیر ارشد تست', phone: '09120000001', is2faEnabled: false, createdAt: new Date(), updatedAt: new Date() },
      { id: admin2Id, username: `${tag}_adm2`, passwordHash, role: 'ADMIN', fullName: 'مدیر ارشد دوم تست', is2faEnabled: false, createdAt: new Date(), updatedAt: new Date() },
      { id: managerId, username: `${tag}_mgr`, passwordHash, role: 'MANAGER', fullName: 'مدیر کارخانه تست', is2faEnabled: false, createdAt: new Date(), updatedAt: new Date() },
      { id: operatorId, username: `${tag}_opr`, passwordHash, role: 'OPERATOR', fullName: 'اپراتور تست', is2faEnabled: false, createdAt: new Date(), updatedAt: new Date() },
      { id: viewerId, username: `${tag}_view`, passwordHash, role: 'VIEWER', fullName: 'مشاهده‌گر تست', is2faEnabled: false, createdAt: new Date(), updatedAt: new Date() },
    ]);

    await db.insert(farmers).values({ id: farmerId, name: `${tag} مرغداری تست`, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(products).values({ id: productId, name: `${tag} محصول تست`, type: 'finished', unit: 'kg', isActive: true, createdAt: new Date(), updatedAt: new Date() });
  });

  // ---------------------------------------------------------------------------------------------
  // Last-admin policy — pure, so the "only one admin left" branch is provable without touching any
  // real admin account in the database.
  // ---------------------------------------------------------------------------------------------
  await t.test('last-admin policy: demote/delete is refused ONLY when it would remove the last admin', () => {
    const one = ['solo'];
    assert.equal(evaluateAdminMutation({ adminIds: one, targetId: 'solo', isDelete: true }).allowed, false);
    assert.equal(evaluateAdminMutation({ adminIds: one, targetId: 'solo', isDelete: true }).reason, LAST_ADMIN_MESSAGE);
    assert.equal(evaluateAdminMutation({ adminIds: one, targetId: 'solo', nextRole: 'MANAGER' }).allowed, false);
    // Keeping admin rights is always fine; a non-admin target is always fine.
    assert.equal(evaluateAdminMutation({ adminIds: one, targetId: 'solo', nextRole: 'ADMIN' }).allowed, true);
    assert.equal(evaluateAdminMutation({ adminIds: one, targetId: 'someone-else', isDelete: true }).allowed, true);
    // With another admin present the mutation is allowed.
    assert.equal(evaluateAdminMutation({ adminIds: ['a', 'b'], targetId: 'a', isDelete: true }).allowed, true);
    assert.equal(evaluateAdminMutation({ adminIds: ['a', 'b'], targetId: 'a', nextRole: 'OPERATOR' }).allowed, true);
  });

  // ---------------------------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------------------------
  await t.test('users: GET is ADMIN|MANAGER, never VIEWER, and never leaks secrets', async () => {
    const denied = await api('/api/users', 'GET', viewerToken());
    assert.equal(denied.status, 403, 'a VIEWER must not read the user directory');

    const mgrRes = await api('/api/users', 'GET', managerToken());
    assert.equal(mgrRes.status, 200);
    const mgrBody: any = await mgrRes.json();
    assert.equal(mgrBody.success, true);
    assert.ok(Array.isArray(mgrBody.data));

    const adminRes = await api('/api/users', 'GET', adminToken());
    const adminBody: any = await adminRes.json();
    const mine = (adminBody.data || []).find((u: any) => u.id === adminId);
    assert.ok(mine, 'the tagged admin appears in the list');
    assert.equal(mine.passwordHash, undefined, 'the list must never expose password hashes');
    assert.equal(typeof mine.username, 'string');
    assert.equal(mine.role, 'ADMIN');
    assert.ok('phone' in mine, 'phone is exposed so the office can search/filter by it');
  });

  await t.test('users: POST is ADMIN only; MANAGER and VIEWER are rejected', async () => {
    const asManager = await api('/api/users', 'POST', managerToken(), { username: `${tag}_x`, password: 'Secret123', role: 'OPERATOR' });
    assert.equal(asManager.status, 403, 'a MANAGER may read users but not create them');

    const asViewer = await api('/api/users', 'POST', viewerToken(), { username: `${tag}_y`, password: 'Secret123', role: 'OPERATOR' });
    assert.equal(asViewer.status, 403, 'a VIEWER is blocked at the write layer');
  });

  let createdUserId = '';
  await t.test('users: validation (username length, password length, role enum) is enforced', async () => {
    const shortName = await api('/api/users', 'POST', adminToken(), { username: 'ab', password: 'Secret123', role: 'OPERATOR' });
    assert.equal(shortName.status, 400);

    const shortPass = await api('/api/users', 'POST', adminToken(), { username: `${tag}_short`, password: '123', role: 'OPERATOR' });
    assert.equal(shortPass.status, 400);

    // Privilege-escalation via a role the enum does not define must be rejected, not coerced.
    const badRole = await api('/api/users', 'POST', adminToken(), { username: `${tag}_badrole`, password: 'Secret123', role: 'SUPERADMIN' });
    assert.equal(badRole.status, 400);
  });

  await t.test('users: ADMIN creates a user; duplicate username is refused', async () => {
    const res = await api('/api/users', 'POST', adminToken(), {
      username: `${tag}_new`,
      password: 'Secret123',
      role: 'ACCOUNTING',
      fullName: 'کاربر جدید تست',
      phone: '0912 555 4444',
    });
    assert.equal(res.status, 201);
    const body: any = await res.json();
    assert.equal(body.success, true);
    createdUserId = String(body.data.id);
    assert.ok(createdUserId);
    assert.equal(body.data.passwordHash, undefined, 'the create response must not echo the hash');
    assert.equal(body.data.phone, '09125554444', 'the phone is normalised to digits');

    const dup = await api('/api/users', 'POST', adminToken(), {
      username: `${tag}_new`,
      password: 'Secret123',
      role: 'OPERATOR',
    });
    assert.equal(dup.status, 400, 'a duplicate username must be refused');
  });

  await t.test('users: PATCH changes role/fullName/phone (ADMIN only) and 404s on unknown ids', async () => {
    const asManager = await api(`/api/users/${createdUserId}`, 'PATCH', managerToken(), { role: 'OPERATOR' });
    assert.equal(asManager.status, 403);

    const res = await api(`/api/users/${createdUserId}`, 'PATCH', adminToken(), {
      role: 'MANAGER',
      fullName: 'ویرایش‌شده',
      phone: '09127778888',
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.data.role, 'MANAGER');
    assert.equal(body.data.fullName, 'ویرایش‌شده');
    assert.equal(body.data.phone, '09127778888');

    const row = (await db.select().from(users).where(eq(users.id, createdUserId)))[0];
    assert.equal(row.role, 'MANAGER', 'the change is persisted, not just echoed');

    const missing = await api(`/api/users/${tag}-missing`, 'PATCH', adminToken(), { role: 'OPERATOR' });
    assert.equal(missing.status, 404);

    const empty = await api(`/api/users/${createdUserId}`, 'PATCH', adminToken(), {});
    assert.equal(empty.status, 400, 'an empty update is refused');
  });

  await t.test('users: password reset requires 6+ chars and really rewrites the hash', async () => {
    const short = await api(`/api/users/${createdUserId}/password`, 'PUT', adminToken(), { newPassword: '123' });
    assert.equal(short.status, 400);

    const before = (await db.select().from(users).where(eq(users.id, createdUserId)))[0];
    const ok = await api(`/api/users/${createdUserId}/password`, 'PUT', adminToken(), { newPassword: 'BrandNew123' });
    assert.equal(ok.status, 200);
    const after = (await db.select().from(users).where(eq(users.id, createdUserId)))[0];
    assert.notEqual(after.passwordHash, before.passwordHash, 'the stored hash changes');
    assert.equal(await bcrypt.compare('BrandNew123', after.passwordHash), true, 'the new password verifies');
  });

  await t.test('users: self-delete is refused; deleting another user works', async () => {
    const self = await api(`/api/users/${adminId}`, 'DELETE', adminToken());
    assert.equal(self.status, 400, 'an admin cannot delete their own session account');
    assert.ok((await db.select().from(users).where(eq(users.id, adminId))).length > 0);

    const other = await api(`/api/users/${createdUserId}`, 'DELETE', adminToken());
    assert.equal(other.status, 200);
    assert.equal((await db.select().from(users).where(eq(users.id, createdUserId))).length, 0);

    const missing = await api(`/api/users/${tag}-nope`, 'DELETE', adminToken());
    assert.equal(missing.status, 404);
  });

  await t.test('users: demoting a NON-last admin is allowed (the guard is conditional)', async () => {
    // adminA remains (plus the plant's own real admins), so removing adminB's admin rights must pass.
    const res = await api(`/api/users/${admin2Id}`, 'PATCH', adminToken(), { role: 'OPERATOR' });
    assert.equal(res.status, 200);
    const row = (await db.select().from(users).where(eq(users.id, admin2Id)))[0];
    assert.equal(row.role, 'OPERATOR');
  });

  // ---------------------------------------------------------------------------------------------
  // Farmers
  // ---------------------------------------------------------------------------------------------
  const farmerName = `${tag} مزرعه پرورش`;
  let newFarmerId = '';

  await t.test('farmers: GET works for any authenticated role and returns the deletedAt marker', async () => {
    const res = await api('/api/farmers', 'GET', operatorToken());
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.data));
    const seeded = (body.data || []).find((f: any) => f.id === farmerId);
    assert.ok(seeded, 'the seeded farmer is listed');
    assert.ok('deletedAt' in seeded, 'the client needs deletedAt to tell active from inactive');
  });

  await t.test('farmers: POST requires a name and is ADMIN|MANAGER (VIEWER blocked)', async () => {
    const noName = await api('/api/farmers', 'POST', managerToken(), { phone: '09120000000' });
    assert.equal(noName.status, 400);

    const asViewer = await api('/api/farmers', 'POST', viewerToken(), { name: `${tag} viewer farm` });
    assert.equal(asViewer.status, 403);

    const asOperator = await api('/api/farmers', 'POST', operatorToken(), { name: `${tag} operator farm` });
    assert.equal(asOperator.status, 403, 'an OPERATOR may not create farmers in this system');
  });

  await t.test('farmers: create then re-create with the same name is de-duplicated (reused:true)', async () => {
    const first = await api('/api/farmers', 'POST', managerToken(), { name: farmerName, phone: '09121234567' });
    assert.equal(first.status, 201);
    const firstBody: any = await first.json();
    newFarmerId = String(firstBody.data.id);
    assert.equal(firstBody.data.reused, false);
    assert.ok(newFarmerId);

    const second = await api('/api/farmers', 'POST', managerToken(), { name: farmerName, phone: '09121234567' });
    assert.equal(second.status, 201);
    const secondBody: any = await second.json();
    assert.equal(secondBody.data.reused, true, 'the same human must not become a second row');
    assert.equal(String(secondBody.data.id), newFarmerId, 'the surviving id is reported back');

    const rows = await db.select().from(farmers).where(eq(farmers.name, farmerName));
    assert.equal(rows.length, 1, 'exactly one row exists for the normalised name');
  });

  await t.test('farmers: PUT edits name/phone (ADMIN|MANAGER) and is refused for OPERATOR', async () => {
    const asOperator = await api(`/api/farmers/${newFarmerId}`, 'PUT', operatorToken(), { name: 'x' });
    assert.equal(asOperator.status, 403);

    const res = await api(`/api/farmers/${newFarmerId}`, 'PUT', managerToken(), { phone: '09129990000' });
    assert.equal(res.status, 200);
    const row = (await db.select().from(farmers).where(eq(farmers.id, newFarmerId)))[0];
    assert.equal(row.phone, '09129990000');
  });

  await t.test('farmers: DELETE (deactivate) is ADMIN only, moves the row to ?status=inactive, and restore brings it back', async () => {
    const asManager = await api(`/api/farmers/${newFarmerId}`, 'DELETE', managerToken());
    assert.equal(asManager.status, 403, 'deactivation is ADMIN only even though editing is not');

    const asAdmin = await api(`/api/farmers/${newFarmerId}`, 'DELETE', adminToken());
    assert.equal(asAdmin.status, 200);
    const softDeleted = (await db.select().from(farmers).where(eq(farmers.id, newFarmerId)))[0];
    assert.ok(softDeleted.deletedAt, 'the row is soft-deleted, never removed');

    const activeRes = await api('/api/farmers', 'GET', managerToken());
    const activeBody: any = await activeRes.json();
    assert.equal((activeBody.data || []).some((f: any) => f.id === newFarmerId), false, 'hidden from the active list');

    const inactiveRes = await api('/api/farmers?status=inactive', 'GET', managerToken());
    const inactiveBody: any = await inactiveRes.json();
    assert.equal((inactiveBody.data || []).some((f: any) => f.id === newFarmerId), true, 'visible in the inactive list');

    const restore = await api(`/api/farmers/${newFarmerId}/restore`, 'PUT', managerToken(), {});
    assert.equal(restore.status, 200);
    const restored = (await db.select().from(farmers).where(eq(farmers.id, newFarmerId)))[0];
    assert.equal(restored.deletedAt, null);
  });

  // ---------------------------------------------------------------------------------------------
  // Drivers
  // ---------------------------------------------------------------------------------------------
  const driverName = `${tag} راننده تست`;
  const driverInvoiceId = `${tag}-inv`;

  await t.test('drivers: GET is open to any authenticated role and POST requires a name', async () => {
    const list = await api('/api/drivers', 'GET', operatorToken());
    assert.equal(list.status, 200);
    const body: any = await list.json();
    assert.ok(Array.isArray(body.data));

    const noName = await api('/api/drivers', 'POST', operatorToken(), { phone: '09120000000' });
    assert.equal(noName.status, 400, 'the server requires a driver name');
  });

  await t.test('drivers: POST is ADMIN|MANAGER|OPERATOR, VIEWER is blocked', async () => {
    const asViewer = await api('/api/drivers', 'POST', viewerToken(), { name: `${tag} viewer driver` });
    assert.equal(asViewer.status, 403);

    const asOperator = await api('/api/drivers', 'POST', operatorToken(), { name: driverName, phone: '09120001111' });
    assert.equal(asOperator.status, 201, 'an operator may add a driver');
  });

  await t.test('drivers: editing via POST keeps the SAME id (no rename side-effect)', async () => {
    const before = (await db.select().from(drivers).where(eq(drivers.name, driverName)))[0];
    assert.ok(before);
    assert.equal(before.id, driverName, 'the driver id is the trimmed name');

    const res = await api('/api/drivers', 'POST', managerToken(), { name: driverName, phone: '09120002222', iban: 'IR000000000000000000000000' });
    assert.equal(res.status, 201);
    const after = (await db.select().from(drivers).where(eq(drivers.name, driverName)))[0];
    assert.equal(after.id, before.id, 'the id never changes, so invoice links survive the edit');
    assert.equal(after.phone, '09120002222');
    assert.equal(after.iban, 'IR000000000000000000000000');
  });

  await t.test('drivers: deactivation is a SOFT delete and NEVER removes past invoice history', async () => {
    // A past invoice that references this driver, exactly like the real ledger does.
    await db.insert(invoices).values({
      id: driverInvoiceId,
      type: 'exit',
      date: '1404/06/25',
      productId,
      productName: `${tag} محصول تست`,
      driverName,
      driverId: driverName,
      weight: '1000',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const asOperator = await api(`/api/drivers/${encodeURIComponent(driverName)}`, 'DELETE', operatorToken());
    assert.equal(asOperator.status, 403, 'deactivation is ADMIN|MANAGER only');

    const res = await api(`/api/drivers/${encodeURIComponent(driverName)}`, 'DELETE', managerToken());
    assert.equal(res.status, 200);

    const row = (await db.select().from(drivers).where(eq(drivers.id, driverName)))[0];
    assert.ok(row, 'the driver row still exists (soft delete, not a hard delete)');
    assert.ok(row.deletedAt, 'the row is stamped as inactive');

    const invoice = (await db.select().from(invoices).where(eq(invoices.id, driverInvoiceId)))[0];
    assert.ok(invoice, 'the historical invoice is untouched');
    assert.equal(invoice.driverId, driverName, 'the invoice still points at the driver');

    const activeRes = await api('/api/drivers', 'GET', managerToken());
    const activeBody: any = await activeRes.json();
    assert.equal((activeBody.data || []).some((d: any) => d.id === driverName), false, 'hidden from the active list');

    const inactiveRes = await api('/api/drivers?status=inactive', 'GET', managerToken());
    const inactiveBody: any = await inactiveRes.json();
    assert.equal((inactiveBody.data || []).some((d: any) => d.id === driverName), true, 'visible in the inactive list');
  });

  await t.test('drivers: reactivation is a re-POST of the same name (deletedAt cleared)', async () => {
    const res = await api('/api/drivers', 'POST', managerToken(), { name: driverName, phone: '09120002222' });
    assert.equal(res.status, 201);
    const row = (await db.select().from(drivers).where(eq(drivers.id, driverName)))[0];
    assert.equal(row.deletedAt, null, 'the same driver file is reactivated');
    assert.equal(row.phone, '09120002222', 'and its data is preserved');
  });

  await t.test('teardown: remove ONLY this run\u2019s rows (FK-safe) and assert nothing is left behind', async () => {
    const runTag = `${tag}%`;
    // invoices first (they reference product / farmer / driver), then the audit trail (references
    // users), then users (they reference drivers/farmers), then drivers, farmers and the product.
    await db.delete(invoices).where(eq(invoices.id, driverInvoiceId)).catch(() => {});
    await db.execute(sql`DELETE FROM audit_logs WHERE user_id LIKE ${runTag}`).catch(() => {});
    await db.delete(users).where(like(users.id, runTag)).catch(() => {});
    await db.delete(drivers).where(like(drivers.id, runTag)).catch(() => {});
    await db.delete(farmers).where(like(farmers.id, runTag)).catch(() => {});
    await db.delete(products).where(like(products.id, runTag)).catch(() => {});

    const [leftUsers, leftFarmers, leftDrivers, leftInvoices, leftProducts] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(users).where(like(users.id, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(farmers).where(like(farmers.id, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(drivers).where(like(drivers.id, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(invoices).where(like(invoices.id, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(products).where(like(products.id, runTag)),
    ]);
    const leftovers =
      Number(leftUsers[0]?.n) +
      Number(leftFarmers[0]?.n) +
      Number(leftDrivers[0]?.n) +
      Number(leftInvoices[0]?.n) +
      Number(leftProducts[0]?.n);
    assert.equal(leftovers, 0, `the suite must not leave rows behind (found ${leftovers})`);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
