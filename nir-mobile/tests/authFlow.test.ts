import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { apiClient, setApiBaseUrl } from '../src/api/client';
import { SecureStorageService } from '../src/services/secureStore';
import { KNOWN_ROLES, isKnownRole } from '../src/types/auth';
import { evaluateUiPreviewGate } from '../src/dev/previewGate';

test('Mobile Auth API Flow & Role/Preview Security Unit Tests', async (t) => {
  // Spin up an ephemeral HTTP server mimicking the real backend mobileAuth.ts contract
  const server = http.createServer(async (req, res) => {
    const url = req.url || '';
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || '{}');

    if (url === '/api/mobile/auth/otp/request') {
      if (parsed.phone === '09121112233') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, expiresIn: 120, debugCode: '123456' }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid phone' }));
      }
      return;
    }

    if (url === '/api/mobile/auth/otp/verify') {
      if (parsed.phone === '09121112233' && parsed.code === '123456') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            user: {
              id: 'drv_test_1',
              username: '09121112233',
              role: 'DRIVER',
              driverId: 'drv_id_1',
              fullName: 'رضا راننده',
            },
            accessToken: 'drv_acc_token',
            refreshToken: 'drv_ref_token',
          })
        );
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid OTP code' }));
      }
      return;
    }

    if (url === '/api/mobile/auth/login') {
      const submittedTotp = parsed.totp ?? parsed.totpCode;

      if (parsed.username === 'operator1' && parsed.password === 'opPass123') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            user: {
              id: 'op_1',
              username: 'operator1',
              role: 'OPERATOR',
              fullName: 'اپراتور باسکول کارخانه',
            },
            accessToken: 'op_acc_token',
            refreshToken: 'op_ref_token',
          })
        );
        return;
      }

      if (parsed.username === 'admin' && parsed.password === 'pass123') {
        if (!submittedTotp) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              twoFactorRequired: true,
              requires2FA: true,
            })
          );
        } else if (submittedTotp === '654321') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              user: {
                id: 'adm_1',
                username: 'admin',
                role: 'ADMIN',
                fullName: 'مدیر ارشد سامانه',
              },
              accessToken: 'adm_acc_token',
              refreshToken: 'adm_ref_token',
            })
          );
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'کد اعتبارسنجی دو مرحله‌ای (۲FA) نامعتبر است.' }));
        }
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'نام کاربری یا رمز عبور نامعتبر است.' }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  setApiBaseUrl(baseUrl);

  try {
    await t.test('KNOWN_ROLES includes OPERATOR and rejects unsupported ACCOUNTING on mobile', () => {
      assert.ok(KNOWN_ROLES.includes('OPERATOR'));
      assert.equal(isKnownRole('DRIVER'), true);
      assert.equal(isKnownRole('FARMER'), true);
      assert.equal(isKnownRole('MANAGER'), true);
      assert.equal(isKnownRole('ADMIN'), true);
      assert.equal(isKnownRole('OPERATOR'), true);
      assert.equal(isKnownRole('operator'), true);
      assert.equal(isKnownRole('ACCOUNTING'), false);
      assert.equal(isKnownRole('UNKNOWN'), false);
      assert.equal(isKnownRole(''), false);
    });

    await t.test('OTP request and verification flow (success + invalid code failure)', async () => {
      const reqRes = await apiClient.post('/api/mobile/auth/otp/request', {
        phone: '09121112233',
      });
      assert.equal(reqRes.data.success, true);
      assert.equal(reqRes.data.debugCode, '123456');

      await assert.rejects(
        () =>
          apiClient.post('/api/mobile/auth/otp/verify', {
            phone: '09121112233',
            code: '000000',
          }),
        (err: any) => err?.response?.status === 400
      );

      const verRes = await apiClient.post('/api/mobile/auth/otp/verify', {
        phone: '09121112233',
        code: '123456',
      });
      assert.equal(verRes.data.success, true);
      assert.equal(verRes.data.user.role, 'DRIVER');
      assert.equal(verRes.data.accessToken, 'drv_acc_token');

      await SecureStorageService.setAccessToken(verRes.data.accessToken);
      await SecureStorageService.setRefreshToken(verRes.data.refreshToken);
      await SecureStorageService.setUserData(verRes.data.user);

      assert.equal(await SecureStorageService.getAccessToken(), 'drv_acc_token');
      const u = await SecureStorageService.getUserData();
      assert.equal(u?.role, 'DRIVER');
    });

    await t.test('OPERATOR role login succeeds and passes isKnownRole validation', async () => {
      const opRes = await apiClient.post('/api/mobile/auth/login', {
        username: 'operator1',
        password: 'opPass123',
      });
      assert.equal(opRes.data.success, true);
      assert.equal(opRes.data.user.role, 'OPERATOR');
      assert.equal(isKnownRole(opRes.data.user.role), true);
      assert.equal(opRes.data.accessToken, 'op_acc_token');
    });

    await t.test('Invalid password login rejects with 401', async () => {
      await assert.rejects(
        () =>
          apiClient.post('/api/mobile/auth/login', {
            username: 'admin',
            password: 'wrong-password',
          }),
        (err: any) => err?.response?.status === 401
      );
    });

    await t.test('Manager/Admin login flow with 2FA (twoFactorRequired + totp contract)', async () => {
      // 1. First step: login without TOTP -> triggers twoFactorRequired
      const firstStep = await apiClient.post('/api/mobile/auth/login', {
        username: 'admin',
        password: 'pass123',
      });
      assert.equal(firstStep.data.success, false);
      assert.equal(Boolean(firstStep.data.twoFactorRequired || firstStep.data.requires2FA), true);

      // 2. Wrong TOTP code -> rejects with 401
      await assert.rejects(
        () =>
          apiClient.post('/api/mobile/auth/login', {
            username: 'admin',
            password: 'pass123',
            totp: '000000',
          }),
        (err: any) => err?.response?.status === 401
      );

      // 3. Valid TOTP code via canonical `totp` field -> succeeds
      const secondStep = await apiClient.post('/api/mobile/auth/login', {
        username: 'admin',
        password: 'pass123',
        totp: '654321',
      });
      assert.equal(secondStep.data.success, true);
      assert.equal(secondStep.data.user.role, 'ADMIN');
      assert.equal(secondStep.data.accessToken, 'adm_acc_token');
    });

    await t.test('UI preview gate is strictly locked to dev runtime and dev variant', () => {
      // Only active when ALL 4 conditions hold
      assert.equal(
        evaluateUiPreviewGate({
          isDevRuntime: true,
          appVariant: 'dev',
          nodeEnv: 'development',
          previewFlag: '1',
        }),
        true
      );

      // Blocked when previewFlag is not '1'
      assert.equal(
        evaluateUiPreviewGate({
          isDevRuntime: true,
          appVariant: 'dev',
          nodeEnv: 'development',
          previewFlag: undefined,
        }),
        false
      );

      // Blocked in production build (__DEV__ === false), even if flag is set
      assert.equal(
        evaluateUiPreviewGate({
          isDevRuntime: false,
          appVariant: 'dev',
          nodeEnv: 'development',
          previewFlag: '1',
        }),
        false
      );

      // Blocked when APP_VARIANT is production, even if __DEV__ is true
      assert.equal(
        evaluateUiPreviewGate({
          isDevRuntime: true,
          appVariant: 'production',
          nodeEnv: 'development',
          previewFlag: '1',
        }),
        false
      );

      // Blocked when NODE_ENV is production
      assert.equal(
        evaluateUiPreviewGate({
          isDevRuntime: true,
          appVariant: 'dev',
          nodeEnv: 'production',
          previewFlag: '1',
        }),
        false
      );
    });
  } finally {
    server.close();
  }
});
