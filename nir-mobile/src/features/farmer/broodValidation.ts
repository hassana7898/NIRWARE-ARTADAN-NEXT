/**
 * Pure domain logic for the Brood Period form (create / update / archive).
 *
 * Extracted from `screens/farmer/ManageBroodModal.tsx` so the numeric contract of the form is
 * testable without a React Native runtime. Nothing here touches state, the API or the view layer.
 *
 * NOTE ON THE PARSING CONTRACT (read before changing anything):
 * both fields are normalised with `toAsciiDigits(...).replace(/[^\d]/g, '')`, which DELETES every
 * non-digit before parsing. Two consequences are inherited from the existing UI and are locked in
 * by the test-suite on purpose:
 *   1. a leading minus is stripped, so a negative entry is never seen as negative;
 *   2. trailing garbage is stripped too, so `'12abc'` is read as `12`.
 * The two defensive branches below therefore cannot be reached from the UI. They are kept because
 * removing them would change behaviour, and `tests/broodValidation.test.ts` documents the gap.
 */

import { toAsciiDigits } from '../../utils/persianText';
import { formatNumberWithCommas } from '../../utils/formatters';

/** Validation outcome: either a user-facing failure message, or the accepted counts. */
export type BroodCountsResult = { error: string } | { chick: number; mort: number };

export interface ReadBroodCountsInput {
  /** Raw text of the "initial chicks" field, exactly as the user typed it. */
  chickCountField: string;
  /** Raw text of the "mortality" field, exactly as the user typed it. */
  mortalityCountField: string;
  /**
   * `archive` mode does not render the chick-count input, so the persisted value is authoritative.
   */
  mode: 'update' | 'archive';
  /** `brood.chickCount` as delivered by the API, used when the field is absent. */
  storedChickCount: number;
}

/** Strips Persian/Arabic-Indic digits down to ASCII, then drops every remaining non-digit. */
const digitsOnly = (raw: string): string => toAsciiDigits(raw).replace(/[^\d]/g, '');

/**
 * Validates the brood form's two numeric fields and resolves them into plain numbers.
 *
 * Rules, in order:
 *   1. the effective chick count must be a finite number greater than zero;
 *   2. a mortality value that is present must parse to an integer;
 *   3. mortality must not be negative;
 *   4. mortality must not exceed the effective chick count.
 *
 * A mortality of exactly `0` is valid and is never rejected.
 */
export const readBroodCounts = (input: ReadBroodCountsInput): BroodCountsResult => {
  const chickField = digitsOnly(input.chickCountField);
  const mortField = digitsOnly(input.mortalityCountField);

  const chick = parseInt(chickField, 10);
  const mort = parseInt(mortField, 10);

  // In archive mode the chick-count input is not rendered, so use the stored value.
  const effectiveChick =
    input.mode === 'archive' || !chickField ? Number(input.storedChickCount || 0) : chick;

  if (!Number.isFinite(effectiveChick) || effectiveChick <= 0) {
    return { error: 'تعداد جوجه اولیه نامعتبر است. لطفاً عددی بزرگتر از صفر وارد کنید.' };
  }
  if (mortField && !Number.isFinite(mort)) {
    return { error: 'تعداد تلفات باید عدد صحیح باشد.' };
  }
  const mortValue = Number.isFinite(mort) ? mort : 0;
  if (mortValue < 0) {
    return { error: 'تعداد تلفات نمی‌تواند منفی باشد.' };
  }
  if (mortValue > effectiveChick) {
    return {
      error: `تعداد تلفات (${formatNumberWithCommas(mortValue)}) نمی‌تواند بیشتر از تعداد جوجه اولیه (${formatNumberWithCommas(
        effectiveChick
      )}) باشد.`,
    };
  }
  return { chick: effectiveChick, mort: mortValue };
};

/** Narrowing helper for call sites that need the numeric branch. */
export const isCountsError = (
  result: BroodCountsResult
): result is { error: string } => 'error' in result;