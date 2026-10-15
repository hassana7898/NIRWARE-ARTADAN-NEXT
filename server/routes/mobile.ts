import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  delivery_proofs,
  device_tokens,
  drivers,
  farmer_orders,
  farmers,
  invoices,
  products,
  settings,
  users,
  weighbridge_records,
} from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { dateDayNumber, dayDistance, jalaliText, toIsoDateText } from '../../shared/jalali';
import {
  buildProductAliasMap,
  canonicalProductId,
  canonicalProductRows,
  isSameProduct,
  numericByCanonical,
  phaseDurationByCanonical,
} from '../../shared/productIdentity';
import { normalizeIranianPhone } from '../services/smsService';
import { actorFromRequest, recordAudit } from '../services/auditService';
import { executeIdempotentOperation } from '../services/idempotencyService';

const router = Router();

// Setup multer storage for proof of delivery uploads
const uploadsDir = path.resolve(
  process.env.UPLOAD_DIR || process.env.NIR_UPLOADS_PATH || path.join(process.cwd(), 'data', 'uploads')
);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `pod-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit per image
});

const podUploadMiddleware = upload.fields([
  { name: 'photo_bill', maxCount: 1 },
  { name: 'photo_scale', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
]);

/**
 * Save Base64 data URL to uploads directory
 */
const saveBase64Image = (dataUrl: string, prefix = 'img'): string | null => {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return null;
  const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9-+.]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, buffer);
  return `/uploads/${filename}`;
};

// ============================================================================
// 1. App Metadata & Version Check (Public)
// ============================================================================

/**
 * GET /api/mobile/meta
 * Returns minAppVersion, currentAppVersion and maintenanceMode
 */
router.get('/meta', (_req: Request, res: Response) => {
  res.json({
    minAppVersion: process.env.MIN_MOBILE_APP_VERSION || '1.0.0',
    currentAppVersion: process.env.CURRENT_MOBILE_APP_VERSION || '1.0.0',
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
    serverTime: new Date().toISOString(),
    todayJalali: jalaliText(new Date()),
  });
});

// ============================================================================
// 2. Push Notification Device Token Registration
// ============================================================================

/**
 * POST /api/mobile/device-token
 * Registers or updates push notification token for the authenticated user
 */
router.post('/device-token', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || 'android').toLowerCase().trim();

    if (!token) {
      return res.status(400).json({ error: 'توکن دستگاه الزامی است.' });
    }

    const userId = req.user!.id;
    const existing = await db
      .select()
      .from(device_tokens)
      .where(and(eq(device_tokens.userId, userId), eq(device_tokens.token, token)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(device_tokens)
        .set({ platform, updatedAt: new Date() })
        .where(eq(device_tokens.id, existing[0].id));
    } else {
      await db.insert(device_tokens).values({
        userId,
        token,
        platform,
        updatedAt: new Date(),
      });
    }

    return res.json({ success: true, message: 'توکن نوتیفیکیشن با موفقیت ثبت شد.' });
  } catch (err: any) {
    console.error('[DEVICE TOKEN ERROR]:', err);
    return res.status(500).json({ error: 'خطا در ثبت توکن دستگاه.' });
  }
});

// ============================================================================
// 3. Driver Experience Endpoints
// ============================================================================

/**
 * GET /api/mobile/driver/loads
 * Returns active and completed loads assigned to the driver
 */
router.get('/driver/loads', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let driverId = req.user?.driverId;

    // Allow managers/admins to view loads for a specific driver via query param
    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.query.driverId) {
      driverId = String(req.query.driverId);
    }

    // Resolve driver profile
    let driverRow: any = null;
    if (driverId) {
      const rows = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
      driverRow = rows[0];
    } else if (req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allDrivers = await db.select().from(drivers).where(isNull(drivers.deletedAt));
      driverRow = allDrivers.find((d: any) => normalizeIranianPhone(d.phone) === normalizedPhone);
    }

    if (!driverRow) {
      return res.json({
        driver: null,
        activeLoads: [],
        completedLoads: [],
      });
    }

    // Fetch invoices assigned to this driver by name or phone
    const driverName = driverRow.name;
    const driverPhone = driverRow.phone;

    // Phase 2 (G-16): the history is unbounded - the busiest driver on dev carries 526 loads, and the
    // server used to cap the whole list at the 100 newest rows, so older trips simply did not exist
    // for the app. `scope` now pages the list the screen actually renders (the POD-presence predicate
    // runs in SQL, so a page of "completed" is a page of completed loads), and the defaults reproduce
    // the pre-Phase-2 answer for APKs built before it: page 1, 100 rows, active + completed together.
    const scope = ['active', 'completed'].includes(String(req.query.scope)) ? String(req.query.scope) : 'all';
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '100'), 10) || 100));

    // Phase 1: the FK link is authoritative and is what the backfill populates. The legacy name/phone
    // predicates stay as a safety net for rows that are not mapped yet, so a driver never loses a
    // load that the old string matching used to find.
    const ownedByDriver = or(
      eq(invoices.driverId, driverRow.id),
      eq(invoices.driverName, driverName),
      driverPhone ? eq(invoices.driverPhone, driverPhone) : sql`FALSE`
    )!;
    const proofExists = sql`EXISTS (SELECT 1 FROM delivery_proofs p WHERE p.invoice_id = ${invoices.id})`;
    const loadWhere = and(
      isNull(invoices.deletedAt),
      ownedByDriver,
      ...(scope === 'active' ? [sql`NOT ${proofExists}`] : scope === 'completed' ? [proofExists] : [])
    );

    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(invoices).where(loadWhere);
    const total = Number(totalRows[0]?.count || 0);

    const invoiceList = await db
      .select()
      .from(invoices)
      .where(loadWhere)
      .orderBy(desc(invoices.date), desc(invoices.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const invoiceIds = invoiceList.map((i: any) => i.id);

    // Phase 2: `invoices.product_name` is empty on the real rows (the office names a product on the
    // product master, not on each waybill), so every driver load rendered as «نامشخص» even though the
    // FK `product_id` was set. The linked product's own name is the truthful fallback.
    const invoiceProductIds = [
      ...new Set(invoiceList.map((i: any) => i.productId).filter(Boolean) as string[]),
    ];
    const productRows = invoiceProductIds.length
      ? await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(inArray(products.id, invoiceProductIds))
      : [];
    const productNameById = new Map<string, string>();
    for (const p of productRows as any[]) {
      if (p?.id && p?.name) productNameById.set(String(p.id), String(p.name));
    }

    // Fetch existing delivery proofs
    const proofs = invoiceIds.length > 0
      ? await db
          .select()
          .from(delivery_proofs)
          .where(inArray(delivery_proofs.invoiceId, invoiceIds))
      : [];

    const proofMap = new Map<string, any>();
    for (const p of proofs) {
      if (p.invoiceId) proofMap.set(p.invoiceId, p);
    }

    // Fetch linked weighbridge tickets
    const wbTickets = invoiceIds.length > 0
      ? await db
          .select()
          .from(weighbridge_records)
          .where(inArray(weighbridge_records.mappedRemittanceId, invoiceIds))
      : [];

    const wbMap = new Map<string, any>();
    for (const wb of wbTickets) {
      if (wb.mappedRemittanceId) wbMap.set(wb.mappedRemittanceId, wb);
    }

    const activeLoads: any[] = [];
    const completedLoads: any[] = [];

    for (const inv of invoiceList) {
      const proof = proofMap.get(inv.id) || null;
      const wbTicket = wbMap.get(inv.id) || null;
      // A weighbridge ticket only has a «وزن خالص» once BOTH weighings exist (same rule as the web list
      // and the weighbridge monitor): the scale software persists `net = gross` for a first-weighing
      // ticket, so a stored net must never be handed to the app as a finished load.
      const wbGross = wbTicket?.grossWeight ? Number(wbTicket.grossWeight) : 0;
      const wbTare = wbTicket?.tareWeight ? Number(wbTicket.tareWeight) : 0;
      const wbNetted = wbGross > 0 && wbTare > 0;

      const item = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.billNumber || '-',
        type: inv.type, // 'entry' | 'exit'
        date: inv.date,
        productName: inv.productName || productNameById.get(String(inv.productId)) || 'نامشخص',
        sellerName: inv.sellerName || null,
        origin: inv.origin || null,
        destination: inv.farmerId ? 'مرغداری' : inv.factory || 'کارخانه آرادان',
        billWeight: inv.billWeight ? Number(inv.billWeight) : null,
        scaleWeight: inv.scaleWeight ? Number(inv.scaleWeight) : null,
        netWeight: inv.weight ? Number(inv.weight) : null,
        // `status` stays the coarse two-state field the pre-Phase-2 APKs render; `tripStatus` (Phase 2,
        // G-8) is the driver-reported progress. The delivery receipt stays authoritative: a load with a
        // proof is delivered whatever the reported column says (the PATCH endpoint refuses a
        // `delivered` report without a receipt, so the two can never contradict each other in practice).
        status: proof ? 'delivered' : 'in_transit',
        tripStatus: proof ? 'delivered' : inv.tripStatus || 'assigned',
        tripStatusAt: inv.tripStatusAt || null,
        hasProofOfDelivery: !!proof,
        proofOfDelivery: proof,
        weighbridge: wbTicket
          ? {
              ticketNumber: wbTicket.ticketNumber,
              grossWeight: wbGross || null,
              tareWeight: wbTare || null,
              netWeight: wbNetted ? (wbTicket.netWeight ? Number(wbTicket.netWeight) : wbGross - wbTare) : null,
              weighTime: wbTicket.weighTime,
              status: wbTicket.status,
            }
          : null,
      };

      if (proof) {
        completedLoads.push(item);
      } else {
        activeLoads.push(item);
      }
    }

    return res.json({
      driver: {
        id: driverRow.id,
        name: driverRow.name,
        phone: driverRow.phone,
        iban: driverRow.iban,
      },
      activeLoads,
      completedLoads,
      // Phase 2 paging metadata (extra fields; APKs built before Phase 2 ignore them).
      scope,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: page * limit < total,
      activeCount: activeLoads.length,
      completedCount: completedLoads.length,
    });
  } catch (err: any) {
    console.error('[DRIVER LOADS ERROR]:', err);
    return res.status(500).json({ error: 'خطا در دریافت لیست بارهای راننده.' });
  }
});

/**
 * PATCH /api/mobile/driver/loads/:invoiceId/trip-status   (Phase 2, G-8)
 *
 * The driver reports where the truck is: assigned -> at the origin -> loading -> at the destination
 * -> unloading -> delivered. Phase 1 could only tell two states apart (`delivered` / `in_transit`)
 * and both were DERIVED from the delivery receipt, so the office had no way to see progress while a
 * truck was on the road.
 *
 * Contract rules (all enforced here, so no screen can corrupt a trip):
 *   * forward-only: a report can only move a load along the flow, never back (a stale offline queue
 *     replaying "at_origin" after "loading" is rejected with 409 instead of rewinding the trip);
 *   * `delivered` needs the delivery receipt (POD) - the receipt is the proof, not a button tap;
 *   * `cancelled` is a terminal state reachable from anything except `delivered`;
 *   * re-sending the state the load already has is a 200 no-op (`unchanged: true`), so an offline
 *     retry is safe;
 *   * a driver may only touch their own loads (FK when present, else the legacy name/phone match used
 *     by GET /driver/loads); ADMIN/MANAGER may correct any load.
 */
const TRIP_STATUS_FLOW = ['assigned', 'at_origin', 'loading', 'at_destination', 'unloading', 'delivered'] as const;
type TripStatus = (typeof TRIP_STATUS_FLOW)[number] | 'cancelled';
const isTripStatus = (value: string): value is TripStatus =>
  value === 'cancelled' || (TRIP_STATUS_FLOW as readonly string[]).includes(value);
const tripStatusRank = (value: TripStatus): number =>
  value === 'cancelled' ? -1 : TRIP_STATUS_FLOW.indexOf(value);

router.patch('/driver/loads/:invoiceId/trip-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const invoiceId = String(req.params.invoiceId || '').trim();
    const requested = String(req.body?.status || '').trim().toLowerCase();

    if (!invoiceId || !isTripStatus(requested)) {
      return res.status(400).json({
        error: `وضعیت ارسالی نامعتبر است. مقادیر مجاز: ${[...TRIP_STATUS_FLOW, 'cancelled'].join(' | ')}`,
      });
    }

    const rows = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
      .limit(1);
    if (!rows.length) {
      return res.status(404).json({ error: 'حواله مورد نظر یافت نشد.' });
    }
    const invoice: any = rows[0];

    // Authorization: staff may correct any load, a driver only their own.
    const role = String(req.user?.role || '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'MANAGER') {
      const myDriverId = req.user?.driverId || null;
      const myDriver = myDriverId
        ? (await db.select().from(drivers).where(eq(drivers.id, myDriverId)).limit(1))[0]
        : null;
      const ownsByFk = !!myDriverId && invoice.driverId === myDriverId;
      const ownsByLegacy =
        !!myDriver &&
        (invoice.driverName === myDriver.name || (!!myDriver.phone && invoice.driverPhone === myDriver.phone));
      if (!ownsByFk && !ownsByLegacy) {
        return res.status(403).json({ error: 'این حواله به شما تخصیص داده نشده است.' });
      }
    }

    const proofRows = await db
      .select({ id: delivery_proofs.id })
      .from(delivery_proofs)
      .where(eq(delivery_proofs.invoiceId, invoiceId))
      .limit(1);
    const hasProof = proofRows.length > 0;

    const current: TripStatus = (invoice.tripStatus as TripStatus) || (hasProof ? 'delivered' : 'assigned');

    if (requested === current) {
      return res.json({
        success: true,
        unchanged: true,
        invoiceId,
        tripStatus: current,
        tripStatusAt: invoice.tripStatusAt || null,
        message: 'این وضعیت قبلاً ثبت شده است.',
      });
    }
    if (current === 'delivered') {
      return res.status(409).json({ error: 'این سفر بسته شده است (رسید تحویل ثبت شده) و تغییر وضعیت آن مجاز نیست.' });
    }
    if (current === 'cancelled' && requested !== 'cancelled') {
      return res.status(409).json({ error: 'این سفر لغو شده است و بازگشت به وضعیت قبلی مجاز نیست.' });
    }
    if (requested === 'delivered' && !hasProof) {
      return res.status(409).json({ error: 'برای بستن سفر ابتدا رسید تحویل بار را ثبت کنید.' });
    }
    if (requested !== 'cancelled' && tripStatusRank(requested) < tripStatusRank(current)) {
      return res.status(409).json({
        error: `بازگشت به وضعیت «${requested}» از «${current}» مجاز نیست (فقط حرکت رو به جلو).`,
      });
    }

    const now = new Date();
    const [updated] = await db
      .update(invoices)
      .set({ tripStatus: requested, tripStatusAt: now, updatedBy: req.user?.username || req.user?.id || invoice.updatedBy })
      .where(eq(invoices.id, invoiceId))
      .returning();

    return res.json({
      success: true,
      unchanged: false,
      invoiceId,
      previousStatus: current,
      tripStatus: (updated as any)?.tripStatus || requested,
      tripStatusAt: (updated as any)?.tripStatusAt || now,
      message: 'وضعیت سفر به‌روزرسانی شد.',
    });
  } catch (err: any) {
    console.error('[DRIVER TRIP STATUS ERROR]:', err);
    return res.status(500).json({ error: 'خطا در به‌روزرسانی وضعیت سفر.' });
  }
});

/**
 * Proof of delivery (POD).
 *
 * POST /api/mobile/driver/delivery-receipt   <- canonical (the app calls this, see api/endpoints.ts)
 * POST /api/mobile/driver/proof              <- DEPRECATED alias for APKs built before Phase 1:
 *                                                the client used to call this path while the server
 *                                                only had the other one, and the old client mock
 *                                                engine hid the resulting 404.
 *
 * Phase 1 fixes inside the shared handler:
 *   * `driver_id` (FK to drivers) used to be filled with the invoice's driver *name*
 *     (`invRows[0].driverName`) when the caller had no driverId - a text value inside a FK column.
 *     It now uses the authenticated driver, else the invoice's linked driver, else NULL.
 *   * idempotency: re-submitting the same invoice returns the stored receipt instead of inserting
 *     a duplicate record (a retry after a timeout no longer creates a phantom delivery).
 */
const submitDeliveryReceipt = async (req: Request, res: Response) => {
  try {
    const invoiceId = String(req.body?.invoice_id || req.body?.invoiceId || '').trim();
    if (!invoiceId) {
      return res.status(400).json({ error: 'شناسه حواله (invoice_id) الزامی است.' });
    }

    // Verify invoice exists
    const invRows = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invRows.length) {
      return res.status(404).json({ error: 'حواله مورد نظر یافت نشد.' });
    }

    const invoice = invRows[0];

    // Idempotent replay: this invoice already carries a delivery receipt.
    const existingProofs = await db
      .select()
      .from(delivery_proofs)
      .where(eq(delivery_proofs.invoiceId, invoiceId))
      .orderBy(desc(delivery_proofs.id))
      .limit(1);

    if (existingProofs.length > 0) {
      return res.json({
        success: true,
        alreadyRegistered: true,
        message: 'رسید تحویل این حواله قبلاً ثبت شده است.',
        proof: existingProofs[0],
      });
    }

    // FK integrity: the authenticated driver first, then the invoice's linked driver. The free-text
    // driver_name is deliberately NOT used here any more (it is not a drivers.id).
    const driverId = req.user?.driverId || invoice.driverId || null;

    // Handle files from multipart upload or base64 fallback in body
    const files = (req as any).files || {};

    let photoBillUrl: string | null = null;
    let photoScaleUrl: string | null = null;
    let signatureUrl: string | null = null;

    if (files.photo_bill && files.photo_bill[0]) {
      photoBillUrl = `/uploads/${files.photo_bill[0].filename}`;
    } else if (req.body?.photo_bill_base64) {
      photoBillUrl = saveBase64Image(req.body.photo_bill_base64, 'bill');
    }

    if (files.photo_scale && files.photo_scale[0]) {
      photoScaleUrl = `/uploads/${files.photo_scale[0].filename}`;
    } else if (req.body?.photo_scale_base64) {
      photoScaleUrl = saveBase64Image(req.body.photo_scale_base64, 'scale');
    }

    if (files.signature && files.signature[0]) {
      signatureUrl = `/uploads/${files.signature[0].filename}`;
    } else if (req.body?.signature_base64) {
      signatureUrl = saveBase64Image(req.body.signature_base64, 'sig');
    }

    const latitude = req.body?.latitude != null ? String(req.body.latitude) : null;
    const longitude = req.body?.longitude != null ? String(req.body.longitude) : null;

    // Save Proof of Delivery record
    const [proof] = await db
      .insert(delivery_proofs)
      .values({
        invoiceId,
        driverId,
        photoBillUrl,
        photoScaleUrl,
        signatureUrl,
        latitude: latitude ? (latitude as any) : null,
        longitude: longitude ? (longitude as any) : null,
        deliveredAt: new Date(),
        createdAt: new Date(),
      })
      .returning();

    // Phase 2 (G-8): the delivery receipt IS the end of the trip, so the reported state follows the
    // receipt (the PATCH /driver/loads/:id/trip-status endpoint enforces the same rule from the other
    // side). The guard keeps an idempotent retry from rewriting a row that is already `delivered` -
    // and it is written with raw SQL on purpose, so it stays a single no-op UPDATE.
    await db
      .update(invoices)
      .set({ tripStatus: 'delivered', tripStatusAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), sql`${invoices.tripStatus} IS DISTINCT FROM 'delivered'`));

    return res.status(201).json({
      success: true,
      message: 'رسید تحویل بار با موفقیت ثبت شد.',
      proof,
    });
  } catch (err: any) {
    console.error('[DELIVERY RECEIPT ERROR]:', err);
    return res.status(500).json({ error: 'خطا در ثبت رسید تحویل بار.' });
  }
};

router.post('/driver/delivery-receipt', requireAuth, podUploadMiddleware, submitDeliveryReceipt);
router.post('/driver/proof', requireAuth, podUploadMiddleware, submitDeliveryReceipt);

// ============================================================================
// 4. Farmer Experience Endpoints & Brood Period Engine
// ============================================================================

interface BroodCatalogContext {
  settingsProducts: any[];
  productAlias: Map<string, string>;
  canonicalProducts: any[];
  quotaByCanonical: Map<string, number>;
  durationByCanonical: Map<string, number>;
  productNameById: Map<string, string>;
  finishedGoodCanonicalIds: Set<string>;
  totalBroodDays: number;
}

const loadBroodCatalogContext = async (): Promise<BroodCatalogContext> => {
  const [settingsRow, dbProductRows] = await Promise.all([
    db.select().from(settings).where(eq(settings.id, 'default')).limit(1),
    db.select({ id: products.id, name: products.name, type: products.type, isActive: products.isActive, deletedAt: products.deletedAt }).from(products),
  ]);

  const settingsData = (settingsRow[0]?.data as any) || {};
  const settingsProductsRaw: any[] = Array.isArray(settingsData.products) ? settingsData.products : [];
  const feedQuotasRaw: Array<{ productId: string; quotaPerChick: number }> = Array.isArray(settingsData.feedQuotas)
    ? settingsData.feedQuotas
    : [];
  const totalBroodDays = Number(settingsData.totalBroodDays) > 0 ? Number(settingsData.totalBroodDays) : 50;

  // Combine settings products with DB products so any newly added product in DB is also known
  const seenIds = new Set<string>();
  const combinedProducts: any[] = [];
  for (const sp of settingsProductsRaw) {
    if (sp && sp.id) {
      seenIds.add(String(sp.id));
      combinedProducts.push({
        id: String(sp.id),
        name: String(sp.name || sp.id),
        type: sp.type === 'finished' ? 'finishedGood' : String(sp.type || 'rawMaterial'),
        isDeleted: Boolean(sp.isDeleted),
      });
    }
  }
  for (const dp of dbProductRows) {
    if (dp && dp.id && !seenIds.has(String(dp.id))) {
      seenIds.add(String(dp.id));
      combinedProducts.push({
        id: String(dp.id),
        name: String(dp.name || dp.id),
        type: dp.type === 'finished' ? 'finishedGood' : String(dp.type || 'rawMaterial'),
        isDeleted: Boolean(dp.deletedAt) || dp.isActive === false,
      });
    }
  }

  const productAlias = buildProductAliasMap(combinedProducts);

  // Merge legacy soft-deleted finished-good variants (e.g. «پیش دان کلهردانه», «پیش دان تولید»)
  // onto their active canonical finished-good row so historical periods show unified phases & quotas.
  const activeFinishedGoods = combinedProducts.filter((p) => p.type === 'finishedGood' && !p.isDeleted);
  for (const p of combinedProducts) {
    if (p.type !== 'finishedGood' || !p.isDeleted) continue;
    const strippedName = String(p.name || '')
      .replace(/کلهر\s*دانه|تولید/g, '')
      .trim();
    const matchedActive = activeFinishedGoods.find(
      (af) => af.name.trim() === strippedName || p.name.includes(af.name.trim())
    );
    if (matchedActive) {
      const targetCanonical = productAlias.get(matchedActive.id) || matchedActive.id;
      productAlias.set(p.id, targetCanonical);
    }
  }

  const canonicalProducts = canonicalProductRows(combinedProducts, productAlias);
  const quotaByCanonical = numericByCanonical(
    feedQuotasRaw.map((q) => ({ productId: String(q.productId), value: Number(q.quotaPerChick || 0) })),
    productAlias,
    'max'
  );
  const durationByCanonical = phaseDurationByCanonical(
    settingsData.productPhaseDurations,
    combinedProducts,
    productAlias
  );

  const productNameById = new Map<string, string>();
  for (const p of combinedProducts) {
    productNameById.set(p.id, p.name);
  }
  for (const p of canonicalProducts) {
    productNameById.set(p.id, p.name);
  }

  const finishedGoodCanonicalIds = new Set<string>(
    canonicalProducts.filter((p) => p.type === 'finishedGood').map((p) => String(p.id))
  );

  return {
    settingsProducts: combinedProducts,
    productAlias,
    canonicalProducts,
    quotaByCanonical,
    durationByCanonical,
    productNameById,
    finishedGoodCanonicalIds,
    totalBroodDays,
  };
};

/**
 * Filter farmer exit invoices belonging to a specific brood period,
 * matching the exact rules of web `BroodDetailsCard.tsx` (startInvoiceId / dateDayNumber / included / excluded).
 */
const filterInvoicesForBrood = (brood: any, farmerInvoices: any[]): any[] => {
  if (!brood) return farmerInvoices;

  const endDay = brood.endDate ? dateDayNumber(brood.endDate) : null;
  let baseInvoices: any[] = [];

  if (brood.startInvoiceId) {
    const startInv = farmerInvoices.find((inv) => String(inv.id) === String(brood.startInvoiceId));
    if (startInv) {
      const startCreated = startInv.createdAt ? new Date(startInv.createdAt).getTime() : 0;
      const startInvDay = dateDayNumber(startInv.date);
      baseInvoices = farmerInvoices.filter((inv) => {
        const invCreated = inv.createdAt ? new Date(inv.createdAt).getTime() : 0;
        const invDay = dateDayNumber(inv.date);
        const afterStart =
          startCreated > 0 && invCreated > 0
            ? invCreated >= startCreated
            : startInvDay !== null && invDay !== null
            ? invDay >= startInvDay
            : true;
        if (!afterStart) return false;
        if (endDay !== null && invDay !== null && invDay > endDay) return false;
        return true;
      });
    }
  }

  if (baseInvoices.length === 0 && !brood.startInvoiceId) {
    const startDay = brood.startDate ? dateDayNumber(brood.startDate) : null;
    baseInvoices = farmerInvoices.filter((inv) => {
      const invDay = dateDayNumber(inv.date);
      if (startDay !== null && invDay !== null && invDay < startDay) return false;
      if (endDay !== null && invDay !== null && invDay > endDay) return false;
      return true;
    });
  } else if (baseInvoices.length === 0 && brood.startInvoiceId && brood.startDate) {
    // Fallback if startInvoiceId was not found in farmerInvoices
    const startDay = dateDayNumber(brood.startDate);
    baseInvoices = farmerInvoices.filter((inv) => {
      const invDay = dateDayNumber(inv.date);
      if (startDay !== null && invDay !== null && invDay < startDay) return false;
      if (endDay !== null && invDay !== null && invDay > endDay) return false;
      return true;
    });
  }

  const includedIds = new Set<string>(Array.isArray(brood.includedInvoiceIds) ? brood.includedInvoiceIds.map(String) : []);
  const excludedIds = new Set<string>(Array.isArray(brood.excludedInvoiceIds) ? brood.excludedInvoiceIds.map(String) : []);

  const finalInvoices = baseInvoices.filter((inv) => !excludedIds.has(String(inv.id)));
  for (const incId of includedIds) {
    if (!finalInvoices.some((inv) => String(inv.id) === incId)) {
      const found = farmerInvoices.find((inv) => String(inv.id) === incId);
      if (found) finalInvoices.push(found);
    }
  }

  // Sort newest first for mobile display
  finalInvoices.sort((a, b) => {
    const dayA = dateDayNumber(a.date) || 0;
    const dayB = dateDayNumber(b.date) || 0;
    if (dayB !== dayA) return dayB - dayA;
    const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tB - tA;
  });

  return finalInvoices;
};

/**
 * Compute detailed brood metrics, feed phase breakdown, FCR, mortality, and age.
 */
const computeBroodDetails = (
  brood: any,
  farmerInvoices: any[],
  ctx: BroodCatalogContext,
  todayJalali: string
) => {
  const chickCount = Number(brood?.chickCount || brood?.flockCount || 0);
  const mortalityCount = Number(brood?.mortalityCount || 0);
  const liveChicks = Math.max(0, chickCount - mortalityCount);
  const survivalRate = chickCount > 0 ? Number(((liveChicks / chickCount) * 100).toFixed(1)) : 100;

  const isDeleted = Boolean(brood?.deletedAt);
  const isArchived = Boolean(brood?.isArchived || brood?.endDate);
  const isActive = !isDeleted && !isArchived;

  let ageDays = 0;
  if (brood?.startDate) {
    const endDateForCalc = brood.endDate || todayJalali;
    const startDayNum = dateDayNumber(brood.startDate);
    const endDayNum = dateDayNumber(endDateForCalc);
    if (startDayNum !== null && endDayNum !== null) {
      ageDays = Math.max(0, endDayNum - startDayNum) + 1;
    } else {
      const dist = dayDistance(brood.startDate, endDateForCalc);
      ageDays = dist != null ? dist + 1 : 0;
    }
  }

  const totalBroodDays = ctx.totalBroodDays || 50;
  const ageProgressPercent = Math.min(100, Math.round((ageDays / totalBroodDays) * 100));

  const relevantInvoices = filterInvoicesForBrood(brood, farmerInvoices);
  const deliveredByCanonical = new Map<string, number>();

  for (const inv of relevantInvoices) {
    const cid = canonicalProductId(ctx.productAlias, String(inv.productId || ''));
    const w = Number(inv.scaleWeight || inv.weight || inv.billWeight || 0);
    deliveredByCanonical.set(cid, (deliveredByCanonical.get(cid) || 0) + w);
  }

  const exceptionalFeeds = Array.isArray(brood?.exceptionalFeed) ? brood.exceptionalFeed : [];
  for (const ef of exceptionalFeeds) {
    if (!ef) continue;
    const cid = canonicalProductId(ctx.productAlias, String(ef.productId || ''));
    const w = Number(ef.weight || 0);
    deliveredByCanonical.set(cid, (deliveredByCanonical.get(cid) || 0) + w);
  }

  let totalFeedDeliveredKg = 0;
  for (const [cid, w] of deliveredByCanonical.entries()) {
    // Sum all finished goods (or if no finished goods matched, sum all)
    if (ctx.finishedGoodCanonicalIds.size === 0 || ctx.finishedGoodCanonicalIds.has(cid)) {
      totalFeedDeliveredKg += w;
    }
  }

  // Relevant finished good rows for quota & phase breakdown
  const finishedProducts = ctx.canonicalProducts.filter((p) => {
    if (p.type !== 'finishedGood') return false;
    if ((deliveredByCanonical.get(p.id) || 0) > 0) return true;
    if (Array.isArray(brood?.activeProductsAtCreation) && brood.activeProductsAtCreation.length > 0) {
      return brood.activeProductsAtCreation.some((id: string) => isSameProduct(ctx.productAlias, String(id), p.id));
    }
    return !p.isDeleted;
  });

  // Default phase durations when settings.productPhaseDurations is empty
  const defaultDurations = [7, 10, 14, 12, 7];
  let runningStartDay = 1;
  let totalQuotaKg = 0;

  const breakdown = finishedProducts.map((p, idx) => {
    const quotaPerChickGrams = ctx.quotaByCanonical.get(p.id) || 0;
    const quotaKg = chickCount > 0 ? (quotaPerChickGrams * chickCount) / 1000 : 0;
    totalQuotaKg += quotaKg;
    const deliveredKg = deliveredByCanonical.get(p.id) || 0;
    const remainingKg = Math.max(0, quotaKg - deliveredKg);
    const overQuotaKg = Math.max(0, deliveredKg - quotaKg);
    const usagePercentage = quotaKg > 0 ? Number(((deliveredKg / quotaKg) * 100).toFixed(1)) : 0;

    const duration = ctx.durationByCanonical.get(p.id) || defaultDurations[idx] || 10;
    const phaseStartDay = runningStartDay;
    const phaseEndDay = phaseStartDay + duration - 1;
    runningStartDay = phaseEndDay + 1;

    const dailyRecommendedKg = duration > 0 ? Math.round(quotaKg / duration) : 0;
    let phaseStatus: 'upcoming' | 'active' | 'completed' | 'over_consumed' = 'upcoming';
    let phaseStatusLabel = `شروع از روز ${phaseStartDay} تا ${phaseEndDay}`;

    if (ageDays < phaseStartDay) {
      phaseStatus = 'upcoming';
      phaseStatusLabel = `فاز بعدی (روز ${phaseStartDay} تا ${phaseEndDay})`;
    } else if (ageDays <= phaseEndDay && isActive) {
      phaseStatus = overQuotaKg > 0 ? 'over_consumed' : 'active';
      const remDays = phaseEndDay - ageDays;
      phaseStatusLabel =
        overQuotaKg > 0
          ? `فاز جاری — ${Math.round(overQuotaKg)} کیلوگرم مازاد سهمیه`
          : `فاز جاری پرورش (${remDays > 0 ? `${remDays} روز تا پایان فاز` : 'روز پایانی فاز'})`;
    } else {
      phaseStatus = overQuotaKg > 0 ? 'over_consumed' : 'completed';
      phaseStatusLabel =
        overQuotaKg > 0
          ? `خاتمه فاز (${Math.round(overQuotaKg)} کیلوگرم اضافه مصرف)`
          : remainingKg > quotaKg * 0.05
          ? `خاتمه فاز (${Math.round(remainingKg)} کیلوگرم مانده)`
          : 'تکمیل شده';
    }

    return {
      productId: p.id,
      productName: p.name,
      quotaPerChickGrams,
      quotaKg: Math.round(quotaKg),
      deliveredKg: Math.round(deliveredKg),
      remainingKg: Math.round(remainingKg),
      overQuotaKg: Math.round(overQuotaKg),
      usagePercentage,
      phaseStartDay,
      phaseEndDay,
      dailyRecommendedKg,
      phaseStatus,
      phaseStatusLabel,
    };
  });

  const perChickDeliveredGrams = chickCount > 0 ? Math.round((totalFeedDeliveredKg * 1000) / chickCount) : 0;
  const dailyPerChickGrams =
    ageDays > 0 && liveChicks > 0 ? Number((totalFeedDeliveredKg * 1000 / (liveChicks * ageDays)).toFixed(1)) : 0;

  const finalChickenWeightKg = Number(brood?.finalChickenWeight || brood?.finalWeight || 0) || null;
  const fcr =
    finalChickenWeightKg && finalChickenWeightKg > 0 && totalFeedDeliveredKg > 0
      ? Number((totalFeedDeliveredKg / finalChickenWeightKg).toFixed(2))
      : null;

  // Estimate current live weight based on standard Ross 308 growth curve if not closed yet
  // so farmer can also see estimated FCR during active period when finalChickenWeightKg is not entered yet
  let estimatedFcr: number | null = fcr;
  if (!estimatedFcr && ageDays >= 7 && liveChicks > 0 && totalFeedDeliveredKg > 0) {
    // Approximate standard cumulative feed conversion ratio or live weight
    // Standard broiler weight (grams) ≈ 42 + 18 * age + 0.95 * age^2 (capped at age 55)
    const clampedAge = Math.min(55, ageDays);
    const estBirdWeightGrams = 42 + 18 * clampedAge + 0.95 * clampedAge * clampedAge;
    const estTotalLiveWeightKg = (liveChicks * estBirdWeightGrams) / 1000;
    if (estTotalLiveWeightKg > 0) {
      estimatedFcr = Number((totalFeedDeliveredKg / estTotalLiveWeightKg).toFixed(2));
    }
  }

  const startDateJalali = brood?.startDate ? jalaliText(brood.startDate) : '';
  const endDateJalali = brood?.endDate ? jalaliText(brood.endDate) : null;
  const defaultName = startDateJalali ? `دوره جوجه‌ریزی ${startDateJalali}` : 'دوره پرورشی';

  return {
    broodSummary: {
      id: String(brood?.id || ''),
      name: String(brood?.name || defaultName),
      startDate: String(brood?.startDate || ''),
      startDateJalali,
      endDate: brood?.endDate ? String(brood.endDate) : null,
      endDateJalali,
      chickCount,
      flockCount: chickCount,
      liveChicks,
      mortalityCount,
      survivalRate,
      ageDays,
      herdAgeDays: ageDays,
      totalBroodDays,
      ageProgressPercent,
      isActive,
      isArchived,
      deletedAt: brood?.deletedAt || null,
      finalWeight: finalChickenWeightKg,
      finalChickenWeight: finalChickenWeightKg,
      fcr,
      estimatedFcr,
      perChickDeliveredGrams,
      dailyPerChickGrams,
      feedConsumedKg: Math.round(totalFeedDeliveredKg),
      totalQuotaKg: Math.round(totalQuotaKg),
      remainingQuotaKg: Math.max(0, Math.round(totalQuotaKg - totalFeedDeliveredKg)),
      overallUsagePercentage:
        totalQuotaKg > 0 ? Number(((totalFeedDeliveredKg / totalQuotaKg) * 100).toFixed(1)) : 0,
      invoicesCount: relevantInvoices.length,
      exceptionalFeed: exceptionalFeeds,
    },
    breakdown,
    relevantInvoices,
  };
};

/**
 * GET /api/mobile/farmer/dashboard
 * Active breeding cycle, ALL breeding cycles, herd age, total consumed feed, last delivery
 */
router.get('/farmer/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;
    const requestedBroodId = req.query.broodId ? String(req.query.broodId) : null;

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.query.farmerId) {
      farmerId = String(req.query.farmerId);
    }

    let farmerRow: any = null;
    if (farmerId) {
      const rows = await db.select().from(farmers).where(eq(farmers.id, farmerId)).limit(1);
      farmerRow = rows[0];
    } else if (req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      farmerRow = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
    }

    if (!farmerRow) {
      return res.json({
        farmer: null,
        activeBrood: null,
        activePeriod: null,
        broods: [],
        herdAgeDays: 0,
        totalFeedKg: 0,
        totalFeedDelivered: 0,
        totalLoadsCount: 0,
        lastDelivery: null,
        recentInvoices: [],
      });
    }

    const todayJalali = jalaliText(new Date());
    const catalogCtx = await loadBroodCatalogContext();

    // Query exit invoices for this farmer
    const farmerInvoices = await db
      .select()
      .from(invoices)
      .where(
        and(
          isNull(invoices.deletedAt),
          eq(invoices.farmerId, farmerRow.id),
          eq(invoices.type, 'exit')
        )
      )
      .orderBy(desc(invoices.date), desc(invoices.createdAt));

    // Identify ALL non-deleted breeding periods from farmer.broods (real data from database)
    const rawBroods = Array.isArray(farmerRow.broods) ? farmerRow.broods : [];
    const nonDeletedBroods = rawBroods.filter((b: any) => b && !b.deletedAt);

    // Sort by startDate descending (newest first) using dateDayNumber so both ISO and Jalali dates sort accurately
    const sortedBroods = [...nonDeletedBroods].sort((a: any, b: any) => {
      const dayA = dateDayNumber(a.startDate) || 0;
      const dayB = dateDayNumber(b.startDate) || 0;
      return dayB - dayA;
    });

    // Compute full details for every brood period
    const computedBroods = sortedBroods.map((b: any) =>
      computeBroodDetails(b, farmerInvoices, catalogCtx, todayJalali)
    );
    const broodsWithDetails = computedBroods.map((c) => c.broodSummary);

    // Select requested brood, or latest active brood, or latest archived brood
    let selectedComputed = requestedBroodId
      ? computedBroods.find((c) => String(c.broodSummary.id) === requestedBroodId) || null
      : null;

    if (!selectedComputed) {
      selectedComputed =
        computedBroods.find((c) => c.broodSummary.isActive) ||
        (computedBroods.length > 0 ? computedBroods[0] : null);
    }

    const activePeriod = selectedComputed ? selectedComputed.broodSummary : null;
    const herdAgeDays = activePeriod ? activePeriod.ageDays : 0;

    // Invoices for selected brood (or all farmer invoices if farmer has no brood defined)
    const periodInvoices = selectedComputed ? selectedComputed.relevantInvoices : farmerInvoices;
    const totalFeedKg = activePeriod
      ? activePeriod.feedConsumedKg
      : farmerInvoices.reduce((acc, inv) => acc + Number(inv.scaleWeight || inv.weight || inv.billWeight || 0), 0);

    const formatInvoiceItem = (inv: any) => {
      const cid = canonicalProductId(catalogCtx.productAlias, String(inv.productId || ''));
      const resolvedProductName =
        inv.productName ||
        catalogCtx.productNameById.get(String(inv.productId || '')) ||
        catalogCtx.productNameById.get(cid) ||
        'دان مصرفی';
      const w = Number(inv.scaleWeight || inv.weight || inv.billWeight || 0);
      return {
        id: inv.id,
        date: inv.date,
        dateJalali: jalaliText(inv.date),
        productId: inv.productId,
        productName: resolvedProductName,
        weight: w,
        netWeight: w,
        scaleWeight: inv.scaleWeight ? Number(inv.scaleWeight) : w,
        billWeight: inv.billWeight ? Number(inv.billWeight) : w,
        driverName: inv.driverName || 'ثبت نشده',
        invoiceNumber: inv.invoiceNumber || '-',
      };
    };

    const recentInvoices = periodInvoices.slice(0, 20).map(formatInvoiceItem);
    const lastDelivery = recentInvoices.length > 0 ? recentInvoices[0] : null;

    return res.json({
      farmer: {
        id: farmerRow.id,
        name: farmerRow.name,
        phone: farmerRow.phone,
      },
      activeBrood: activePeriod,
      activePeriod,
      broods: broodsWithDetails,
      herdAgeDays,
      totalFeedKg,
      totalFeedDelivered: totalFeedKg,
      totalWeight: totalFeedKg,
      totalDeliveriesCount: periodInvoices.length,
      totalLoadsCount: periodInvoices.length,
      lastDelivery,
      latestDelivery: lastDelivery,
      recentInvoices,
    });
  } catch (err: any) {
    console.error('[FARMER DASHBOARD ERROR]:', err);
    return res.status(500).json({ error: 'خطا در بارگذاری داشبورد مرغدار.' });
  }
});

/**
 * GET /api/mobile/farmer/invoices
 * Invoices list with factory scale weight, bill weight, and computed weight delta
 */
router.get('/farmer/invoices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;
    const requestedBroodId = req.query.broodId ? String(req.query.broodId) : null;

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.query.farmerId) {
      farmerId = String(req.query.farmerId);
    }

    if (!farmerId && req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      const matched = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
      if (matched) farmerId = matched.id;
    }

    if (!farmerId) {
      return res.status(400).json({ error: 'شناسه مرغدار مشخص نشده است.' });
    }

    const [catalogCtx, rows, farmerRows] = await Promise.all([
      loadBroodCatalogContext(),
      db
        .select()
        .from(invoices)
        .where(
          and(
            isNull(invoices.deletedAt),
            eq(invoices.farmerId, farmerId),
            eq(invoices.type, 'exit')
          )
        )
        .orderBy(desc(invoices.date), desc(invoices.createdAt))
        .limit(300),
      db.select().from(farmers).where(eq(farmers.id, farmerId)).limit(1),
    ]);

    let targetRows = rows;
    if (requestedBroodId && farmerRows[0]) {
      const allBroods = Array.isArray(farmerRows[0].broods) ? farmerRows[0].broods : [];
      const selectedBrood = allBroods.find((b: any) => b && String(b.id) === requestedBroodId);
      if (selectedBrood) {
        targetRows = filterInvoicesForBrood(selectedBrood, rows);
      }
    }

    // Check linked weighbridge records for these invoices
    const invoiceIds = targetRows.map((r: any) => r.id);
    const wbRows =
      invoiceIds.length > 0
        ? await db
            .select()
            .from(weighbridge_records)
            .where(inArray(weighbridge_records.mappedRemittanceId, invoiceIds))
        : [];
    const wbMap = new Map<string, any>();
    for (const wb of wbRows) {
      if (wb.mappedRemittanceId) wbMap.set(String(wb.mappedRemittanceId), wb);
    }

    const formatted = targetRows.map((inv: any) => {
      const wb = wbMap.get(String(inv.id));
      const wbNet =
        wb && Number(wb.grossWeight) > 0 && Number(wb.tareWeight) > 0
          ? Number(wb.netWeight || Number(wb.grossWeight) - Number(wb.tareWeight))
          : null;

      const recordedWeight = Number(inv.weight || inv.scaleWeight || inv.billWeight || 0);
      const billWeight = inv.billWeight ? Number(inv.billWeight) : recordedWeight;
      const scaleWeight = inv.scaleWeight
        ? Number(inv.scaleWeight)
        : wbNet !== null
        ? wbNet
        : recordedWeight;
      const weightDelta = scaleWeight - billWeight;
      const isMatched = Math.abs(weightDelta) <= 50; // Tolerance of 50kg

      const cid = canonicalProductId(catalogCtx.productAlias, String(inv.productId || ''));
      const resolvedProductName =
        inv.productName ||
        catalogCtx.productNameById.get(String(inv.productId || '')) ||
        catalogCtx.productNameById.get(cid) ||
        'دان مصرفی';

      return {
        id: inv.id,
        date: inv.date,
        dateJalali: jalaliText(inv.date),
        invoiceNumber: inv.invoiceNumber || '-',
        productId: inv.productId,
        productName: resolvedProductName,
        driverName: inv.driverName || 'نامشخص',
        weight: recordedWeight,
        invoiceWeight: billWeight,
        billWeight,
        scaleWeight,
        weightDelta,
        toleranceStatus: isMatched ? 'matched' : 'discrepancy',
        ticketNumber: wb?.ticketNumber || null,
        plateNumber: wb?.plateNumber || null,
      };
    });

    return res.json({ invoices: formatted });
  } catch (err: any) {
    console.error('[FARMER INVOICES ERROR]:', err);
    return res.status(500).json({ error: 'خطا در دریافت لیست حواله‌های مرغدار.' });
  }
});

/**
 * GET /api/mobile/farmer/products
 * Returns active finished goods (دان آماده) available for farmer feed orders
 */
router.get('/farmer/products', requireAuth, async (_req: Request, res: Response) => {
  try {
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        type: products.type,
        unit: products.unit,
        currentStock: products.currentStock,
        minStock: products.minStock,
      })
      .from(products)
      .where(
        and(
          isNull(products.deletedAt),
          eq(products.isActive, true),
          inArray(products.type, ['finishedGood', 'finished', 'finished_good'])
        )
      )
      .orderBy(asc(products.name));

    const list = productRows.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: 'finishedGood',
      rawType: p.type,
      unit: p.unit || 'kg',
      currentStock: Number(p.currentStock || 0),
      minStock: p.minStock ? Number(p.minStock) : null,
    }));

    return res.json({ products: list });
  } catch (err: any) {
    console.error('[FARMER PRODUCTS GET ERROR]:', err);
    return res.status(500).json({ error: 'خطا در دریافت لیست محصولات دان.' });
  }
});

/**
 * GET /api/mobile/farmer/orders
 * Returns orders placed by this farmer, newest first
 */
router.get('/farmer/orders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.query.farmerId) {
      farmerId = String(req.query.farmerId);
    }

    if (!farmerId && req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      const matched = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
      if (matched) farmerId = matched.id;
    }

    if (!farmerId) {
      return res.status(400).json({ error: 'شناسه مرغدار مشخص نشده است.' });
    }

    const status = req.query.status ? String(req.query.status).trim() : null;
    const limit = Math.min(Number(req.query.limit || 50), 100);

    const baseQuery = db
      .select({
        id: farmer_orders.id,
        farmerId: farmer_orders.farmerId,
        productId: farmer_orders.productId,
        productName: products.name,
        requestedWeight: farmer_orders.requestedWeight,
        targetDate: farmer_orders.targetDate,
        notes: farmer_orders.notes,
        status: farmer_orders.status,
        createdAt: farmer_orders.createdAt,
        updatedAt: farmer_orders.updatedAt,
      })
      .from(farmer_orders)
      .leftJoin(products, eq(farmer_orders.productId, products.id));

    const conditions = [eq(farmer_orders.farmerId, farmerId)];
    if (status) {
      conditions.push(eq(farmer_orders.status, status));
    }

    const rows = await baseQuery
      .where(and(...conditions))
      .orderBy(desc(farmer_orders.createdAt), desc(farmer_orders.id))
      .limit(limit);

    const orders = rows.map((r: any) => ({
      id: r.id,
      farmerId: r.farmerId,
      productId: r.productId,
      productName: r.productName || 'دان مصرفی',
      requestedWeight: Number(r.requestedWeight || 0),
      targetDate: r.targetDate,
      notes: r.notes || null,
      status: r.status || 'pending',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return res.json({ orders, count: orders.length });
  } catch (err: any) {
    console.error('[FARMER ORDERS GET ERROR]:', err);
    return res.status(500).json({ error: 'خطا در دریافت لیست سفارش‌های مرغدار.' });
  }
});

/**
 * POST /api/mobile/farmer/orders
 * Creates a feed order in farmer_orders table (with idempotency, product verification & audit)
 */
router.post('/farmer/orders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.body?.farmerId) {
      farmerId = String(req.body.farmerId);
    }

    let farmerRow: any = null;
    if (farmerId) {
      const rows = await db.select().from(farmers).where(eq(farmers.id, farmerId)).limit(1);
      farmerRow = rows[0];
    } else if (req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      farmerRow = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
      if (farmerRow) farmerId = farmerRow.id;
    }

    if (!farmerId || !farmerRow) {
      return res.status(400).json({ error: 'حساب کاربری به هیچ مرغداری متصل نیست.' });
    }

    const productId = req.body?.productId ? String(req.body.productId) : null;
    const requestedWeight = Number(req.body?.requestedWeight || req.body?.requested_weight || 0);
    const targetDate = String(req.body?.targetDate || req.body?.target_date || '').trim();
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    if (requestedWeight <= 0) {
      return res.status(400).json({ error: 'تناژ درخواستی باید بزرگتر از صفر باشد.' });
    }

    if (!targetDate) {
      return res.status(400).json({ error: 'تاریخ پیشنهادی تحویل (شمسی) الزامی است.' });
    }

    // Verify productId if provided
    let verifiedProductName = 'دان مصرفی';
    if (productId) {
      const prodRows = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1);
      if (!prodRows.length) {
        return res.status(400).json({ error: 'کالای انتخاب‌شده در سیستم یافت نشد.' });
      }
      verifiedProductName = prodRows[0].name;
    }

    const operationId = (req.headers['x-operation-id'] as string) || null;

    const executeInsert = async (tx: any) => {
      const [order] = await tx
        .insert(farmer_orders)
        .values({
          farmerId,
          productId,
          requestedWeight: String(requestedWeight) as any,
          targetDate,
          notes,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await recordAudit(tx, actorFromRequest(req), {
        action: 'CREATE',
        entity: 'farmer_order',
        targetIds: [String(order.id)],
        changes: [],
        details: `ثبت سفارش دان به میزان ${requestedWeight} کیلوگرم برای مرغدار ${farmerRow.name}`,
        context: { requestedWeight, productId, targetDate, farmerId },
      });

      return {
        ...order,
        productName: verifiedProductName,
      };
    };

    let resultOrder: any = null;
    if (operationId) {
      const op = await executeIdempotentOperation({
        operationId,
        userId: req.user?.id || null,
        resourceType: 'farmer_orders',
        operationType: 'create',
        payload: { farmerId, productId, requestedWeight, targetDate, notes },
        execute: executeInsert,
      });
      resultOrder = op.result;
    } else {
      resultOrder = await executeInsert(db);
    }

    return res.status(201).json({
      success: true,
      message: 'سفارش دان با موفقیت ثبت شد و در انتظار تایید کارخانه قرار گرفت.',
      order: resultOrder,
    });
  } catch (err: any) {
    console.error('[FARMER ORDER CREATE ERROR]:', err);
    return res.status(500).json({ error: err.message || 'خطا در ثبت سفارش دان.' });
  }
});

/**
 * GET /api/mobile/farmer/statement
 * Detailed feed quota, delivered feed, remaining quota balance, and invoice reconciliation
 * Supports ?broodId=... to filter by a specific breeding period
 */
router.get('/farmer/statement', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;
    const requestedBroodId = req.query.broodId ? String(req.query.broodId) : null;

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.query.farmerId) {
      farmerId = String(req.query.farmerId);
    }

    let farmerRow: any = null;
    if (farmerId) {
      const rows = await db.select().from(farmers).where(eq(farmers.id, farmerId)).limit(1);
      farmerRow = rows[0];
    } else if (req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      farmerRow = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
      if (farmerRow) farmerId = farmerRow.id;
    }

    if (!farmerRow) {
      return res.status(400).json({ error: 'شناسه مرغدار مشخص نشده است.' });
    }

    const todayJalali = jalaliText(new Date());
    const [catalogCtx, farmerInvoices] = await Promise.all([
      loadBroodCatalogContext(),
      db
        .select()
        .from(invoices)
        .where(
          and(
            isNull(invoices.deletedAt),
            eq(invoices.farmerId, farmerRow.id),
            eq(invoices.type, 'exit')
          )
        )
        .orderBy(desc(invoices.date), desc(invoices.createdAt)),
    ]);

    // 1. Identify brood period - use requested broodId or fall back to latest active/existing brood
    const allBroods = (Array.isArray(farmerRow.broods) ? farmerRow.broods : []).filter((b: any) => b && !b.deletedAt);
    const sortedBroods = [...allBroods].sort((a: any, b: any) => {
      const dayA = dateDayNumber(a.startDate) || 0;
      const dayB = dateDayNumber(b.startDate) || 0;
      return dayB - dayA;
    });

    let selectedBrood: any = null;
    if (requestedBroodId) {
      selectedBrood = sortedBroods.find((b: any) => String(b.id) === requestedBroodId) || null;
    }
    if (!selectedBrood) {
      const activeBroods = sortedBroods.filter((b: any) => !b.deletedAt && !b.isArchived && !b.endDate);
      selectedBrood = activeBroods.length > 0 ? activeBroods[0] : sortedBroods.length > 0 ? sortedBroods[0] : null;
    }

    const computed = computeBroodDetails(selectedBrood, farmerInvoices, catalogCtx, todayJalali);
    const bs = computed.broodSummary;

    // Fetch linked weighbridge tickets for the period's invoices
    const periodInvIds = computed.relevantInvoices.map((i: any) => i.id);
    const wbRows =
      periodInvIds.length > 0
        ? await db
            .select()
            .from(weighbridge_records)
            .where(inArray(weighbridge_records.mappedRemittanceId, periodInvIds))
        : [];
    const wbMap = new Map<string, any>();
    for (const wb of wbRows) {
      if (wb.mappedRemittanceId) wbMap.set(String(wb.mappedRemittanceId), wb);
    }

    const formattedInvoices = computed.relevantInvoices.slice(0, 100).map((inv: any) => {
      const wb = wbMap.get(String(inv.id));
      const wbNet =
        wb && Number(wb.grossWeight) > 0 && Number(wb.tareWeight) > 0
          ? Number(wb.netWeight || Number(wb.grossWeight) - Number(wb.tareWeight))
          : null;

      const recordedWeight = Number(inv.weight || inv.scaleWeight || inv.billWeight || 0);
      const billWeight = inv.billWeight ? Number(inv.billWeight) : recordedWeight;
      const scaleWeight = inv.scaleWeight
        ? Number(inv.scaleWeight)
        : wbNet !== null
        ? wbNet
        : recordedWeight;
      const weightDelta = scaleWeight - billWeight;
      const isMatched = Math.abs(weightDelta) <= 50;

      const cid = canonicalProductId(catalogCtx.productAlias, String(inv.productId || ''));
      const resolvedProductName =
        inv.productName ||
        catalogCtx.productNameById.get(String(inv.productId || '')) ||
        catalogCtx.productNameById.get(cid) ||
        'دان مصرفی';

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || '-',
        date: inv.date,
        dateJalali: jalaliText(inv.date),
        productId: inv.productId,
        productName: resolvedProductName,
        driverName: inv.driverName || 'ثبت نشده',
        weight: recordedWeight,
        billWeight,
        scaleWeight,
        weightDelta,
        toleranceStatus: isMatched ? 'matched' : 'discrepancy',
        ticketNumber: wb?.ticketNumber || null,
        plateNumber: wb?.plateNumber || null,
      };
    });

    return res.json({
      farmer: {
        id: farmerRow.id,
        name: farmerRow.name,
        phone: farmerRow.phone,
      },
      activeBrood: selectedBrood ? bs : null,
      activePeriod: selectedBrood ? bs : null,
      summary: {
        totalChicks: bs.chickCount,
        liveChicks: bs.liveChicks,
        mortalityCount: bs.mortalityCount,
        survivalRate: bs.survivalRate,
        herdAgeDays: bs.ageDays,
        totalBroodDays: bs.totalBroodDays,
        ageProgressPercent: bs.ageProgressPercent,
        perChickDeliveredGrams: bs.perChickDeliveredGrams,
        dailyPerChickGrams: bs.dailyPerChickGrams,
        finalWeight: bs.finalWeight,
        fcr: bs.fcr,
        estimatedFcr: bs.estimatedFcr,
        totalQuotaKg: bs.totalQuotaKg,
        totalDeliveredKg: bs.feedConsumedKg,
        totalRemainingKg: bs.remainingQuotaKg,
        totalQuotaTon: Number((bs.totalQuotaKg / 1000).toFixed(2)),
        totalDeliveredTon: Number((bs.feedConsumedKg / 1000).toFixed(2)),
        totalRemainingTon: Number((bs.remainingQuotaKg / 1000).toFixed(2)),
        overallUsagePercentage: bs.overallUsagePercentage,
        invoicesCount: bs.invoicesCount,
      },
      breakdown: computed.breakdown,
      invoices: formattedInvoices,
    });
  } catch (err: any) {
    console.error('[FARMER STATEMENT ERROR]:', err);
    return res.status(500).json({ error: 'خطا در محاسبه صورتحساب و مانده سهمیه مرغدار.' });
  }
});

/**
 * POST /api/mobile/farmer/broods
 * Create a new breeding period for the farmer
 * Body: { name, startDate (jalali or ISO), chickCount, flockCount, farmerId? }
 */
router.post('/farmer/broods', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && req.body?.farmerId) {
      farmerId = String(req.body.farmerId);
    }

    let farmerRow: any = null;
    if (farmerId) {
      const rows = await db.select().from(farmers).where(eq(farmers.id, farmerId)).limit(1);
      farmerRow = rows[0];
    } else if (req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      farmerRow = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
      if (farmerRow) farmerId = farmerRow.id;
    }

    if (!farmerRow) {
      return res.status(400).json({ error: 'حساب کاربری به هیچ مرغداری متصل نیست.' });
    }

    const rawStartDate = String(req.body?.startDate || '').trim();
    const chickCount = Number(req.body?.chickCount || req.body?.flockCount || 0);

    if (!rawStartDate) {
      return res.status(400).json({ error: 'تاریخ شروع دوره الزامی است.' });
    }
    if (chickCount <= 0) {
      return res.status(400).json({ error: 'تعداد قطعه جوجه باید بزرگتر از صفر باشد.' });
    }

    // Accept both Jalali (1405/07/20) and ISO (2026-10-12) and normalize to ISO for full web/mobile parity
    const dateRegex = /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/;
    if (!dateRegex.test(rawStartDate) || dateDayNumber(rawStartDate) === null) {
      return res.status(400).json({ error: 'فرمت تاریخ نامعتبر است. از فرمت ۱۴۰۵/۰۷/۱۵ استفاده کنید.' });
    }

    const isoStartDate = toIsoDateText(rawStartDate) || rawStartDate;
    const jalaliStart = jalaliText(isoStartDate);
    const name = String(req.body?.name || '').trim() || `دوره جوجه‌ریزی ${jalaliStart}`;

    const catalogCtx = await loadBroodCatalogContext();
    const activeFinishedGoodIds = catalogCtx.canonicalProducts
      .filter((p) => p.type === 'finishedGood' && !p.isDeleted)
      .map((p) => p.id);

    const newBrood = {
      id: `brood_${Date.now()}_${randomUUID().slice(0, 5)}`,
      name,
      startDate: isoStartDate,
      endDate: undefined,
      chickCount,
      flockCount: chickCount,
      exceptionalFeed: [],
      activeProductsAtCreation: activeFinishedGoodIds,
      isArchived: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    const currentBroods = Array.isArray(farmerRow.broods) ? farmerRow.broods : [];
    const updatedBroods = [newBrood, ...currentBroods];

    await db
      .update(farmers)
      .set({ broods: updatedBroods, updatedAt: new Date() })
      .where(eq(farmers.id, farmerRow.id));

    await recordAudit(db, actorFromRequest(req), {
      action: 'CREATE',
      entity: 'farmer_brood',
      targetIds: [newBrood.id],
      changes: [],
      details: `افزودن دوره پرورشی "${name}" با ${chickCount} قطعه جوجه برای مرغدار ${farmerRow.name}`,
      context: { brood: newBrood, farmerId: farmerRow.id },
    });

    return res.status(201).json({
      success: true,
      message: 'دوره پرورشی جدید با موفقیت ایجاد شد.',
      brood: {
        ...newBrood,
        startDateJalali: jalaliStart,
      },
    });
  } catch (err: any) {
    console.error('[FARMER BROOD CREATE ERROR]:', err);
    return res.status(500).json({ error: err.message || 'خطا در ایجاد دوره پرورشی.' });
  }
});

/**
 * PATCH /api/mobile/farmer/broods/:broodId
 * Update a breeding period (close/archive, reopen, update final weight, mortality, chickCount, etc.)
 * Body: { endDate, finalWeight, finalChickenWeight, mortalityCount, feedConsumedKg, isArchived, name, chickCount, startDate }
 */
router.patch('/farmer/broods/:broodId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    let farmerId = req.user?.farmerId;
    const broodId = String(req.params.broodId || '').trim();

    if ((userRole === 'ADMIN' || userRole === 'MANAGER') && (req.body?.farmerId || req.query?.farmerId)) {
      farmerId = String(req.body?.farmerId || req.query?.farmerId);
    }

    let farmerRow: any = null;
    if (farmerId) {
      const rows = await db.select().from(farmers).where(eq(farmers.id, farmerId)).limit(1);
      farmerRow = rows[0];
    } else if (req.user?.phone) {
      const normalizedPhone = normalizeIranianPhone(req.user.phone);
      const allFarmers = await db.select().from(farmers).where(isNull(farmers.deletedAt));
      farmerRow = allFarmers.find((f: any) => normalizeIranianPhone(f.phone) === normalizedPhone);
      if (farmerRow) farmerId = farmerRow.id;
    }

    if (!farmerRow) {
      return res.status(400).json({ error: 'حساب کاربری به هیچ مرغداری متصل نیست.' });
    }

    const currentBroods = Array.isArray(farmerRow.broods) ? farmerRow.broods : [];
    const broodIndex = currentBroods.findIndex((b: any) => b && String(b.id) === broodId);

    if (broodIndex === -1) {
      return res.status(404).json({ error: 'دوره پرورشی مورد نظر یافت نشد.' });
    }

    const brood = currentBroods[broodIndex];
    const updates: any = { ...brood };

    // Update allowed fields
    if (req.body?.name !== undefined) {
      updates.name = String(req.body.name).trim() || brood.name;
    }
    if (req.body?.startDate !== undefined) {
      const sd = String(req.body.startDate).trim();
      if (sd) {
        const dateRegex = /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/;
        if (!dateRegex.test(sd) || dateDayNumber(sd) === null) {
          return res.status(400).json({ error: 'فرمت تاریخ شروع نامعتبر است.' });
        }
        updates.startDate = toIsoDateText(sd) || sd;
      }
    }
    if (req.body?.endDate !== undefined) {
      const endDate = req.body.endDate === null ? '' : String(req.body.endDate).trim();
      if (endDate) {
        const dateRegex = /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/;
        if (!dateRegex.test(endDate) || dateDayNumber(endDate) === null) {
          return res.status(400).json({ error: 'فرمت تاریخ پایان نامعتبر است. از فرمت ۱۴۰۵/۰۷/۱۵ استفاده کنید.' });
        }
        updates.endDate = toIsoDateText(endDate) || endDate;
        updates.isArchived = true;
      } else {
        delete updates.endDate;
        updates.isArchived = false;
      }
    }
    const finalW = req.body?.finalWeight ?? req.body?.finalChickenWeight;
    if (finalW !== undefined) {
      const numW = Number(finalW);
      if (numW > 0) {
        updates.finalWeight = numW;
        updates.finalChickenWeight = numW;
      } else {
        delete updates.finalWeight;
        delete updates.finalChickenWeight;
      }
    }
    if (req.body?.mortalityCount !== undefined) {
      updates.mortalityCount = Math.max(0, Number(req.body.mortalityCount) || 0);
    }
    if (req.body?.feedConsumedKg !== undefined) {
      updates.feedConsumedKg = Number(req.body.feedConsumedKg) || 0;
    }
    if (req.body?.isArchived !== undefined && req.body?.endDate === undefined) {
      updates.isArchived = Boolean(req.body.isArchived);
      if (!updates.isArchived) {
        delete updates.endDate;
      }
    }
    if (req.body?.chickCount !== undefined || req.body?.flockCount !== undefined) {
      const cnt = Number(req.body.chickCount ?? req.body.flockCount) || 0;
      if (cnt > 0) {
        updates.chickCount = cnt;
        updates.flockCount = cnt;
      }
    }

    updates.updatedAt = new Date().toISOString();

    const updatedBroods = [...currentBroods];
    updatedBroods[broodIndex] = updates;

    await db
      .update(farmers)
      .set({ broods: updatedBroods, updatedAt: new Date() })
      .where(eq(farmers.id, farmerRow.id));

    await recordAudit(db, actorFromRequest(req), {
      action: 'UPDATE',
      entity: 'farmer_brood',
      targetIds: [broodId],
      changes: [],
      details: `به‌روزرسانی دوره پرورشی "${updates.name || broodId}" برای مرغدار ${farmerRow.name}`,
      context: { brood: updates, farmerId: farmerRow.id },
    });

    return res.json({
      success: true,
      message: 'دوره پرورشی با موفقیت به‌روزرسانی شد.',
      brood: updates,
    });
  } catch (err: any) {
    console.error('[FARMER BROOD UPDATE ERROR]:', err);
    return res.status(500).json({ error: err.message || 'خطا در به‌روزرسانی دوره پرورشی.' });
  }
});

// ============================================================================
// 5. Manager Experience Endpoints
// ============================================================================

/**
 * GET /api/mobile/manager/kpi
 * Cumulative entry/exit tonnage for today, synced weighbridge count, live warehouse stock
 */
router.get('/manager/kpi', requireAuth, requireRole('ADMIN', 'MANAGER'), async (_req: Request, res: Response) => {
  try {
    const todayJalali = jalaliText(new Date());

    // Format-tolerant "today" match. `invoices.date` is a TEXT column whose canonical value is
    // Jalali `YYYY/MM/DD` (see `createInvoiceInTransaction`), but rows created by the weighbridge
    // `create-remittance` flow used to be written as ISO Gregorian. An exact `eq(date, jalali)`
    // therefore silently read 0 for those rows, which is how the KPI screen came to report zeros
    // while real invoices existed. Matching BOTH spellings fixes the read side without rewriting
    // any historical row; `dateDayNumber` folds the two calendars onto one day number.
    const todayIso = toIsoDateText(todayJalali);
    const todayDay = dateDayNumber(todayJalali);
    const sameDay = (a: string) => {
      if (!a) return false;
      if (a === todayJalali || a === todayIso) return true;
      const n = dateDayNumber(a);
      return n !== null && todayDay !== null && n === todayDay;
    };

    const todayRows = await db.select().from(invoices).where(isNull(invoices.deletedAt));
    const todayInvoices = todayRows.filter((inv: any) => sameDay(String(inv.date || '')));

    let entryTonnageKg = 0;
    let exitTonnageKg = 0;

    for (const inv of todayInvoices) {
      const w = Number(inv.scaleWeight || inv.weight || inv.billWeight || 0);
      if (inv.type === 'entry') {
        entryTonnageKg += w;
      } else if (inv.type === 'exit') {
        exitTonnageKg += w;
      }
    }

    // Weighbridge records synced or weighed today
    const wbTodayCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(weighbridge_records)
      .where(sql`weigh_time::date = CURRENT_DATE OR last_synced_at::date = CURRENT_DATE`);

    // Live inventory for active products
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        type: products.type,
        unit: products.unit,
        currentStock: products.currentStock,
        minStock: products.minStock,
      })
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.isActive, true)));

    const inventory = productRows.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      unit: p.unit || 'kg',
      currentStock: Number(p.currentStock || 0),
      minStock: p.minStock ? Number(p.minStock) : null,
    }));

    return res.json({
      todayJalali,
      entryTonnageKg,
      exitTonnageKg,
      entryTonnageTon: Number((entryTonnageKg / 1000).toFixed(2)),
      exitTonnageTon: Number((exitTonnageKg / 1000).toFixed(2)),
      todayInvoicesCount: todayInvoices.length,
      weighbridgeTicketsToday: Number(wbTodayCount[0]?.count || 0),
      inventory,
    });
  } catch (err: any) {
    console.error('[MANAGER KPI ERROR]:', err);
    return res.status(500).json({ error: 'خطا در بارگذاری شاخص‌های کلیدی (KPI).' });
  }
});

/**
 * GET /api/mobile/manager/weighbridge & /api/mobile/operator/weighbridge
 * List of active weighbridge records from weighbridge_records table
 */
const weighbridgeMonitorHandler = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const status = req.query.status ? String(req.query.status) : null;
    const direction = req.query.direction ? String(req.query.direction).toLowerCase() : null;

    let query = db.select().from(weighbridge_records);

    const conditions = [];
    if (status) {
      conditions.push(eq(weighbridge_records.status, status));
    }
    if (direction && (direction === 'entry' || direction === 'exit')) {
      conditions.push(eq(weighbridge_records.direction, direction));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const records = await query
      .orderBy(desc(weighbridge_records.weighTime), desc(weighbridge_records.createdAt))
      .limit(limit);

    const formatted = records.map((r: any) => {
      const gross = r.grossWeight ? Number(r.grossWeight) : 0;
      const tare = r.tareWeight ? Number(r.tareWeight) : 0;
      // «خالص‌شده» needs BOTH weighings: the old `gross - tare` fallback returned the FULL load as «net»
      // for a ticket that had only been weighed once (its other column still 0), so the monitor screen
      // showed a half-weighed truck as netted. The stored net is only trusted once both weighings exist,
      // and the net stays null (→ «در انتظار خروج» in the app) until then.
      const net = gross > 0 && tare > 0 ? (r.netWeight ? Number(r.netWeight) : gross - tare) : null;

      return {
        id: r.id,
        externalId: r.externalId,
        ticketNumber: r.ticketNumber || '-',
        plateNumber: r.plateNumber || '-',
        driverName: r.driverName || 'نامشخص',
        customerName: r.customerName || null,
        goods: r.goods || null,
        direction: r.direction,
        status: r.status,
        grossWeight: gross,
        tareWeight: tare,
        netWeight: net,
        weighTime: r.weighTime,
        isMapped: !!r.mappedRemittanceId,
        mappedRemittanceId: r.mappedRemittanceId,
      };
    });

    return res.json({ records: formatted });
  } catch (err: any) {
    console.error('[WEIGHBRIDGE MONITOR ERROR]:', err);
    return res.status(500).json({ error: 'خطا در دریافت اطلاعات قبوض باسکول.' });
  }
};

router.get('/manager/weighbridge', requireAuth, requireRole('ADMIN', 'MANAGER', 'OPERATOR'), weighbridgeMonitorHandler);
router.get('/operator/weighbridge', requireAuth, requireRole('ADMIN', 'MANAGER', 'OPERATOR'), weighbridgeMonitorHandler);

export default router;
