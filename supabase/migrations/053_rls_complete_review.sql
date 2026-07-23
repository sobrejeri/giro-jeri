-- =============================================================================
-- 053_rls_complete_review.sql — Revisão COMPLETA de RLS
-- =============================================================================
-- Motivo: tabelas sem RLS ficam expostas à chave pública (anon) do Supabase e
-- geram alertas no Security Advisor; ativar RLS pelo painel SEM criar política
-- faz o dado "sumir silenciosamente" (foi o caso de high_season_rules).
--
-- Modelo desta revisão (deny-by-default):
--   • A API roda com service_role → IGNORA RLS. Nada aqui muda a API.
--   • O req.supabase (JWT do usuário, papel authenticated) só toca tabelas que
--     JÁ têm políticas (catálogo/stories/veículos — migrations 001/029/030/033/034).
--   • RLS LIGADO EM TODAS as tabelas restantes:
--       – Conteúdo genuinamente público  → política de SELECT explícita.
--       – Tabelas sensíveis/internas    → SEM política = invisíveis fora da API.
--   • Idempotente: pode rodar mais de uma vez.
-- =============================================================================

-- ── 1. CONTEÚDO PÚBLICO: RLS ligado + leitura pública explícita ──────────────

ALTER TABLE high_season_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_seasons" ON high_season_rules;
CREATE POLICY "public_seasons" ON high_season_rules
  FOR SELECT USING (is_active = TRUE);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_holidays" ON holidays;
CREATE POLICY "public_holidays" ON holidays
  FOR SELECT USING (is_active = TRUE);

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_feed_posts" ON feed_posts;
CREATE POLICY "public_feed_posts" ON feed_posts
  FOR SELECT USING (is_published = TRUE);

ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_establishments" ON establishments;
CREATE POLICY "public_establishments" ON establishments
  FOR SELECT USING (is_active = TRUE);

-- Comentários, curtidas e avaliações aparecem publicamente no app.
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_post_comments" ON post_comments;
CREATE POLICY "public_post_comments" ON post_comments
  FOR SELECT USING (TRUE);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_post_likes" ON post_likes;
CREATE POLICY "public_post_likes" ON post_likes
  FOR SELECT USING (TRUE);

ALTER TABLE establishment_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_establishment_reviews" ON establishment_reviews;
CREATE POLICY "public_establishment_reviews" ON establishment_reviews
  FOR SELECT USING (TRUE);

-- ── 2. SENSÍVEIS/INTERNAS: RLS ligado SEM política (só a API enxerga) ────────
-- ⚠️ system_settings guarda chave PIX, config de gateway e flags — a mais
--    crítica de todas; nunca criar política pública aqui.

ALTER TABLE system_settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_ledger             ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_availability       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_pricing_rules        ENABLE ROW LEVEL SECURITY;

-- ── 3. Verificação ───────────────────────────────────────────────────────────
-- Estado por tabela (rowsecurity deve ser true em TODAS):
--   SELECT tablename, rowsecurity FROM pg_tables
--    WHERE schemaname = 'public' ORDER BY rowsecurity, tablename;
-- Políticas existentes:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' ORDER BY tablename, policyname;
