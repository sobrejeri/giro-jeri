-- ── Municípios de atuação passam a viver na CATEGORIA ──────────────────────
-- Antes cada passeio guardava seus próprios municípios (tours.region_ids). Agora
-- quem manda na localização é a CATEGORIA: um passeio aparece nos municípios das
-- categorias em que está. O controle de localização fica em um lugar só e vale
-- igual para passeios (categories) e transfers (a "categoria" é a própria
-- transfer, que já carrega region_ids desde a migration 028/067).

ALTER TABLE categories ADD COLUMN IF NOT EXISTS region_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_categories_region_ids ON categories USING GIN (region_ids);

-- Semeia: cada categoria herda a UNIÃO dos municípios dos passeios que já estão
-- nela (usa category_ids; cai para o category_id escalar quando o array estiver
-- vazio). Assim nada some do app na virada — o admin refina depois.
UPDATE categories c
SET region_ids = sub.rids
FROM (
  SELECT cat_id, array_agg(DISTINCT rid) AS rids
  FROM tours t
  CROSS JOIN LATERAL unnest(
    COALESCE(NULLIF(t.category_ids, '{}'), ARRAY[t.category_id])
  ) AS cat_id
  CROSS JOIN LATERAL unnest(t.region_ids) AS rid
  WHERE array_length(t.region_ids, 1) > 0
    AND cat_id IS NOT NULL
  GROUP BY cat_id
) sub
WHERE c.id = sub.cat_id
  -- Só semeia categoria ainda sem município: rodar de novo não sobrescreve o
  -- que o admin já ajustou à mão.
  AND (c.region_ids IS NULL OR c.region_ids = '{}');

-- O passeio não precisa mais de município próprio: solta o NOT NULL do legado.
-- A coluna tours.region_id continua existindo (compatibilidade), mas deixa de
-- ser exigida na criação — a localização agora vem da categoria.
ALTER TABLE tours ALTER COLUMN region_id DROP NOT NULL;
