-- 013_ai_calls.sql — one row per AI call (PLAN.md phase D): which feature, which provider (mock or anthropic),
-- how long, tokens, and whether it failed. The price never waits on this: a failed call just means no AI line.
CREATE TABLE IF NOT EXISTS ops.ai_calls (
  id             bigserial PRIMARY KEY,
  created_at     timestamptz NOT NULL DEFAULT now(),
  feature        text NOT NULL,              -- assess-notes | tips | legal
  provider       text NOT NULL,              -- mock | anthropic
  model          text,
  seat_id        uuid,
  valuation_id   uuid,
  ok             boolean NOT NULL,
  duration_ms    int,
  input_tokens   int,
  output_tokens  int,
  error          text,
  output         jsonb
);
CREATE INDEX IF NOT EXISTS ix_ai_calls_created ON ops.ai_calls (created_at DESC);
