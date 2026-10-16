import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { Endpoints } from '../src/api/endpoints';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_OPTIONS,
  adminCount,
  buildCreateUserPayload,
  buildUpdateUserPayload,
  canManageUsers,
  canViewUsers,
  filterManagedUsers,
  isAssignableRole,
  isOnlyAdmin,
  normalizeManagedUsers,
  roleLabel,
  validateUserCreate,
  validateUserEdit,
} from '../src/features/manager/userManagement';
import {
  buildFarmerPayload,
  canCreateFarmer,
  canDeactivateFarmer,
  canEditFarmer,
  canRestoreFarmer,
  farmersQueryFor,
  isFarmerActive,
  validateFarmerInput,
} from '../src/features/manager/farmerDirectory';
import {
  DRIVER_NAME_LOCKED_MESSAGE,
  buildDriverPayload,
  canCreateDriver,
  canDeactivateDriver,
  driversQueryFor,
  filterDrivers,
  isDriverActive,
  normalizeDriverRows,
  validateDriverInput,
} from '../src/features/manager/driverDirectory';

// Works both when run from nir-mobile/ and from the repository root.
const mobileRoot = fs.existsSync(path.join(process.cwd(), 'src', 'api', 'endpoints.ts'))
  ? process.cwd()
  : path.join(process.cwd(), 'nir-mobile');
const readSource = (relative: string): string => fs.readFileSync(path.join(mobileRoot, relative), 'utf8');

