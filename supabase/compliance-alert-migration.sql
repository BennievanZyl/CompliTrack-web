-- ── Compliance Alert Settings ─────────────────────────────────────────────────
-- Run this once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS compliance_alert_settings (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id          UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_enabled        BOOLEAN     NOT NULL DEFAULT false,
  alert_time        TIME        NOT NULL DEFAULT '15:30:00',
  recipient_ids     UUID[]      NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store_id)
);

-- RLS
ALTER TABLE compliance_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store members can manage alert settings"
  ON compliance_alert_settings
  FOR ALL
  USING (
    store_id IN (
      SELECT store_id FROM store_staff WHERE id = auth.uid()
      UNION
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── pg_cron job ────────────────────────────────────────────────────────────────
-- Enable pg_cron extension first if not already enabled:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace <YOUR_PROJECT_REF> and <YOUR_SERVICE_ROLE_KEY> before running
SELECT cron.schedule(
  'compliance-shift-alert',
  '* * * * *',
  $$
  SELECT net.http_post(
    url      := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/compliance-shift-alert',
    headers  := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
    ),
    body     := '{}'::jsonb
  ) AS request_id;
  $$
);
