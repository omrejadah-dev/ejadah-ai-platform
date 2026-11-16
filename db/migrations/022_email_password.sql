-- 022: sign-in by email + password instead of phone + SMS code (decision 2026-11-16: no phone numbers at all).
-- Passwords are bcrypt hashes made and checked inside PostgreSQL (pgcrypto: crypt(pw, gen_salt('bf', 10))), never
-- stored or logged in clear. A principal without a password cannot sign in until the admin sets one.
-- Emails are stored lower-case; one email = one principal across seats and admins (checked by the API).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- seats ---------------------------------------------------------------------------------------------------------
ALTER TABLE identity.seats ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE identity.seats ADD COLUMN IF NOT EXISTS password_hash text;
-- the known test seats get readable addresses; any other existing seat a placeholder the admin replaces
UPDATE identity.seats SET email = CASE phone
    WHEN '+966500000001' THEN 'broker@ejadah.test'
    WHEN '+966500000002' THEN 'office@ejadah.test'
    WHEN '+966500000003' THEN 'office.staff@ejadah.test'
    WHEN '+966500000004' THEN 'investor@ejadah.test'
    WHEN '+966500000005' THEN 'developer@ejadah.test'
    ELSE 'seat-' || left(id::text, 8) || '@change.invalid' END
WHERE email IS NULL;
ALTER TABLE identity.seats ALTER COLUMN email SET NOT NULL;
ALTER TABLE identity.seats ADD CONSTRAINT seats_email_key UNIQUE (email);
ALTER TABLE identity.seats ADD CONSTRAINT seats_email_check CHECK (email = lower(email) AND email LIKE '_%@_%._%');
ALTER TABLE identity.seats DROP COLUMN phone;
COMMENT ON TABLE identity.seats IS 'A seat is an email that may sign in under an account. Seat = login principal.';

-- admins --------------------------------------------------------------------------------------------------------
ALTER TABLE identity.admins ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE identity.admins ADD COLUMN IF NOT EXISTS password_hash text;
UPDATE identity.admins SET email = CASE phone
    WHEN '+966500000000' THEN 'admin@ejadah.test'
    ELSE 'admin-' || left(id::text, 8) || '@change.invalid' END
WHERE email IS NULL;
ALTER TABLE identity.admins ALTER COLUMN email SET NOT NULL;
ALTER TABLE identity.admins ADD CONSTRAINT admins_email_key UNIQUE (email);
ALTER TABLE identity.admins ADD CONSTRAINT admins_email_check CHECK (email = lower(email) AND email LIKE '_%@_%._%');
ALTER TABLE identity.admins DROP COLUMN phone;

-- SMS codes are gone ----------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS identity.otp_codes;
