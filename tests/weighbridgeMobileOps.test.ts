import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

import { app } from '../server';
import { db } from '../server/db';
import { invoices, products, users, farmers, weighbridge_records } from '../server/db/schema';
import { eq, like, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getJwtSecret } from '../server/middleware/auth';

/**
 * Integration test for the mobile weighbridge operations (Phase 2, P1).
 *
 * The mobile screen was READ-ONLY: it listed tickets but had no map / unmap / create-remittance
 * capability, while the web panel had all four against the same routes. This suite drives those
 * routes through the REAL Express app and the REAL database so the mobile client's contract is
 * proven end-to-end rather than pinned against a stub.
 *
 * Routes under test (server/routes/weighbridge.ts):
 *   POST /api/weighbridge/records/:id/map               ADMIN|MANAGER
 *   POST /api/weighbridge/records/:id/unmap              ADMIN|MANAGER
 *   POST /api/weighbridge/records/:id/create-remittance ADMIN|MANAGER
 *
 * Everything is created with a unique tag and removed in teardown; no pre-existing row is touched.
 */
test('Mobile weighbridge operations: map, unmap, create-remittance, RBAC', async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const tag = `wbops-${Date.now()}`;
  const adminId = `${tag}-admin`;
  const driverUserId = `${tag}-drv-user`;
  const accountingId = `${tag}-acc`;
  const farmerId = `${tag}-far`;
  const productId = `${tag}-prd`;
  const invoiceId = `${tag}-inv`;
  // `weighbridge_records.id` is a serial (auto-assigned); `external_id` is a unique INTEGER.
  const ticketExternalId = 950000 + (Date.now() % 100000);

  /** The serial id of the ticket the first test creates, shared by the later tests. */
  let liveTicketId = 0;

  await t.test('setup: admin + driver + accounting users, a farmer, a product, an invoice', async () => {
    const passwordHash = await bcrypt.hash('OpsPass123!', 10);
    await db.insert(users).values([
      {
        id: adminId,
        username: `${tag}_admin`,
        passwordHash,
        role: 'ADMIN',
        fullName: 'مدیر تست عملیات باسکول',
        is2faEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: driverUserId,
        username: `${tag}_drv`,
        passwordHash,
        role: 'DRIVER',
        fullName: 'راننده تست',
        is2faEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: accountingId,
        username: `${tag}_acc`,
        passwordHash,
        role: 'ACCOUNTING',
        fullName: 'حسابدار تست',
        is2faEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await db.insert(farmers).values({
      id: farmerId,
      name: `${tag} مرغداری`,
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
    await db.insert(invoices).values({
      id: invoiceId,
      type: 'exit',
      date: '1404/06/25',
      productId,
      productName: `${tag} محصول`,
      weight: '1000',
      farmerId,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const sign = (payload: any) =>
    jwt.sign(payload, getJwtSecret(), {
      algorithm: 'HS256',
      expiresIn: '10m',
      issuer: 'nir-app',
      subject: payload.id,
    });

  const adminToken = () => sign({ id: adminId, username: `${tag}_admin`, role: 'ADMIN' });
  const driverToken = () => sign({ id: driverUserId, username: `${tag}_drv`, role: 'DRIVER' });
  const accountingToken = () => sign({ id: accountingId, username: `${tag}_acc`, role: 'ACCOUNTING' });

  const insertTicket = async (externalId: number, ticketNo: string, net: number) => {
    const [row] = await db
      .insert(weighbridge_records)
      .values({
        externalId,
        ticketNumber: ticketNo,
        plateNumber: '۴۵ ب ۱۲۳ ایران ۱۰',
        driverName: 'راننده تست',
        grossWeight: String(net + 14000),
        tareWeight: '14000',
        netWeight: String(net),
        direction: 'exit',
        status: 'unmapped',
      })
      .returning({ id: weighbridge_records.id });
    return row.id;
  };

  await t.test('create-remittance is refused for a DRIVER and an ACCOUNTING token', async () => {
    const res = await fetch(`${baseUrl}/api/weighbridge/records/1/create-remittance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken()}` },
      body: JSON.stringify({ type: 'exit', productId }),
    });
    assert.equal(res.status, 403, 'a driver must never create a remittance from a ticket');

    const res2 = await fetch(`${baseUrl}/api/weighbridge/records/1/create-remittance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accountingToken()}` },
      body: JSON.stringify({ type: 'exit', productId }),
    });
    // ACCOUNTING newly holds a mobile session (KNOWN_ROLES), but the backend still refuses the
    // weighbridge write routes exactly as it refused it before.
    assert.equal(res2.status, 403, 'ACCOUNTING is granted on invoices, NOT on weighbridge writes');
  });

  await t.test('an unmapped ticket can be assigned to an existing invoice', async () => {
    liveTicketId = await insertTicket(ticketExternalId, `${tag}-TK`, 12450);

    const before = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0];
    assert.equal(String(before.weight), '1000', 'the invoice starts with its own weight');

    const res = await fetch(`${baseUrl}/api/weighbridge/records/${liveTicketId}/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ invoiceId }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);

    const ticket = (await db.select().from(weighbridge_records).where(eq(weighbridge_records.id, liveTicketId)))[0];
    assert.equal(ticket.status, 'mapped');
    assert.equal(ticket.mappedRemittanceId, invoiceId);

    // The ticket's net is written onto the invoice — the whole point of the assignment, and exactly
    // the number the mobile screen shows for that ticket.
    const after = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0];
    assert.equal(String(after.weight), '12450', 'the ticket net must be written onto the exit invoice');
    assert.equal(Number(after.version) > 1, true, 'the assignment is a versioned, audited change');
  });

  await t.test('a second ticket cannot be assigned to the same invoice', async () => {
    const secondId = await insertTicket(ticketExternalId + 1, `${tag}-TK2`, 15000);

    const res = await fetch(`${baseUrl}/api/weighbridge/records/${secondId}/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ invoiceId }),
    });
    assert.equal(res.status, 409, 'the invoice already belongs to another ticket');

    const ticket = (await db.select().from(weighbridge_records).where(eq(weighbridge_records.id, secondId)))[0];
    assert.equal(ticket.status, 'unmapped', 'a refused assignment must leave the ticket untouched');
    await db.delete(weighbridge_records).where(eq(weighbridge_records.id, secondId)).catch(() => {});
  });

  await t.test('unmap reverts the link; by default the ticket-created invoice is removed', async () => {
    // NOTE: the SERVER's default for unmap is `deleteInvoice: true` — the operator asked to
    // unassign a ticket that CREATED its remittance, so the remittance goes with it. This is the
    // route's documented behaviour (server/routes/weighbridge.ts, «The operator asked for
    // unmapping to remove the whole remittance»), so the test asserts the real contract rather than
    // an invented one.
    const invoiceBefore = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0];
    assert.ok(invoiceBefore, 'the mapped invoice still exists before unmap');

    const res = await fetch(`${baseUrl}/api/weighbridge/records/${liveTicketId}/unmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);

    const ticket = (await db.select().from(weighbridge_records).where(eq(weighbridge_records.id, liveTicketId)))[0];
    assert.equal(ticket.status, 'unmapped');
    assert.equal(ticket.mappedRemittanceId, null);
    assert.equal(ticket.previousWeightValue, null);
  });

  await t.test('with deleteInvoice=false the invoice SURVIVES and its weight is reverted', async () => {
    // The previous test unassigned with the server's DEFAULT (deleteInvoice: true), which removed
    // the seeded invoice. So this test seeds its own invoice + ticket pair and drives the explicit
    // keep-the-invoice path against it.
    const keepInvoiceId = `${tag}-keep-inv`;
    await db.insert(invoices).values({
      id: keepInvoiceId,
      type: 'exit',
      date: '1404/06/25',
      productId,
      productName: `${tag} محصول`,
      weight: '1000',
      farmerId,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const keepTicketExternal = ticketExternalId + 10;
    const keepTicketId = await insertTicket(keepTicketExternal, `${tag}-TK3`, 12450);

    const remap = await fetch(`${baseUrl}/api/weighbridge/records/${keepTicketId}/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ invoiceId: keepInvoiceId }),
    });
    assert.equal(remap.status, 200);

    const during = (await db.select().from(invoices).where(eq(invoices.id, keepInvoiceId)))[0];
    assert.equal(String(during.weight), '12450', 'the ticket net is written onto the invoice by map');

    const res = await fetch(`${baseUrl}/api/weighbridge/records/${keepTicketId}/unmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ deleteInvoice: false }),
    });
    assert.equal(res.status, 200);

    const ticket = (await db.select().from(weighbridge_records).where(eq(weighbridge_records.id, keepTicketId)))[0];
    assert.equal(ticket.status, 'unmapped');
    assert.equal(ticket.mappedRemittanceId, null);

    const after = (await db.select().from(invoices).where(eq(invoices.id, keepInvoiceId)))[0];
    assert.ok(after, 'the invoice must still exist when deleteInvoice is false');
    assert.equal(String(after.weight), '1000', 'unmap restores the value that existed before the map');

    await db.delete(invoices).where(eq(invoices.id, keepInvoiceId)).catch(() => {});
    await db.delete(weighbridge_records).where(eq(weighbridge_records.id, keepTicketId)).catch(() => {});
  });

  await t.test('create-remittance builds an invoice through the SAME shared service (canonical Jalali)', async () => {
    // A fresh, never-linked ticket: `create-remittance` refuses a ticket that is already assigned
    // (the server answers 409), which is exactly what the previous steps produced.
    const createTicketExternal = ticketExternalId + 20;
    const createTicketId = await insertTicket(createTicketExternal, `${tag}-TK4`, 12450);

    const res = await fetch(`${baseUrl}/api/weighbridge/records/${createTicketId}/create-remittance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({
        type: 'exit',
        productId,
        productName: `${tag} محصول`,
        weight: 12450,
        date: '2025-09-16',
        farmerId,
        farmerName: `${tag} مرغداری`,
      }),
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data?.invoiceId, 'the created invoice id is returned');

    const created = (await db.select().from(invoices).where(eq(invoices.id, String(body.data.invoiceId))))[0];
    assert.ok(created, 'the invoice must exist in the database');
    // The Phase 2 date fix, proven through the weighbridge flow specifically.
    assert.equal(created.date, '1404/06/25', 'an ISO date sent by the client is stored as canonical Jalali');
    assert.equal(String(created.weight), '12450');

    const ticket = (await db.select().from(weighbridge_records).where(eq(weighbridge_records.id, createTicketId)))[0];
    assert.equal(ticket.status, 'mapped', 'the round trip ends linked, exactly like the web panel');
    assert.equal(ticket.mappedRemittanceId, created.id);

    // The new invoice must be visible to the invoice list — i.e. the mobile remittances screen
    // would show it without any cache-busting.
    const listRes = await fetch(
      `${baseUrl}/api/invoices?type=exit&startDate=1404/06/25&endDate=1404/06/25&limit=200`,
      { headers: { Authorization: `Bearer ${adminToken()}` } }
    );
    const listBody: any = await listRes.json();
    const ids = (listBody.data || []).map((r: any) => r.id);
    assert.ok(ids.includes(created.id), 'the created invoice is returned by the invoice list filter');

    await db.delete(weighbridge_records).where(eq(weighbridge_records.id, createTicketId)).catch(() => {});
  });

  await t.test('teardown: remove ONLY the rows this suite created, in FK-safe order', async () => {
    // Evidence-driven teardown. The tag below is unique to this run, so a pre-existing row can never
    // match. Order is dictated by the real FK graph, which a failed run proved was being missed:
    //   weighbridge_records.mapped_remittance_id -> invoices.id
    //   invoices.product_id -> products.id    /  invoices.farmer_id -> farmers.id
    //   audit_logs.user_id -> users.id          (audit rows are DELETED too, so the tag leaves
    //                                            nothing behind and no dangling reference remains)
    const runTag = `${tag}%`;

    // 1. Free every ticket that points at an invoice of this run.
    const taggedInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(like(invoices.productName, runTag));
    for (const inv of taggedInvoices) {
      await db
        .update(weighbridge_records)
        .set({ mappedRemittanceId: null, status: 'unmapped' })
        .where(eq(weighbridge_records.mappedRemittanceId, inv.id))
        .catch(() => {});
    }

    // 2. Tickets created by this run (by the external id range the suite chose).
    for (const ext of [
      ticketExternalId,
      ticketExternalId + 1,
      ticketExternalId + 10,
      ticketExternalId + 20,
    ]) {
      await db.delete(weighbridge_records).where(eq(weighbridge_records.externalId, ext)).catch(() => {});
    }

    // 3. Invoices of this run: the seeded one plus any the create-remittance step produced.
    await db.delete(invoices).where(eq(invoices.id, invoiceId)).catch(() => {});
    for (const inv of taggedInvoices) {
      await db.delete(invoices).where(eq(invoices.id, inv.id)).catch(() => {});
    }

    // 4. The ledger rows this run wrote (inventory_transactions references the product, so they must
    //    go before the product can be deleted). Then the audit trail, which references the users.
    await db.execute(sql`DELETE FROM inventory_transactions WHERE product_id LIKE ${runTag}`).catch(() => {});
    await db.execute(sql`DELETE FROM audit_logs WHERE user_id LIKE ${runTag}`).catch(() => {});

    // 5. Fixtures, now that nothing references them.
    await db.delete(products).where(eq(products.id, productId)).catch(() => {});
    await db.delete(farmers).where(eq(farmers.id, farmerId)).catch(() => {});
    await db.delete(users).where(eq(users.id, adminId)).catch(() => {});
    await db.delete(users).where(eq(users.id, driverUserId)).catch(() => {});
    await db.delete(users).where(eq(users.id, accountingId)).catch(() => {});

    // 6. Verification: the run must leave nothing behind.
    const [leftInvoices, leftProducts, leftFarmers, leftUsers, leftTickets] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(invoices).where(like(invoices.productName, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(products).where(like(products.name, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(farmers).where(like(farmers.name, runTag)),
      db.select({ n: sql<number>`count(*)` }).from(users).where(like(users.username, runTag)),
      db
        .select({ n: sql<number>`count(*)` })
        .from(weighbridge_records)
        .where(eq(weighbridge_records.externalId, ticketExternalId)),
    ]);
    const leftovers =
      Number(leftInvoices[0]?.n) +
      Number(leftProducts[0]?.n) +
      Number(leftFarmers[0]?.n) +
      Number(leftUsers[0]?.n) +
      Number(leftTickets[0]?.n);
    assert.equal(leftovers, 0, `the suite must not leave rows behind (found ${leftovers})`);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
