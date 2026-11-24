-- 027: no seats (decision 2026-11-24): one account = one login, its email and password. Extra logins go (their
-- valuations keep the account), the seat counts go, and the plans are named by type only. identity.seats stays as the
-- table of logins that sign-in uses, now one row per account.
DELETE FROM identity.seats WHERE NOT is_owner;
CREATE UNIQUE INDEX IF NOT EXISTS ux_seats_one_per_account ON identity.seats (account_id);

ALTER TABLE identity.accounts DROP COLUMN IF EXISTS seats_total;
ALTER TABLE identity.plans_catalog DROP COLUMN IF EXISTS seats;

UPDATE identity.plans_catalog SET name = CASE code
  WHEN 'broker_1' THEN 'وسيط' WHEN 'investor_1' THEN 'مستثمر' WHEN 'developer_2' THEN 'مطوّر' ELSE name END;
