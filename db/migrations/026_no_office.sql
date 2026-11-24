-- 026: no office accounts any more (decision 2026-11-24): the plans are broker, investor and developer only.
-- The dev seed's test office goes (its seats with it; its valuations and questions just lose the link). Any other office
-- account becomes a one-seat-plan broker account, so no customer's data is lost; its extra seats stay as they are.
DELETE FROM identity.accounts WHERE id = '22222222-2222-2222-2222-222222222222';

UPDATE identity.accounts
SET role = 'broker', plan_id = (SELECT id FROM identity.plans_catalog WHERE code = 'broker_1')
WHERE role = 'office';

DELETE FROM identity.plans_catalog WHERE role = 'office';

ALTER TABLE identity.accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE identity.accounts ADD CONSTRAINT accounts_role_check CHECK (role IN ('broker', 'investor', 'developer'));
ALTER TABLE identity.plans_catalog DROP CONSTRAINT IF EXISTS plans_catalog_role_check;
ALTER TABLE identity.plans_catalog ADD CONSTRAINT plans_catalog_role_check CHECK (role IN ('broker', 'investor', 'developer'));
