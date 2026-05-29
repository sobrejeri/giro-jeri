-- =============================================================================
-- 013 — gateway_recipient_id nos usuários (cooperativas)
-- =============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gateway_recipient_id VARCHAR(200);
