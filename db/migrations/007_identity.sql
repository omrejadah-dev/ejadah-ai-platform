-- 007_identity.sql — accounts, seats, OTP, sessions, admins, audit (spec chapters 4, 9, 10)
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS identity.plans_catalog (
  id                   serial PRIMARY KEY,
  code                 text UNIQUE NOT NULL,
  name                 text NOT NULL,
  role                 text NOT NULL CHECK (role IN ('broker','office','investor','developer')),
  seats                int  NOT NULL DEFAULT 1,
  daily_estimate_limit int  NOT NULL DEFAULT 50,
  duration_days        int  NOT NULL DEFAULT 365,
  price_sar            numeric(10,2)
);

CREATE TABLE IF NOT EXISTS identity.accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  role        text NOT NULL CHECK (role IN ('broker','office','investor','developer')),
  plan_id     int REFERENCES identity.plans_catalog(id),
  seats_total int  NOT NULL DEFAULT 1,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired')),
  starts_at   date NOT NULL DEFAULT current_date,
  expires_at  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notes       text
);

-- A seat is a phone number that may log in under an account. Seat = login principal.
CREATE TABLE IF NOT EXISTS identity.seats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES identity.accounts(id) ON DELETE CASCADE,
  phone        text NOT NULL UNIQUE,            -- E.164: +9665XXXXXXXX
  display_name text,
  is_owner     boolean NOT NULL DEFAULT false,  -- office owner manages the other seats
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL UNIQUE,
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity.otp_codes (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int  NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ip          text
);
CREATE INDEX IF NOT EXISTS ix_otp_phone_created ON identity.otp_codes (phone, created_at DESC);

-- One ACTIVE session per seat is enforced in code: a new login revokes the others (reason 'replaced').
CREATE TABLE IF NOT EXISTS identity.sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_kind text NOT NULL CHECK (principal_kind IN ('seat','admin')),
  principal_id   uuid NOT NULL,
  refresh_hash   text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,          -- sliding: last_seen + 30 days
  revoked_at     timestamptz,
  revoked_reason text,                          -- replaced | logout | admin | expired
  ip             text,
  user_agent     text,
  city_guess     text
);
CREATE INDEX IF NOT EXISTS ix_sessions_principal ON identity.sessions (principal_kind, principal_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS ops.audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_kind text,            -- seat | admin | system
  actor_id   uuid,
  action     text NOT NULL,   -- auth.otp_sent, auth.login, auth.session_replaced, auth.logout, estimate.created, ...
  subject    text,
  data       jsonb,
  ip         text
);
CREATE INDEX IF NOT EXISTS ix_audit_at ON ops.audit_log (at DESC);

-- valuations now carry the seat/account that created them
ALTER TABLE app.valuations ADD COLUMN IF NOT EXISTS account_id uuid;

-- ---------------------------------------------------------------------------
-- Dev seed (idempotent). Phones are reserved test numbers; the dummy SMS sender logs the code.
-- ---------------------------------------------------------------------------
INSERT INTO identity.plans_catalog (code, name, role, seats, daily_estimate_limit, duration_days) VALUES
  ('broker_1',    'وسيط - مقعد واحد',      'broker',    1, 50, 365),
  ('office_3',    'مكتب - ثلاثة مقاعد',    'office',    3, 50, 365),
  ('investor_1',  'مستثمر',                'investor',  1, 50, 365),
  ('developer_2', 'مطوّر - مقعدان',        'developer', 2, 50, 365)
ON CONFLICT (code) DO NOTHING;

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

INSERT INTO identity.admins (phone, name) VALUES ('+966500000009', 'مدير النظام التجريبي') ON CONFLICT (phone) DO NOTHING;