test('Phase 3 (mobile): user management contract', async (t) => {
  await t.test('the assignable roles mirror the server enum exactly', () => {
    assert.deepEqual([...ASSIGNABLE_ROLES], ['ADMIN', 'MANAGER', 'ACCOUNTING', 'OPERATOR', 'VIEWER']);
    assert.equal(ROLE_OPTIONS.length, 5);
    assert.equal(ROLE_LABELS.ADMIN, 'مدیر ارشد سامانه');
    assert.equal(roleLabel('accounting'), 'حسابدار');
    assert.equal(roleLabel('nonsense'), 'nonsense');
    assert.equal(isAssignableRole('VIEWER'), true);
    assert.equal(isAssignableRole('SUPERADMIN'), false);
  });

  await t.test('capability matrix mirrors requireRole (ADMIN|MANAGER read, ADMIN write)', () => {
    for (const role of ['ADMIN', 'MANAGER']) assert.equal(canViewUsers(role), true);
    for (const role of ['ACCOUNTING', 'OPERATOR', 'VIEWER', 'DRIVER', 'FARMER', '', null]) {
      assert.equal(canViewUsers(role), false, `${role} must not read users`);
    }
    assert.equal(canManageUsers('ADMIN'), true);
    for (const role of ['MANAGER', 'ACCOUNTING', 'OPERATOR', 'VIEWER', null]) {
      assert.equal(canManageUsers(role), false, `${role} must not write users`);
    }
  });

  await t.test('normaliseUserRow drops shapeless rows and never invents a password field', () => {
    const rows = normalizeManagedUsers([
      { id: 'u1', username: 'sara', role: 'admin', fullName: 'سارا', phone: '  0912  ' },
      { username: 'no_id_but_username' },
      { role: 'MANAGER' }, // neither id nor username -> dropped
      null,
      'garbage',
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].role, 'ADMIN');
    assert.equal(rows[0].phone, '0912');
    assert.equal(rows[1].id, 'no_id_but_username');
    assert.equal(Object.prototype.hasOwnProperty.call(rows[0], 'passwordHash'), false);
  });

  await t.test('filterManagedUsers searches name/username and digits-aware phone, and filters by role', () => {
    const users = normalizeManagedUsers([
      { id: '1', username: 'ali', role: 'MANAGER', fullName: 'علی رضایی', phone: '09123456789' },
      { id: '2', username: 'sara', role: 'ACCOUNTING', fullName: 'سارا مرادی', phone: '09351112222' },
    ]);
    assert.deepEqual(filterManagedUsers(users, { search: 'سارا' }).map((u) => u.id), ['2']);
    assert.deepEqual(filterManagedUsers(users, { search: 'ali' }).map((u) => u.id), ['1']);
    assert.deepEqual(filterManagedUsers(users, { search: '0912' }).map((u) => u.id), ['1']);
    assert.deepEqual(filterManagedUsers(users, { role: 'ACCOUNTING' }).map((u) => u.id), ['2']);
    assert.deepEqual(filterManagedUsers(users, { role: 'ALL' }).map((u) => u.id), ['1', '2']);
    assert.deepEqual(filterManagedUsers(users, { search: '0912', role: 'ACCOUNTING' }), []);
  });

  await t.test('validateUserCreate mirrors userCreateSchema (username>=3, password>=6, role enum, phone)', () => {
    assert.equal(validateUserCreate({ username: 'abc', password: '123456', role: 'OPERATOR' }).valid, true);
    assert.equal(validateUserCreate({ username: 'ab', password: '123456', role: 'OPERATOR' }).errors.username !== undefined, true);
    assert.equal(validateUserCreate({ username: 'abc', password: '12345', role: 'OPERATOR' }).errors.password !== undefined, true);
    assert.equal(validateUserCreate({ username: 'abc', password: '123456', role: 'SUPERADMIN' }).errors.role !== undefined, true);
    assert.equal(validateUserCreate({ username: 'abc', password: '123456', role: 'OPERATOR', phone: '12' }).errors.phone !== undefined, true);
    assert.equal(validateUserCreate({ username: 'abc', password: '123456', role: 'OPERATOR', phone: '' }).valid, true);
  });

  await t.test('payloads trim, drop blanks to null and normalise the role', () => {
    assert.deepEqual(buildCreateUserPayload({ username: '  sara ', password: 'secret', role: 'accounting', fullName: '  ', phone: '  ' }), {
      username: 'sara',
      password: 'secret',
      role: 'ACCOUNTING',
      fullName: null,
      phone: null,
    });
    assert.deepEqual(buildUpdateUserPayload({ role: 'MANAGER', fullName: 'سارا', phone: '0912 111 2222' }), {
      role: 'MANAGER',
      fullName: 'سارا',
      phone: '0912 111 2222',
    });
  });

  await t.test('isOnlyAdmin / adminCount identify the last administrator', () => {
    const users = normalizeManagedUsers([
      { id: 'a', username: 'a', role: 'ADMIN' },
      { id: 'b', username: 'b', role: 'MANAGER' },
    ]);
    assert.equal(adminCount(users), 1);
    assert.equal(isOnlyAdmin(users, 'a'), true);
    assert.equal(isOnlyAdmin(users, 'b'), false);
    const many = normalizeManagedUsers([
      { id: 'a', username: 'a', role: 'ADMIN' },
      { id: 'c', username: 'c', role: 'ADMIN' },
    ]);
    assert.equal(isOnlyAdmin(many, 'a'), false);
  });

  await t.test('validateUserEdit requires a real role and a sane optional phone', () => {
    assert.equal(validateUserEdit({ role: 'VIEWER' }).valid, true);
    assert.equal(validateUserEdit({ role: 'CHAIRMAN' }).errors.role !== undefined, true);
    assert.equal(validateUserEdit({ role: 'VIEWER', phone: '123' }).errors.phone !== undefined, true);
  });
});

