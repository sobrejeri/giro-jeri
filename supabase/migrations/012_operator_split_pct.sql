-- =============================================================================
-- 012 — Percentual de split personalizado por cooperativa
-- =============================================================================
-- Quando NULL, usa o valor global de system_settings.payment_split_admin_pct.
-- Quando preenchido, sobrescreve o padrão apenas para esta cooperativa.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS platform_split_pct DECIMAL(5,2) CHECK (platform_split_pct >= 0 AND platform_split_pct <= 100);
