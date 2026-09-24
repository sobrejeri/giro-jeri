-- ─────────────────────────────────────────────────────────────────────────────
-- GIRO JERI — 106: municípios de atuação do operador (filtro de solicitações)
--
-- Objetivo: rodar a plataforma em vários estados sem um operador de um estado
-- receber solicitação de outro. Cada operador passa a ter uma lista de
-- municípios (regions) que atende; a fila de aceite e as notificações só
-- entregam solicitações cujo `booking.region_id` está nessa lista.
--
-- Regra de negócio escolhida: OPT-IN ESTRITO. Operador SEM município marcado
-- não recebe nada. Por isso o backfill abaixo é essencial — ele evita quebrar
-- os operadores que já existem (Jericoacoara/Jijoca), dando a eles todos os
-- municípios ATIVOS de hoje. Operadores novos nascem com a lista vazia e
-- precisam ter os municípios marcados no cadastro (admin) para começar a
-- receber.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Coluna (array de uuids de regions). Nullable; só operadores usam.
ALTER TABLE users ADD COLUMN IF NOT EXISTS region_ids uuid[];

-- 2. Backfill: operadores/agências existentes ganham todos os municípios ativos
--    para NÃO pararem de receber ao ativar o filtro. Só mexe em quem está vazio.
UPDATE users
   SET region_ids = COALESCE(
     (SELECT array_agg(id) FROM regions WHERE is_active = true),
     '{}'::uuid[]
   )
 WHERE user_type IN ('operator', 'agency')
   AND (region_ids IS NULL OR region_ids = '{}'::uuid[]);

-- 3. Índice GIN para consultas por contido/interseção de município.
CREATE INDEX IF NOT EXISTS idx_users_region_ids ON users USING gin (region_ids);

-- ── VERIFICAÇÃO ──────────────────────────────────────────────────────────────
-- Espera ver os operadores com a lista preenchida (nenhum operador ativo com
-- region_ids vazio, a não ser os criados depois desta migração).
--   SELECT full_name, array_length(region_ids, 1) AS municipios
--     FROM users WHERE user_type IN ('operator','agency') ORDER BY created_at;