test('Phase 3 (mobile): farmer management contract', async (t) => {
  await t.test('name is required; phone is optional but must be plausible', () => {
    assert.equal(validateFarmerInput({ name: '', phone: '' }).errors.name !== undefined, true);
    assert.equal(validateFarmerInput({ name: '   ', phone: '' }).errors.name !== undefined, true);
    assert.equal(validateFarmerInput({ name: 'مرغداری آرادان', phone: '' }).valid, true);
    assert.equal(validateFarmerInput({ name: 'مرغداری آرادان', phone: '09123456789' }).valid, true);
    assert.equal(validateFarmerInput({ name: 'مرغداری آرادان', phone: '123' }).errors.phone !== undefined, true);
  });

  await t.test('payload normalises Persian text and digits-only phone; id only when editing', () => {
    const createPayload = buildFarmerPayload({ name: '  مرغداری كيان  ', phone: '0912 345 6789' });
    assert.equal(createPayload.name, 'مرغداری کیان'); // Arabic ك folded to Persian ک
    assert.equal(createPayload.phone, '09123456789');
    assert.equal('id' in createPayload, false, 'create must not invent an id');

    const editPayload = buildFarmerPayload({ id: 'farmer-1', name: 'مرغداری', phone: '' });
    assert.equal(editPayload.id, 'farmer-1');
    assert.equal(editPayload.phone, null);
  });

  await t.test('capability matrix mirrors the farmer route guards', () => {
    assert.equal(canCreateFarmer('MANAGER'), true);
    assert.equal(canEditFarmer('MANAGER'), true);
    assert.equal(canRestoreFarmer('MANAGER'), true);
    assert.equal(canDeactivateFarmer('MANAGER'), false, 'DELETE is ADMIN only');
    assert.equal(canDeactivateFarmer('ADMIN'), true);
    for (const role of ['OPERATOR', 'ACCOUNTING', 'VIEWER', null]) {
      assert.equal(canCreateFarmer(role), false, `${role} must not create farmers`);
    }
  });

  await t.test('active/inactive is derived from the soft-delete stamp', () => {
    assert.equal(isFarmerActive({ deletedAt: null }), true);
    assert.equal(isFarmerActive({}), true);
    assert.equal(isFarmerActive({ deletedAt: '2026-01-01T00:00:00.000Z' }), false);
    assert.equal(isFarmerActive(null), false);
    assert.deepEqual(farmersQueryFor('active'), {});
    assert.deepEqual(farmersQueryFor('inactive'), { status: 'inactive' });
    assert.deepEqual(farmersQueryFor('all'), { status: 'all' });
  });
});

