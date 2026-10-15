export interface UiPreviewGateInput {
  isDevRuntime: boolean;
  appVariant: string;
  nodeEnv?: string;
  previewFlag?: string;
}

/**
 * Pure guard deciding whether the UI preview harness is permitted to activate.
 *
 * Production builds are blocked by THREE independent barriers:
 *   1. `__DEV__` must be true (React Native / Metro development runtime)
 *   2. `APP_VARIANT` must be `'dev'` (never `'production'`)
 *   3. `NODE_ENV` must not be `'production'`
 *   4. `EXPO_PUBLIC_UI_PREVIEW` must be explicitly `'1'`
 */
export function evaluateUiPreviewGate(input: UiPreviewGateInput): boolean {
  if (!input.isDevRuntime) return false;
  if (input.appVariant !== 'dev') return false;
  if (input.nodeEnv === 'production') return false;
  return input.previewFlag === '1';
}
