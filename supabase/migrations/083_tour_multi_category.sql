-- =============================================================================
-- 083_tour_multi_category.sql — Passeio em mais de uma categoria
-- =============================================================================
-- `tours.category_id` só aceita UMA categoria, e há passeio que pertence a mais
-- de uma ao mesmo tempo: o voo panorâmico é "Voos Panorâmicos" e também entra
-- nas vitrines de privativo e de compartilhado, porque é vendido nos dois
-- modos. Com uma categoria só, escolher uma escondia o passeio da outra.
--
-- Mesmo padrão já usado em `establishments.region_ids` (migration 027): coluna
-- de array ao lado da coluna singular, que continua existindo.
--
-- `category_id` NÃO é removida de propósito:
--   • é o que o app e o admin leem hoje — remover quebraria tudo antes do deploy;
--   • passa a valer como a categoria PRINCIPAL (a primeira do array), usada
--     onde só cabe uma — o rótulo sob o nome do passeio, por exemplo.
-- As duas ficam em sincronia: quem grava manda as duas, e o backfill abaixo
-- alinha o que já existe.
-- =============================================================================

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS category_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tours.category_ids IS
  'Todas as categorias do passeio. A primeira é a principal e espelha '
  'tours.category_id, mantida para quem só sabe ler uma. Vazio = sem categoria.';

-- Backfill: quem já tem categoria única entra no array com ela.
-- Idempotente — roda de novo sem duplicar.
UPDATE tours
   SET category_ids = ARRAY[category_id]
 WHERE category_id IS NOT NULL
   AND (category_ids IS NULL OR category_ids = '{}');

-- Busca "passeios desta categoria": sem o índice GIN, o `&&` varre a tabela.
CREATE INDEX IF NOT EXISTS idx_tours_category_ids
  ON tours USING GIN (category_ids);
