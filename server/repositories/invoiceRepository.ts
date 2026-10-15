import { eq, and, isNull, desc, asc, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { invoices } from '../db/schema';
import { dateDayNumber, jalaliText, toIsoDateText } from '../../shared/jalali';

/**
 * Format-tolerant date predicate for the invoice list.
 *
 * `invoices.date` is canonically Jalali `YYYY/MM/DD`, but rows written by the old weighbridge
 * `create-remittance` flow hold Gregorian ISO `YYYY-MM-DD`. A plain TEXT `>=` / `<=` comparison is
 * wrong for BOTH spellings: a Jalali range never contains an ISO row (`1405/…` sorts before
 * `2026/…` as text), and an ISO range would skip every Jalali row.
 *
 * The fix compares the GREGORIAN DAY each value denotes. Postgres resolves either spelling to the
 * same date (`to_date(date,'YYYY/MM/DD')` for Jalali, `date::date` for ISO), so one range covers
 * both. This is a READ-side fix only: no historical row is rewritten.
 */
const dateRangePredicate = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return null;

  /**
   * Format-tolerant range.
   *
   * `invoices.date` is canonically Jalali `YYYY/MM/DD`, but rows written by the old weighbridge
   * `create-remittance` flow hold Gregorian ISO. A single TEXT comparison cannot span the two, and
   * neither can `to_date(date,'YYYY/MM/DD')` — Postgres reads that as a GREGORIAN date (verified:
   * `to_date('1404/06/25','YYYY/MM/DD')` → `1404-06-25`), so a Jalali range matched the wrong day
   * and dropped real rows.
   *
   * The correct key is the calendar-independent day ordinal (`dateDayNumber` in shared/jalali, which
   * folds both spellings). It cannot be computed in SQL without re-implementing the Jalali calendar
   * in Postgres, so instead the SAME day range is expressed in BOTH spellings and OR-ed together.
   * `toIsoDateText`/`jalaliText` are the very conversions the rest of the app already trusts.
   */
  const toGreg = (v: string) => toIsoDateText(v);
  const toJ = (v: string) => jalaliText(v);

  const start = startDate;
  const end = endDate ?? startDate;

  if (!start || !end) return null;

  const startGreg = toGreg(start);
  const endGreg = toGreg(end);
  const startJalali = toJ(start);
  const endJalali = toJ(end);

  // Both bounds, in the calendar the ROW uses.
  //
  // For a ranged query the two spellings are alternative representations of the SAME day, so a row
  // matching either clause is inside the range: they are OR-ed.
  const inJalali = startJalali && endJalali ? sql`${invoices.date} BETWEEN ${startJalali} AND ${endJalali}` : null;
  const inGreg = startGreg && endGreg ? sql`${invoices.date} BETWEEN ${startGreg} AND ${endGreg}` : null;

  // For an open-ended bound the two spellings are NOT alternatives: a legacy ISO row and a
  // canonical Jalali row describe different calendars, so an OR would compare apples to oranges
  // (`'1404/06/26' <= '2025-09-16'` is true as TEXT while the row is 26 Tir). Each spelling is
  // therefore bounded on its own terms: the row matches if EITHER bound holds within its own
  // calendar, produced by filtering the column's own format first.
  const openJalali = startJalali || endJalali;
  const openGreg = startGreg || endGreg;

  const clauses: any[] = [];

  if (startDate && endDate) {
    if (inJalali && inGreg) clauses.push(or(inJalali, inGreg)!);
    else if (inJalali) clauses.push(inJalali);
    else if (inGreg) clauses.push(inGreg);
  } else {
    // One-sided: keep the comparison inside the row's own calendar.
    const side = startDate ? 'from' : 'to';
    if (openJalali) {
      const bound = startJalali || endJalali;
      clauses.push(
        side === 'from'
          ? sql`${invoices.date} >= ${bound}`
          : sql`${invoices.date} <= ${bound}`
      );
    }
    if (openGreg) {
      const bound = startGreg || endGreg;
      clauses.push(
        side === 'from'
          ? sql`${invoices.date} >= ${bound}`
          : sql`${invoices.date} <= ${bound}`
      );
    }
  }

  return clauses.length ? or(...clauses)! : null;
};
export interface InvoiceQueryParams {
  page?: number;
  limit?: number;
  type?: 'entry' | 'exit';
  search?: string;
  startDate?: string;
  endDate?: string;
  farmerId?: string;
  productId?: string;
}

export const findInvoicesWithPagination = async (params: InvoiceQueryParams) => {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(200, Math.max(1, params.limit || 50));
  const offset = (page - 1) * limit;

  const conditions = [isNull(invoices.deletedAt)];

  if (params.type) {
    conditions.push(eq(invoices.type, params.type));
  }
  if (params.farmerId) {
    conditions.push(eq(invoices.farmerId, params.farmerId));
  }
  if (params.productId) {
    conditions.push(eq(invoices.productId, params.productId));
  }
  if (params.startDate || params.endDate) {
    // Format-tolerant range: matches both canonical Jalali rows and legacy ISO rows (see the
    // helper's comment) so no historical invoice falls outside its real day.
    const rangePredicate = dateRangePredicate(params.startDate, params.endDate);
    if (rangePredicate) conditions.push(rangePredicate);
  }
  if (params.search && params.search.trim()) {
    const q = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(invoices.driverName, q),
        ilike(invoices.sellerName, q),
        ilike(invoices.billNumber, q),
        ilike(invoices.invoiceNumber, q),
        ilike(invoices.productName, q),
        // Invoice free-text (Persian «توضیحات»). The only free-text column on the
        // `invoices` table is `notes` (`invoices.notes`); it is shared by BOTH entry
        // and exit rows, so this single predicate covers both invoice kinds.
        ilike(invoices.notes, q),
        // Exit sub-type / description free-text (already surfaced in the UI).
        ilike(invoices.productVariant, q)
      )!
    );
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const [totalRows, data] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(invoices).where(whereClause),
    db.select().from(invoices).where(whereClause).orderBy(desc(invoices.date), desc(invoices.createdAt), desc(invoices.id)).limit(limit).offset(offset),
  ]);

  const total = Number(totalRows[0]?.count || 0);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};
