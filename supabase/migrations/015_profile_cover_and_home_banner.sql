-- =============================================================================
-- GIRO JERI — Migration 015: capa do perfil + banner da home
-- =============================================================================
-- 1. Imagem de capa (fundo) do perfil do turista — uma por usuário.
-- 2. Configurações do banner da home editáveis pelo admin (system_settings).
--
-- As imagens (capa e banner) são servidas pelo bucket público "avatars"
-- (criado na migration 004), então nenhum bucket novo é necessário.
-- =============================================================================

-- ── 1. Coluna de capa do perfil ──────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

COMMENT ON COLUMN users.cover_photo_url IS 'URL pública da imagem de capa (fundo) do perfil do turista';

-- ── 2. Configurações do banner da home ───────────────────────────────────────
-- ON CONFLICT garante idempotência; o endpoint admin de settings também faz
-- upsert, então estas linhas são apenas o estado inicial / documentação.
INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('home_banner_image_url', '',                        'string', 'Imagem de fundo do banner da home (turista)'),
  ('home_banner_title',     'Descubra Jericoacoara',   'string', 'Título do banner da home'),
  ('home_banner_subtitle',  'Passeios, transfers e experiências únicas você encontra aqui.', 'string', 'Subtítulo do banner da home')
ON CONFLICT (setting_key) DO NOTHING;
