-- db/seed/dev.sql — test accounts for development only (applied by `db/migrate.sh --dev`, never in production).
-- Idempotent. Every test login uses the password  ejadah-test  (bcrypt, made by pgcrypto as in 022).
--   broker@ejadah.test · investor@ejadah.test
--   developer@ejadah.test · admin@ejadah.test (system admin)
INSERT INTO identity.accounts (id, name, role, plan_id, expires_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'وسيط تجريبي',   'broker',    (SELECT id FROM identity.plans_catalog WHERE code='broker_1'), current_date + 365),
  ('33333333-3333-3333-3333-333333333333', 'مستثمر تجريبي', 'investor',  (SELECT id FROM identity.plans_catalog WHERE code='investor_1'), current_date + 365),
  ('44444444-4444-4444-4444-444444444444', 'مطوّر تجريبي',  'developer', (SELECT id FROM identity.plans_catalog WHERE code='developer_2'), current_date + 365)
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.seats (account_id, email, display_name, is_owner) VALUES
  ('11111111-1111-1111-1111-111111111111', 'broker@ejadah.test',       'وسيط تجريبي', true),
  ('33333333-3333-3333-3333-333333333333', 'investor@ejadah.test',     'مستثمر تجريبي', true),
  ('44444444-4444-4444-4444-444444444444', 'developer@ejadah.test',    'مطوّر تجريبي', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO identity.admins (email, name) VALUES ('admin@ejadah.test', 'مدير النظام التجريبي') ON CONFLICT (email) DO NOTHING;

-- the test password, only where none is set yet (a password changed in the admin panel stays)
UPDATE identity.seats  SET password_hash = crypt('ejadah-test', gen_salt('bf', 10)) WHERE email LIKE '%@ejadah.test' AND password_hash IS NULL;
UPDATE identity.admins SET password_hash = crypt('ejadah-test', gen_salt('bf', 10)) WHERE email LIKE '%@ejadah.test' AND password_hash IS NULL;
