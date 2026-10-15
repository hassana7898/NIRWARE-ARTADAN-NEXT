/**
 * Pure helpers for the mobile weighbridge operations screen.
 *
 * WHY THIS FILE EXISTS: the mobile weighbridge screen was READ-ONLY — it could list tickets but had
 * no map / unmap / create-remittance capability, while the web panel (pages/WeighbridgePage.tsx)
 * exposes all four against the SAME backend routes in `server/routes/weighbridge.ts`.
 *
 * The payload builders and the response/error readers live here with no axios and no React so
 * `tests/phase2ManagerScreens.test.ts` can pin the exact request/response contract. The screen only
 * decides WHEN to call; this module decides WHAT is sent and HOW the answer is read.
 *
 * Backend contract (verified against server/routes/weighbridge.ts):
 *   POST   /api/weighbridge/records/:id/map               body { invoiceId }        -> 200 { success, data }
 *   POST   /api/weighbridge/records/:id/unmap                                            -> 200 { success, data }
 *   POST   /api/weighbridge/records/:id/create-remittance body { type?, productId, ... } -> 200 { success, data }
 *   PATCH  /api/weighbridge/records/:id/direction          body { direction }        -> 200 { success }
 * Failure bodies are `{ success: false, error: string }` with 400/404/409/500.
 */

export type WeighbridgeDirection = 'entry' | 'exit';

export interface MapTicketInput {
  ticketId: number | string;
  invoiceId: string;
}

export interface CreateRemittanceInput {
  ticketId: number | string;
  /** 'entry' | 'exit'. Omitted lets the server derive it from the net weight / scale direction. */
  type?: WeighbridgeDirection;
  productId: string;
  productName?: string;
  weight?: number;
  date?: string;
  driverName?: string;
  driverPhone?: string;
  farmerId?: string;
  farmerName?: string;
  sellerName?: string;
  billNumber?: string;
  invoiceNumber?: string;
  origin?: string;
  notes?: string;
}

export interface TicketRecord {
  id: number | string;
  ticketNumber?: string | null;
  plateNumber?: string | null;
  driverName?: string | null;
  customerName?: string | null;
  goods?: string | null;
  direction?: string | null;
  status?: string | null;
  grossWeight?: number | null;
  tareWeight?: number | null;
  netWeight?: number | null;
  weighTime?: string | null;
  isMapped?: boolean;
  mappedRemittanceId?: string | null;
}

/** The payload the map endpoint expects. */
export const buildMapPayload = (input: MapTicketInput): { invoiceId: string } => ({
  invoiceId: String(input.invoiceId || '').trim(),
});

/** True when the ticket can be assigned at all (not already linked to this or another invoice). */
export const canMapTicket = (ticket: TicketRecord, invoiceId?: string): boolean => {
  if (!ticket || ticket.isMapped) {
    if (!ticket?.isMapped) return false;
    // Already mapped: only a no-op re-map to the SAME invoice is allowed by the server.
    return !!invoiceId && String(ticket.mappedRemittanceId) === String(invoiceId);
  }
  return true;
};

/** True when the ticket can be unlinked. */
export const canUnmapTicket = (ticket: TicketRecord): boolean => !!ticket && !!ticket.isMapped;

/** True when a remittance may be created from this ticket (never for an already-linked one). */
export const canCreateRemittance = (ticket: TicketRecord): boolean => !!ticket && !ticket.isMapped;

/**
 * Validate a create-remittance form before it is sent, so an obviously invalid request never costs
 * a round-trip. Mirrors the server's own 400s (missing productId) and the exit-flow farmer rule.
 */
export interface CreateValidation {
  valid: boolean;
  error?: string;
}

export const validateCreateRemittance = (input: CreateRemittanceInput): CreateValidation => {
  if (String(input.ticketId ?? '') === '') return { valid: false, error: 'شناسه قبض باسکول نامعتبر است' };

  const productId = String(input.productId || '').trim();
  if (!productId) return { valid: false, error: 'انتخاب محصول الزامی است' };

  const weight = input.weight;
  if (weight !== undefined && (!Number.isFinite(weight) || weight <= 0)) {
    return { valid: false, error: 'وزن باید بزرگ‌تر از صفر باشد' };
  }

  // A Jalali date, when supplied, must be a real Jalali day — `jalaliText` yields '' for garbage.
  if (input.date !== undefined && input.date !== null && String(input.date).trim()) {
    const normalised = jalaliTextSafe(String(input.date));
    if (!normalised) return { valid: false, error: 'تاریخ شمسی معتبر نیست' };
  }

  return { valid: true };
};

