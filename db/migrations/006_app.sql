-- 006_app.sql — application schema: saved valuations (chapter 7.5 of the spec)
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.valuations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  user_id        uuid,                       -- NULL until auth lands (phase B.2)
  seat_id        uuid,
  city_id        int  NOT NULL,
  district_id    int,
  type_group     text NOT NULL CHECK (type_group IN ('land','villa','apartment','building')),
  area_m2        numeric(14,2) NOT NULL,
  plan_no        text,
  plot_no        text,
  request        jsonb NOT NULL,             -- the full form as submitted
  result         jsonb NOT NULL,             -- market.estimate_price output
  confidence     text NOT NULL,
  level_used     int,
  sample_size    int,
  tips           jsonb,                      -- filled by the AI step later
  ai_adjustment  jsonb,
  duration_ms    int
);
CREATE INDEX IF NOT EXISTS ix_valuations_user_created ON app.valuations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_valuations_created ON app.valuations (created_at DESC);
