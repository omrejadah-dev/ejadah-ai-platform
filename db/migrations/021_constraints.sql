-- 021_constraints.sql — foreign keys and checks the first migrations left out, and one shared list of property types.

-- ---------------------------------------------------------------------------
-- 1. Clean rows that would break the new foreign keys (set to NULL, counted in the NOTICE output).
--    Admin ids still found in seat_id (written by a backend older than 019) move to admin_id first, as 019 did;
--    anything else that is not a seat is cleared.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  UPDATE app.valuations      SET admin_id = seat_id, seat_id = NULL WHERE seat_id IN (SELECT id FROM identity.admins);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.valuations.seat_id -> admin_id (an admin): %', n;
  UPDATE app.legal_questions SET admin_id = seat_id, seat_id = NULL WHERE seat_id IN (SELECT id FROM identity.admins);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.legal_questions.seat_id -> admin_id (an admin): %', n;
  UPDATE ops.ai_calls        SET admin_id = seat_id, seat_id = NULL WHERE seat_id IN (SELECT id FROM identity.admins);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'ops.ai_calls.seat_id -> admin_id (an admin): %', n;

  UPDATE app.valuations v SET seat_id = NULL
  WHERE seat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.seats s WHERE s.id = v.seat_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.valuations.seat_id -> NULL (not a seat): %', n;

  UPDATE app.valuations v SET account_id = NULL
  WHERE account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.accounts a WHERE a.id = v.account_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.valuations.account_id -> NULL (no such account): %', n;

  UPDATE app.valuations v SET district_id = NULL
  WHERE district_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM market.districts d WHERE d.id = v.district_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.valuations.district_id -> NULL (no such district): %', n;

  UPDATE app.legal_questions q SET seat_id = NULL
  WHERE seat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.seats s WHERE s.id = q.seat_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.legal_questions.seat_id -> NULL (not a seat): %', n;

  UPDATE ops.ai_calls c SET seat_id = NULL
  WHERE seat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.seats s WHERE s.id = c.seat_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'ops.ai_calls.seat_id -> NULL (not a seat): %', n;

  UPDATE app.valuations v SET admin_id = NULL
  WHERE admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.admins a WHERE a.id = v.admin_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.valuations.admin_id -> NULL (not an admin): %', n;

  UPDATE app.legal_questions q SET admin_id = NULL
  WHERE admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.admins a WHERE a.id = q.admin_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'app.legal_questions.admin_id -> NULL (not an admin): %', n;

  UPDATE ops.ai_calls c SET admin_id = NULL
  WHERE admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity.admins a WHERE a.id = c.admin_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'ops.ai_calls.admin_id -> NULL (not an admin): %', n;

  UPDATE ops.ai_calls c SET valuation_id = NULL
  WHERE valuation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.valuations v WHERE v.id = c.valuation_id);
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'ops.ai_calls.valuation_id -> NULL (no such valuation): %', n;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Foreign keys.
--    Who made something: ON DELETE SET NULL, so deleting a seat or an account keeps the history rows.
--    City / district: plain (NO ACTION). Cities and districts are never deleted (the reload upserts them so their ids
--    stay stable); a load that tried to delete one still referenced by a saved valuation must fail loudly, not
--    silently blank the valuation. valuations.city_id is NOT NULL anyway.
-- ---------------------------------------------------------------------------
ALTER TABLE app.valuations
  ADD CONSTRAINT valuations_city_id_fkey     FOREIGN KEY (city_id)     REFERENCES market.cities(id),
  ADD CONSTRAINT valuations_district_id_fkey FOREIGN KEY (district_id) REFERENCES market.districts(id),
  ADD CONSTRAINT valuations_account_id_fkey  FOREIGN KEY (account_id)  REFERENCES identity.accounts(id) ON DELETE SET NULL,
  ADD CONSTRAINT valuations_seat_id_fkey     FOREIGN KEY (seat_id)     REFERENCES identity.seats(id)    ON DELETE SET NULL,
  ADD CONSTRAINT valuations_admin_id_fkey    FOREIGN KEY (admin_id)    REFERENCES identity.admins(id)   ON DELETE SET NULL;

ALTER TABLE app.legal_questions
  ADD CONSTRAINT legal_questions_seat_id_fkey  FOREIGN KEY (seat_id)  REFERENCES identity.seats(id)  ON DELETE SET NULL,
  ADD CONSTRAINT legal_questions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES identity.admins(id) ON DELETE SET NULL;

ALTER TABLE ops.ai_calls
  ADD CONSTRAINT ai_calls_seat_id_fkey      FOREIGN KEY (seat_id)      REFERENCES identity.seats(id)   ON DELETE SET NULL,
  ADD CONSTRAINT ai_calls_admin_id_fkey     FOREIGN KEY (admin_id)     REFERENCES identity.admins(id)  ON DELETE SET NULL,
  ADD CONSTRAINT ai_calls_valuation_id_fkey FOREIGN KEY (valuation_id) REFERENCES app.valuations(id)  ON DELETE SET NULL;

-- the seat / account columns are filtered on (daily limit, "my estimates", admin counts) and scanned when a seat is deleted
CREATE INDEX ix_valuations_seat_created    ON app.valuations (seat_id, created_at DESC);
CREATE INDEX ix_valuations_account_created ON app.valuations (account_id, created_at DESC);
CREATE INDEX ix_ai_calls_seat              ON ops.ai_calls (seat_id);

-- ---------------------------------------------------------------------------
-- 3. admins.status: same values as seats.status
-- ---------------------------------------------------------------------------
ALTER TABLE identity.admins ADD CONSTRAINT admins_status_check CHECK (status IN ('active', 'disabled'));

-- ---------------------------------------------------------------------------
-- 4. The four product types, defined once (was a CHECK repeated in 001, 006 and 012).
--    market.deals.type_group stays plain text: it carries NULL for unpriced types and the materialised views read it.
-- ---------------------------------------------------------------------------
CREATE DOMAIN market.property_type AS text CHECK (VALUE IN ('land', 'villa', 'apartment', 'building'));

ALTER TABLE market.type_mapping
  DROP CONSTRAINT type_mapping_type_group_check,
  ALTER COLUMN type_group TYPE market.property_type;

ALTER TABLE app.valuations
  DROP CONSTRAINT valuations_type_group_check,
  ALTER COLUMN type_group TYPE market.property_type;

ALTER TABLE app.adjustment_rules
  DROP CONSTRAINT adjustment_rules_type_group_check,
  ALTER COLUMN type_group TYPE market.property_type,
  ADD CONSTRAINT adjustment_rules_type_group_check CHECK (type_group <> 'land');   -- land has no age, floors or features

-- ---------------------------------------------------------------------------
-- 5. mv_meta gets a unique index so db/reload/refresh.sql can refresh it CONCURRENTLY (estimate_price reads it on
--    every call; a plain refresh would block pricing while it runs).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX mv_meta_data_as_of_idx ON market.mv_meta (data_as_of);