test('Phase 3 (mobile): driver management contract', async (t) => {
  await t.test('create requires a name; edit locks the name to protect invoice history', () => {
    assert.equal(validateDriverInput({ name: '', isEdit: false }).errors.name !== undefined, true);
    assert.equal(validateDriverInput({ name: 'رضا', isEdit: false }).valid, true);
    assert.equal(validateDriverInput({ name: '', isEdit: true }).errors.name, DRIVER_NAME_LOCKED_MESSAGE);
    assert.equal(validateDriverInput({ name: 'رضا', isEdit: true }).valid, true);
  });

  await t.test('phone and IBAN are validated', () => {
    assert.equal(validateDriverInput({ name: 'رضا', phone: '09123456789' }).valid, true);
    assert.equal(validateDriverInput({ name: 'رضا', phone: '12' }).errors.phone !== undefined, true);
    assert.equal(validateDriverInput({ name: 'رضا', iban: 'IR000000000000000000000000' }).valid, true);
    assert.equal(validateDriverInput({ name: 'رضا', iban: 'IR12' }).errors.iban !== undefined, true);
  });

  await t.test('payload trims the name, digits-only phone, upper-cases IBAN', () => {
    assert.deepEqual(buildDriverPayload({ name: '  رضا محمدی ', phone: '0912 345 6789', iban: 'ir00 0000' }), {
      name: 'رضا محمدی',
      phone: '09123456789',
      iban: 'IR000000',
    });
    assert.deepEqual(buildDriverPayload({ name: 'رضا', phone: '', iban: '' }), {
      name: 'رضا',
      phone: null,
      iban: null,
    });
  });

  await t.test('capability matrix mirrors the driver route guards', () => {
    for (const role of ['ADMIN', 'MANAGER', 'OPERATOR']) assert.equal(canCreateDriver(role), true);
    for (const role of ['ACCOUNTING', 'VIEWER', null]) assert.equal(canCreateDriver(role), false);
    assert.equal(canDeactivateDriver('MANAGER'), true);
    assert.equal(canDeactivateDriver('ADMIN'), true);
    assert.equal(canDeactivateDriver('OPERATOR'), false, 'DELETE is ADMIN|MANAGER only');
  });

  await t.test('rows normalise, activity is derived, and search is digits-aware', () => {
    const rows = normalizeDriverRows([
      { id: 'رضا', name: 'رضا', phone: '09121112222' },
      { id: 'inactive', name: 'حسن', deletedAt: '2026-01-01T00:00:00.000Z' },
      { junk: true },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(isDriverActive(rows[0]), true);
    assert.equal(isDriverActive(rows[1]), false);
    assert.deepEqual(filterDrivers(rows, 'حسن').map((d) => d.id), ['inactive']);
    assert.deepEqual(filterDrivers(rows, '0912').map((d) => d.id), ['رضا']);
    assert.deepEqual(filterDrivers(rows, '').length, 2);
    assert.deepEqual(driversQueryFor('inactive'), { status: 'inactive' });
    assert.deepEqual(driversQueryFor('active'), {});
  });
});

test('Phase 3 (mobile): endpoints + screen wiring', async (t) => {
  await t.test('the new endpoints are registered exactly once and are well formed', () => {
    assert.equal(Endpoints.web.users, '/api/users');
    assert.equal(Endpoints.web.userById('a b'), '/api/users/a%20b');
    assert.equal(Endpoints.web.userPassword('u1'), '/api/users/u1/password');
    assert.equal(Endpoints.web.drivers, '/api/drivers');
    assert.equal(Endpoints.web.driverByName('رضا'), `/api/drivers/${encodeURIComponent('رضا')}`);
    assert.equal(Endpoints.web.farmerById('f1'), '/api/farmers/f1');
    assert.equal(Endpoints.web.farmerRestore('f1'), '/api/farmers/f1/restore');
  });

  await t.test('the management screens call only the shared Endpoints registry', () => {
    const users = readSource(path.join('src', 'screens', 'manager', 'UsersManagementScreen.tsx'));
    assert.ok(users.includes('Endpoints.web.users'));
    assert.ok(users.includes('Endpoints.web.userById'));
    assert.ok(users.includes('Endpoints.web.userPassword'));

    const driversScreen = readSource(path.join('src', 'screens', 'manager', 'DriversDirectoryScreen.tsx'));
    assert.ok(driversScreen.includes('Endpoints.web.drivers'));
    assert.ok(driversScreen.includes('Endpoints.web.driverByName'));

    const farmersScreen = readSource(path.join('src', 'screens', 'manager', 'FarmersDirectoryScreen.tsx'));
    assert.ok(farmersScreen.includes('Endpoints.web.farmers'));
    assert.ok(farmersScreen.includes('Endpoints.web.farmerById'));
    assert.ok(farmersScreen.includes('Endpoints.web.farmerRestore'));
  });

  await t.test('no shipped screen names the operational host', () => {
    for (const file of [
      path.join('src', 'screens', 'auth', 'LoginScreen.tsx'),
      path.join('src', 'screens', 'manager', 'MoreMenuScreen.tsx'),
    ]) {
      const source = readSource(file);
      assert.equal(
        source.includes('app.artadan.ir'),
        false,
        `${file} must not offer the operational host to a dev build`
      );
    }
  });

  await t.test('the operational host string is confined to the environment guard', () => {
    const srcRoot = path.join(mobileRoot, 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf8').includes('app.artadan.ir')) {
            offenders.push(path.relative(mobileRoot, full).split(path.sep).join('/'));
          }
        }
      }
    };
    walk(srcRoot);
    assert.deepEqual(
      offenders,
      ['src/utils/envGuard.ts'],
      'only the guard may name the operational host — its job is to refuse it for a dev build'
    );
  });

  await t.test('the client defaults to the DEV host, never app.artadan.ir', () => {
    const client = readSource(path.join('src', 'api', 'client.ts'));
    assert.equal(
      client.includes("|| 'https://app.artadan.ir'"),
      false,
      'a missing EXPO_PUBLIC_API_URL must fail safe to dev'
    );
    assert.ok(client.includes("|| 'https://dev.artadan.ir'"));
  });

  await t.test('the manager navigator registers both new screens', () => {
    const nav = readSource(path.join('src', 'navigation', 'ManagerNavigator.tsx'));
    assert.ok(nav.includes('UsersManagementScreen'));
    assert.ok(nav.includes('DriversDirectoryScreen'));
    assert.ok(nav.includes('name="UsersManagement"'));
    assert.ok(nav.includes('name="DriversDirectory"'));
  });
});
