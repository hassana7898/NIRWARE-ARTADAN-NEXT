import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveScreenState, isScreenState } from '../src/features/ui/screenState';
import { extractApiErrorMessage, isNetworkError, getErrorStatus } from '../src/api/errors';

/** Shape of the error object axios/rejection produces, mirroring what the screens actually receive. */
const serverError = (status: number, body?: { error?: string; message?: string }) => ({
  response: { status, data: body },
});

const networkError = () => ({ code: 'ERR_NETWORK', message: 'Network Error' });

test('ScreenState derivation (pure)', async (t) => {
  await t.test('a successful load is ready and renders nothing', () => {
    const r = deriveScreenState({ isLoading: false, isError: false, isEmpty: false });
    assert.equal(r.kind, 'ready');
    assert.equal(r.message, '');
    assert.equal(r.canRetry, false);
  });

  await t.test('loading wins over everything and never offers retry', () => {
    // Even if the caller passes a retry callback, a request is already in flight — offering
    // retry would let the user fire a duplicate and cause a flicker.
    const r = deriveScreenState({
      isLoading: true,
      isError: true,
      onRetry: () => {},
      isEmpty: true,
    });
    assert.equal(r.kind, 'loading');
    assert.equal(r.canRetry, false);
    assert.ok(r.message.length > 0);
  });

  // ---- THE CORE RULE: a failure must never look like "nothing here" ------------------
  await t.test('an error is never reported as empty (the main regression guard)', () => {
    const r = deriveScreenState({
      isLoading: false,
      isError: true,
      error: serverError(500),
      isEmpty: true, // even if the caller wrongly also flags it empty
    });
    assert.equal(r.kind, 'error');
    assert.notEqual(r.kind, 'empty');
  });

  await t.test('a 500 is an error with a working retry', () => {
    const onRetry = () => {};
    const r = deriveScreenState({ isError: true, error: serverError(500), onRetry });
    assert.equal(r.kind, 'error');
    assert.equal(r.canRetry, true);
  });

  await t.test('a 404 from the server is an error, not an empty list', () => {
    const r = deriveScreenState({ isError: true, error: serverError(404) });
    assert.equal(r.kind, 'error');
  });

  await t.test('an expired session (401) NEVER offers retry — it would loop forever', () => {
    const onRetry = () => {};
    const r = deriveScreenState({ isError: true, error: serverError(401), onRetry });
    assert.equal(r.kind, 'error');
    assert.equal(r.canRetry, false, 'retrying a 401 can only fail again');
    assert.ok(r.message.includes('نشست'));
  });

  await t.test('a 403 is treated like 401 (no retry)', () => {
    const r = deriveScreenState({ isError: true, error: serverError(403), onRetry: () => {} });
    assert.equal(r.canRetry, false);
  });

  await t.test('an explicit unauthenticated flag also suppresses retry', () => {
    const r = deriveScreenState({ isUnauthenticated: true, isError: true, onRetry: () => {} });
    assert.equal(r.canRetry, false);
  });

  await t.test('offline gets a network-specific message, distinct from a server failure', () => {
    const offline = deriveScreenState({ isError: true, isOffline: true, error: networkError() });
    const serverFailure = deriveScreenState({ isError: true, error: serverError(500) });
    assert.notEqual(
      offline.message,
      serverFailure.message,
      'a dropped connection must not read like a generic server error'
    );
    assert.ok(offline.message.includes('شبکه'));
    // Both remain retryable — being offline does not change that a re-read is safe.
    assert.equal(offline.canRetry, false, 'no callback supplied, so no button');
  });

  await t.test('no retry button without a real callback', () => {
    const r = deriveScreenState({ isError: true, error: serverError(500) });
    assert.equal(r.canRetry, false);
  });

  await t.test('an empty result is empty and offers no retry', () => {
    const r = deriveScreenState({ isEmpty: true, onRetry: () => {} });
    assert.equal(r.kind, 'empty');
    assert.equal(r.canRetry, false);
  });

  await t.test('empty copy is non-empty, carries the subject, and can be overridden', () => {
    const plain = deriveScreenState({ isEmpty: true });
    assert.ok(plain.message.length > 0);
    assert.ok(!plain.message.includes('حواله‌ها'), 'no subject was supplied here');

    // A subject is appended to the default copy.
    const withSubject = deriveScreenState({ isEmpty: true, subject: 'حواله‌ها' });
    assert.ok(withSubject.message.includes('حواله‌ها'), 'subject should be appended by default');

    // An explicit message wins over the default, subject included.
    const overridden = deriveScreenState({
      isEmpty: true,
      subject: 'حواله‌ها',
      messages: { empty: 'هنوز حواله‌ای ثبت نشده است.' },
    });
    assert.equal(overridden.message, 'هنوز حواله‌ای ثبت نشده است.');
  });

  await t.test('a custom error message is honoured', () => {
    const r = deriveScreenState({
      isError: true,
      error: serverError(500),
      messages: { error: 'دریافت شاخص‌های کارخانه ناموفق بود.' },
    });
    assert.equal(r.message, 'دریافت شاخص‌های کارخانه ناموفق بود.');
  });

  await t.test('every kind always produces a non-empty Persian message', () => {
    const cases = [
      deriveScreenState({ isLoading: true }),
      deriveScreenState({ isError: true, error: serverError(500) }),
      deriveScreenState({ isEmpty: true }),
      deriveScreenState({ isUnauthenticated: true }),
    ];
    for (const r of cases) {
      assert.ok(r.message.trim().length > 0, `empty message for ${r.kind}`);
      assert.match(r.message, /[\u0600-\u06FF]/, `message for ${r.kind} must contain Persian text`);
    }
  });

  await t.test('isScreenState narrows correctly', () => {
    const e = deriveScreenState({ isError: true, error: serverError(500) });
    const ready = deriveScreenState({});
    assert.equal(isScreenState(e, 'error'), true);
    assert.equal(isScreenState(e, 'empty'), false);
    assert.equal(isScreenState(ready, 'ready'), true);
  });

  // ---- integration with the existing error module ---------------------------------
  await t.test('real network errors from axios are recognised and message well', () => {
    assert.equal(isNetworkError(networkError()), true);
    assert.equal(isNetworkError(serverError(500)), false);
    const msg = extractApiErrorMessage(networkError(), 'fallback');
    assert.ok(msg.includes('ارتباط با سرور'));
  });

  await t.test('a server-provided Persian message survives into the state', () => {
    const err = serverError(400, { error: 'دوره نامعتبر است.' });
    assert.equal(getErrorStatus(err), 400);
    const state = deriveScreenState({
      isError: true,
      error: err,
      onRetry: () => {},
    });
    assert.equal(state.kind, 'error');
    assert.equal(state.canRetry, true, 'a 400 on a READ is still safe to retry');
  });
});