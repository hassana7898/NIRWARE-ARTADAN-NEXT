/**
 * Pure decision logic for the shared screen-state banner.
 *
 * The rule this file exists to enforce: **a failure must never be rendered as "nothing here"**.
 * A dropped connection, a 500 and an expired session are three different situations and each one
 * needs different text and a different (or absent) action.
 *
 * Kept free of React so it can be unit-tested without a device or simulator.
 */

/** Why the screen cannot show data. Each kind carries its own wording and action policy. */
export type ScreenStateKind = 'loading' | 'error' | 'empty' | 'ready';

export interface DeriveStateInput {
  /** True only for the FIRST load. A background refetch must not blank the screen. */
  isLoading?: boolean;
  /** True when the request rejected. */
  isError?: boolean;
  /** True when the session is gone (401/403). Retrying cannot fix it and would loop forever. */
  isUnauthenticated?: boolean;
  /** True when the user is currently offline. */
  isOffline?: boolean;
  /** The server rejected the request. */
  error?: unknown;
  /** True when the request succeeded but the collection is empty. */
  isEmpty?: boolean;
  /** A safe, side-effect-free way to re-run the READ. Absent means no retry button. */
  onRetry?: () => void;
  /** Custom copy; falls back to role-appropriate Persian defaults. */
  messages?: Partial<Record<Exclude<ScreenStateKind, 'ready'>, string>>;
  /** Short noun of what was being loaded, e.g. «حواله‌ها» / «کارنامه دوره». */
  subject?: string;
}

export interface ScreenStateResult {
  kind: ScreenStateKind;
  /** Persian text, always non-empty. */
  message: string;
  /** Whether a retry control may be rendered. Only true for a genuine READ retry. */
  canRetry: boolean;
  /** Whether an optional secondary action (e.g. «ثبت دوره جدید») may be rendered. */
  canAct: boolean;
}

const DEFAULT_LOADING = 'در حال دریافت اطلاعات...';
const DEFAULT_ERROR = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.';
const DEFAULT_NETWORK_ERROR = 'ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.';
const DEFAULT_SESSION_ERROR = 'نشست شما پایان یافته است. دوباره وارد شوید.';
const DEFAULT_EMPTY = 'اطلاعاتی برای نمایش وجود ندارد.';

/** 401/403 mean the session is gone; any other status is a retryable server-side problem. */
const isSessionStatus = (status: unknown): boolean => status === 401 || status === 403;

/**
 * Classifies a request result into exactly one screen state.
 *
 * Precedence is deliberate: an error outranks "empty" so a failure is never disguised as an empty
 * list, and an expired session outranks the generic error so the user is not invited to retry a
 * request that will always be rejected.
 */
export const deriveScreenState = (input: DeriveStateInput): ScreenStateResult => {
  const m = input.messages || {};
  const subject = input.subject ? ` ${input.subject}` : '';

  if (input.isLoading) {
    // A retry control is pointless while a request is already in flight — it would let the user
    // fire a second one and cause a flicker.
    return {
      kind: 'loading',
      message: m.loading || `${DEFAULT_LOADING}`,
      canRetry: false,
      canAct: false,
    };
  }

  if (input.isUnauthenticated) {
    // Never offer retry here: the request will be rejected again until the user signs in again.
    return {
      kind: 'error',
      message: m.error || DEFAULT_SESSION_ERROR,
      canRetry: false,
      canAct: false,
    };
  }

  if (input.isError) {
    const status = (input.error as { response?: { status?: number } } | undefined)?.response?.status;
    const sessionGone = isSessionStatus(status);
    // A 401/403 can only be fixed by signing in again, so the retry control is withheld —
    // otherwise the button invites the user to loop on a request that will always be rejected.
    const canRetry = !sessionGone && typeof input.onRetry === 'function';
    const base = sessionGone ? DEFAULT_SESSION_ERROR : m.error || DEFAULT_ERROR;
    return {
      kind: 'error',
      message: input.isOffline ? m.error || DEFAULT_NETWORK_ERROR : base,
      canRetry,
      canAct: false,
    };
  }

  if (input.isEmpty) {
    return {
      kind: 'empty',
      message: m.empty || `${DEFAULT_EMPTY}${subject}`,
      canRetry: false,
      canAct: false,
    };
  }

  return { kind: 'ready', message: '', canRetry: false, canAct: false };
};

/** Narrowing helper for screens that branch on the result. */
export const isScreenState = (result: ScreenStateResult, kind: ScreenStateKind): boolean =>
  result.kind === kind;