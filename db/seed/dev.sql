-- db/seed/dev.sql — test accounts for development only (applied by `db/migrate.sh --dev`, never in production).
-- Idempotent. Phones are reserved test numbers; the dummy SMS sender logs the code (PLAN.md, phase B).
--   0500000001 broker · 0500000002 office manager · 0500000003 office employee · 0500000004 investor · 0500000005 developer
--   0500000000 admin
INSERT INTO identity.accounts (id, name, role, plan_id, seats_total, expires_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'وسيط تجريبي',   'broker',    (SELECT id FROM identity.plans_catalog WHERE code='broker_1'),    1, current_date + 365),
  ('22222222-2222-2222-2222-222222222222', 'مكتب تجريبي',   'office',    (SELECT id FROM identity.plans_catalog WHERE code='office_3'),    3, current_date + 365),
  ('33333333-3333-3333-3333-333333333333', 'مستثمر تجريبي', 'investor',  (SELECT id FROM identity.plans_catalog WHERE code='investor_1'),  1, current_date + 365),
  ('44444444-4444-4444-4444-444444444444', 'مطوّر تجريبي',  'developer', (SELECT id FROM identity.plans_catalog WHERE code='developer_2'), 2, current_date + 365)
ON CONFLICT (id) DO NOTHING;

INSERT INTO identity.seats (account_id, phone, display_name, is_owner) VALUES
  ('11111111-1111-1111-1111-111111111111', '+966500000001', 'وسيط تجريبي', true),
  ('22222222-2222-2222-2222-222222222222', '+966500000002', 'مدير المكتب التجريبي', true),
  ('22222222-2222-2222-2222-222222222222', '+966500000003', 'موظف المكتب 1', false),
  ('33333333-3333-3333-3333-333333333333', '+966500000004', 'مستثمر تجريبي', true),
  ('44444444-4444-4444-4444-444444444444', '+966500000005', 'مطوّر تجريبي', true)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO identity.admins (phone, name) VALUES ('+966500000000', 'مدير النظام التجريبي') ON CONFLICT (phone) DO NOTHING;