/** The payload for create-remittance: only fields the user actually filled are sent. */
export const buildCreateRemittancePayload = (
  input: CreateRemittanceInput
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (input.type) payload.type = input.type;
  const productId = String(input.productId || '').trim();
  if (productId) payload.productId = productId;
  if (input.productName) payload.productName = input.productName;

  const weight = input.weight;
  if (weight !== undefined && Number.isFinite(weight) && weight > 0) payload.weight = weight;

  if (input.date && String(input.date).trim()) {
    // A date the operator typed may be Jalali (the form's native format) or ISO Gregorian. Both are
    // normalised to the column's canonical Jalali form before the request leaves the client, so the
    // shared backend service never has to guess which calendar the caller used.
    const normalised = normaliseAnyDate(String(input.date));
    if (normalised) payload.date = normalised;
  }

  const opts: Record<string, unknown> = {
    driverName: input.driverName,
    driverPhone: input.driverPhone,
    farmerId: input.farmerId,
    farmerName: input.farmerName,
    sellerName: input.sellerName,
    billNumber: input.billNumber,
    invoiceNumber: input.invoiceNumber,
    origin: input.origin,
    notes: input.notes,
  };
  for (const [key, value] of Object.entries(opts)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      payload[key] = String(value).trim();
    }
  }

  return payload;
};

/** A ticket is «netted» only once BOTH weighings exist — the server's own predicate. */
export const isTicketNetted = (ticket: TicketRecord): boolean => {
  const gross = Number(ticket?.grossWeight ?? 0);
  const tare = Number(ticket?.tareWeight ?? 0);
  const net = Number(ticket?.netWeight ?? 0);
  return gross > 0 && tare > 0 && net > 0;
};

import { toIsoDateText, toJalali } from '../../utils/jalali';

export type WeighbridgeAction =
  | 'map'
  | 'unmap'
  | 'createRemittance'
  | 'direction';

export interface WeighbridgeActionOutcome {
  ok: boolean;
  /** Persian message ready for the UI, taken from the server when present. */
  message: string;
  error: boolean;
}

/**
 * Read a write response uniformly.
 *
 * The server answers `{ success: true, message?, data? }` on success and
 * `{ success: false, error }` with 4xx/5xx otherwise. `axios` rejects on non-2xx, so the error path
 * reads `err.response.data`. A network failure carries NO response — that must never be reported as
 * a success, and must not be flattened into a generic "done".
 */
export const readWeighbridgeOutcome = (
  status: number | undefined,
  body: any,
  fallbackMessage: string
): WeighbridgeActionOutcome => {
  const isHttpOk = typeof status === 'number' && status >= 200 && status < 300;
  if (!isHttpOk) {
    const serverMessage =
      body?.error ||
      body?.message ||
      (status === 409
        ? 'این عملیات با وضعیت فعلی قبض سازگار نیست.'
        : status === 404
        ? 'قبض باسکول یا حوالهٔ انتخاب‌شده یافت نشد.'
        : status === 401 || status === 403
        ? 'دسترسی لازم برای این عملیات را ندارید.'
        : 'خطای سرور در انجام عملیات');
    return { ok: false, error: true, message: String(serverMessage) };
  }

  const success = body?.success !== false;
  if (!success) {
    return { ok: false, error: true, message: String(body?.error || body?.message || fallbackMessage) };
  }

  return { ok: true, error: false, message: String(body?.message || fallbackMessage) };
};

/** The direction the server will infer when `type` is omitted (net > 0 ⇒ exit). */
export const inferredDirection = (ticket: TicketRecord): WeighbridgeDirection =>
  Number(ticket?.netWeight ?? 0) > 0 ? 'exit' : 'entry';

/* ------------------------------------------------------------------------------------------------
 * Date normalisation — from the SAME module the server uses.
 *
 * `shared/jalali` is a pure module (zero imports: verified — it is the exact file
 * `server/services/invoiceService.ts` and `server/repositories/invoiceRepository.ts` call), so the
 * client and the server cannot disagree about which calendar day a string denotes. Writing a second
 * calendar implementation here was tried and rejected: it produced `2025-09-16 -> 4226/06/22`.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Canonical Jalali `YYYY/MM/DD` from either input calendar.
 *
 * The screen only offers Jalali pickers, but a value can arrive pasted/typed as ISO Gregorian (an
 * operator copying from the scale software). Both are accepted so the payload the backend receives
 * is always in the one format `invoices.date` stores.
 */
const normaliseAnyDate = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = toIsoDateText(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const j = toJalali(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
};

/** Reject anything that is not a Jalali day the operator could pick. */
const jalaliTextSafe = (value: string): string => {
  const m = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/.exec(String(value).trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y >= 1700) return ''; // an ISO value is not a Jalali day the operator can pick
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${m[1]}/${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
};

