-- scripts/dev-seed-phase3.sql
-- DEV ONLY (nir_dev) - Phase 3 test accounts and test data for FARMER & OPERATOR.
-- DO NOT RUN AGAINST PRODUCTION (guarded below).

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() <> 'nir_dev' THEN
    RAISE EXCEPTION 'Refusing to run on database % - this seed is DEV ONLY (nir_dev)', current_database();
  END IF;
END $$;

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1) Operator test account (phone 09120000005 -> role OPERATOR)
-- ---------------------------------------------------------------------------------------------
INSERT INTO users (id, username, password_hash, role, full_name, phone, driver_id, farmer_id, is_2fa_enabled, created_at, updated_at)
VALUES (
  'usr-mobile-test-operator',
  '09120000005',
  '',
  'OPERATOR',
  'اپراتور باسکول آزمایشی',
  '09120000005',
  NULL,
  NULL,
  FALSE,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE
  SET role = 'OPERATOR',
      phone = '09120000005',
      updated_at = now();

UPDATE users
   SET role = 'OPERATOR',
       phone = '09120000005',
       updated_at = now()
 WHERE username = '09120000005';

-- ---------------------------------------------------------------------------------------------
-- 2) Farmer test account (09120000002) - ensure bound to an active farmer with real invoices & brood
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_farmer_id text;
  v_brood_count int := 0;
BEGIN
  SELECT id INTO v_farmer_id FROM farmers WHERE phone = '09120000002' AND deleted_at IS NULL LIMIT 1;
  
  IF v_farmer_id IS NULL THEN
    SELECT f.id INTO v_farmer_id
      FROM farmers f
     WHERE f.deleted_at IS NULL
       AND (f.phone IS NULL OR btrim(f.phone) = '')
     ORDER BY (SELECT count(*) FROM invoices i WHERE i.farmer_id = f.id AND i.deleted_at IS NULL AND i.type = 'exit') DESC,
              f.created_at ASC
     LIMIT 1;

    IF v_farmer_id IS NOT NULL THEN
      UPDATE farmers SET phone = '09120000002' WHERE id = v_farmer_id;
    END IF;
  END IF;

  IF v_farmer_id IS NOT NULL THEN
    INSERT INTO users (id, username, password_hash, role, full_name, phone, driver_id, farmer_id, is_2fa_enabled, created_at, updated_at)
    SELECT 'usr-mobile-test-farmer', '09120000002', '', 'FARMER', f.name, '09120000002', NULL, f.id, FALSE, now(), now()
      FROM farmers f
     WHERE f.id = v_farmer_id
    ON CONFLICT (id) DO UPDATE SET farmer_id = v_farmer_id, role = 'FARMER', phone = '09120000002', updated_at = now();

    -- Count existing broods safely using text length / json parse
    BEGIN
      SELECT json_array_length(broods) INTO v_brood_count
        FROM farmers
       WHERE id = v_farmer_id
         AND broods IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      v_brood_count := 0;
    END;

    IF v_brood_count IS NULL OR v_brood_count = 0 OR EXISTS (
      SELECT 1 FROM farmers WHERE id = v_farmer_id AND broods::text LIKE '%brd_dev_test_active_1%'
    ) THEN
      UPDATE farmers
         SET broods = '[
           {"id":"brood_1787384855491","startDate":"2026-07-21","chickCount":31000,"startInvoiceId":"local_1784486996814_qezao","exceptionalFeed":[],"activeProductsAtCreation":["پری_استارتر","prod_1784728270574","prod_1784728275367","prod_1784728279232"]},
           {"id":"brood_1766391837339","startDate":"2025-12-20","endDate":"2026-02-16","chickCount":30000,"exceptionalFeed":[]},
           {"id":"brood_1765890942825","startDate":"2025-10-04","endDate":"2025-12-31","chickCount":30000,"exceptionalFeed":[]}
         ]'::json,
             updated_at = now()
       WHERE id = v_farmer_id;
    END IF;
  END IF;
END $$;

COMMIT;

-- Verification query
SELECT u.id, u.username, u.role, u.phone, u.farmer_id, u.driver_id, u.full_name
  FROM users u
 WHERE u.id IN ('usr-mobile-test-operator', 'usr-mobile-test-farmer', 'usr-mobile-test-driver')
 ORDER BY u.role;
