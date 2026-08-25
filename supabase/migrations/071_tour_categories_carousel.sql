-- =============================================================================
-- 071_tour_categories_carousel.sql — Categorias de passeio com carrossel próprio
-- =============================================================================
-- Mesma lógica já usada nos translados, onde a CATEGORIA (transfers) agrupa as
-- rotas e decide se elas ganham um carrossel separado no app.
--
-- Nos passeios a categoria já existia (`categories`, ligada por
-- `tours.category_id`), mas faltavam duas coisas:
--   1. a marca que faz a categoria virar carrossel próprio;
--   2. saber se a categoria é de PASSEIO — `category_type` existe desde a 001,
--      porém sem valor padrão, então as linhas antigas estão nulas.
--
-- Nada é obrigatório: passeio sem categoria continua no carrossel padrão, e
-- categoria sem a marca não cria carrossel nenhum. Comportamento atual
-- preservado enquanto ninguém marcar nada.
-- =============================================================================

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_exclusive BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN categories.is_exclusive IS
  'Categoria ganha carrossel próprio no app, com o nome dela como título. '
  'Espelha transfers.is_exclusive (migration 067), que faz o mesmo nos translados.';

-- `category_type` separa categoria de passeio de qualquer outro uso futuro.
-- As linhas existentes viram 'tour' porque hoje só passeios usam esta tabela
-- (`tours.category_id` é a única referência a ela).
UPDATE categories SET category_type = 'tour' WHERE category_type IS NULL;

ALTER TABLE categories
  ALTER COLUMN category_type SET DEFAULT 'tour';

-- Busca do app e do admin: sempre categoria ativa, na ordem definida.
CREATE INDEX IF NOT EXISTS idx_categories_tipo_ativo
  ON categories (category_type, sort_order)
  WHERE is_active = TRUE;
