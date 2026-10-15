import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readBroodCounts,
  isCountsError,
  type BroodCountsResult,
} from '../src/features/farmer/broodValidation';

const INVALID_CHICK_ERROR = 'تعداد جوجه اولیه نامعتبر است. لطفاً عددی بزرگتر از صفر وارد کنید.';
const OVER_QUOTA_ERROR =
  'تعداد تلفات (1,500) نمی‌تواند بیشتر از تعداد جوجه اولیه (1,000) باشد.';

/** Asserts the failure branch and returns its message. */
const expectError = (result: BroodCountsResult): string => {
  assert.ok(isCountsError(result), `expected a validation error, got ${JSON.stringify(result)}`);
  return result.error;
};

test('Brood form validation (pure)', async (t) => {
  await t.test('accepts a normal flock and returns both counts', () => {
    const r = readBroodCounts({
      chickCountField: '25000',
      mortalityCountField: '350',
      mode: 'update',
      storedChickCount: 25000,
    });
    assert.deepEqual(r, { chick: 25000, mort: 350 });
  });

  await t.test('reads Persian and Arabic-Indic digits as ASCII', () => {
    const r = readBroodCounts({
      chickCountField: '۲۵۰۰۰',
      mortalityCountField: '٣٥٠', // Arabic-Indic
      mode: 'update',
      storedChickCount: 0,
    });
    assert.deepEqual(r, { chick: 25000, mort: 350 });
  });

  await t.test('a mortality of exactly zero is accepted (never forbidden)', () => {
    const r = readBroodCounts({
      chickCountField: '10000',
      mortalityCountField: '0',
      mode: 'update',
      storedChickCount: 0,
    });
    assert.deepEqual(r, { chick: 10000, mort: 0 });
  });

  await t.test('an empty mortality field is treated as zero', () => {
    const r = readBroodCounts({
      chickCountField: '8000',
      mortalityCountField: '',
      mode: 'update',
      storedChickCount: 0,
    });
    assert.deepEqual(r, { chick: 8000, mort: 0 });
  });

  await t.test('rejects mortality greater than the flock (the core rule)', () => {
    expectError(
      readBroodCounts({
        chickCountField: '1000',
        mortalityCountField: '1500',
        mode: 'update',
        storedChickCount: 1000,
      })
    ).includes('نمی‌تواند بیشتر از تعداد جوجه اولیه');
  });

  await t.test('the over-quota message quotes both offending numbers', () => {
    const msg = expectError(
      readBroodCounts({
        chickCountField: '1000',
        mortalityCountField: '1500',
        mode: 'update',
        storedChickCount: 1000,
      })
    );
    assert.equal(msg, OVER_QUOTA_ERROR);
  });

  await t.test('the boundary mortality === chickCount is still valid', () => {
    const r = readBroodCounts({
      chickCountField: '1000',
      mortalityCountField: '1000',
      mode: 'update',
      storedChickCount: 1000,
    });
    assert.deepEqual(r, { chick: 1000, mort: 1000 });
  });

  await t.test('mortality one over the flock is rejected', () => {
    expectError(
      readBroodCounts({
        chickCountField: '1000',
        mortalityCountField: '1001',
        mode: 'update',
        storedChickCount: 1000,
      })
    );
  });

  await t.test('rejects a zero, blank or negative effective chick count', () => {
    for (const chickCountField of ['0', '', 'abc']) {
      const msg = expectError(
        readBroodCounts({
          chickCountField,
          mortalityCountField: '10',
          mode: 'update',
          storedChickCount: 0, // update mode ignores the stored value
        })
      );
      assert.equal(msg, INVALID_CHICK_ERROR);
    }
  });

  await t.test('archive mode uses the stored chick count, not the empty field', () => {
    const r = readBroodCounts({
      chickCountField: '', // not rendered in archive mode
      mortalityCountField: '400',
      mode: 'archive',
      storedChickCount: 20000,
    });
    assert.deepEqual(r, { chick: 20000, mort: 400 });
  });

  await t.test('archive mode still enforces the ceiling against the stored flock', () => {
    const msg = expectError(
      readBroodCounts({
        chickCountField: '',
        mortalityCountField: '25000',
        mode: 'archive',
        storedChickCount: 20000,
      })
    );
    assert.ok(msg.includes('نمی‌تواند بیشتر از تعداد جوجه اولیه'));
  });

  await t.test('archive mode rejects a brood whose stored chick count is unusable', () => {
    const msg = expectError(
      readBroodCounts({
        chickCountField: '',
        mortalityCountField: '10',
        mode: 'archive',
        storedChickCount: 0,
      })
    );
    assert.equal(msg, INVALID_CHICK_ERROR);
  });

  await t.test('an empty chick field in update mode falls back to the stored count', () => {
    const r = readBroodCounts({
      chickCountField: '',
      mortalityCountField: '120',
      mode: 'update',
      storedChickCount: 5000,
    });
    assert.deepEqual(r, { chick: 5000, mort: 120 });
  });

  await t.test('a fractional chick count is truncated, not rejected', () => {
    // Digits-only parsing removes the '.', so '1000.5' is read as '10005'.
    const r = readBroodCounts({
      chickCountField: '1000.5',
      mortalityCountField: '5',
      mode: 'update',
      storedChickCount: 0,
    });
    assert.deepEqual(r, { chick: 10005, mort: 5 });
  });

  // ---------------------------------------------------------------------------
  // KNOWN GAP — locked in on purpose so it cannot regress silently.
  // `digitsOnly()` deletes every non-digit, so a leading '-' is removed before parsing and the
  // "mortality must not be negative" branch is unreachable from the UI. Fixing it would change
  // user-visible behaviour, so it is documented rather than silently altered.
  // ---------------------------------------------------------------------------
  await t.test('KNOWN GAP: a negative mortality is currently NOT rejected (minus is stripped)', () => {
    const r = readBroodCounts({
      chickCountField: '1000',
      mortalityCountField: '-450',
      mode: 'update',
      storedChickCount: 1000,
    });
    // Actual behaviour: 450, not an error. If this ever starts failing, the gap was closed.
    assert.deepEqual(r, { chick: 1000, mort: 450 });
  });

  await t.test('KNOWN GAP: trailing garbage is silently discarded', () => {
    const r = readBroodCounts({
      chickCountField: '1000',
      mortalityCountField: '450abc',
      mode: 'update',
      storedChickCount: 1000,
    });
    assert.deepEqual(r, { chick: 1000, mort: 450 });
  });

  await t.test('isCountsError discriminates the two branches', () => {
    assert.equal(isCountsError({ error: 'x' }), true);
    assert.equal(isCountsError({ chick: 1, mort: 0 }), false);
  });
});