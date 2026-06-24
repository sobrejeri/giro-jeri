-- =============================================================================
-- GIRO JERI — Migration 027: multi-região em establishments
--
-- Objetivo:
--   1. Inserir Cruz, Acaraú, Camocim e Granja como regiões individuais.
--   2. Adicionar coluna region_ids UUID[] em establishments (multi-região).
--   3. Migrar dados: copiar region_id -> region_ids para linhas existentes.
--   4. Criar índice GIN em region_ids.
--   5. Reduzir raio de Jericoacoara de 150 km para 20 km (cada cidade agora
--      tem sua própria região com raio próprio de ~20 km).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Inserir novas regiões
--    ON CONFLICT (slug) DO NOTHING garante idempotência.
--    "Jijoca de Jericoacoara" (slug=jericoacoara) já existe — não é inserida.
-- -----------------------------------------------------------------------------
INSERT INTO regions (
  name, slug, city, state, country,
  timezone, is_active,
  center_latitude, center_longitude,
  service_radius_km, sort_order
) VALUES
  ('Cruz',    'cruz',    'Cruz',    'Ceará', 'Brasil', 'America/Fortaleza', TRUE, -2.9224, -40.1693, 20, 2),
  ('Acaraú',  'acarau',  'Acaraú',  'Ceará', 'Brasil', 'America/Fortaleza', TRUE, -2.8854, -40.1207, 20, 3),
  ('Camocim', 'camocim', 'Camocim', 'Ceará', 'Brasil', 'America/Fortaleza', TRUE, -2.9023, -40.8457, 20, 4),
  ('Granja',  'granja',  'Granja',  'Ceará', 'Brasil', 'America/Fortaleza', TRUE, -3.1197, -40.8300, 20, 5)
ON CONFLICT (slug) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2. Atualizar raio de Jericoacoara
--    Antes: 150 km (cobria toda a região).
--    Agora: 20 km — cada cidade vizinha tem sua própria região.
-- -----------------------------------------------------------------------------
UPDATE regions
   SET service_radius_km = 20
 WHERE slug = 'jericoacoara';


-- -----------------------------------------------------------------------------
-- 3. Adicionar coluna region_ids UUID[] em establishments
-- -----------------------------------------------------------------------------
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS region_ids UUID[] DEFAULT '{}';


-- -----------------------------------------------------------------------------
-- 4. Migrar dados existentes: copiar region_id escalar para o array
--    Só atualiza linhas que ainda têm o array vazio/nulo, evitando dupla escrita.
-- -----------------------------------------------------------------------------
UPDATE establishments
   SET region_ids = ARRAY[region_id]
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');


-- -----------------------------------------------------------------------------
-- 5. Índice GIN para buscas eficientes em region_ids (operadores @>, &&, etc.)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_establishments_region_ids
  ON establishments USING GIN (region_ids);


-- =============================================================================
-- SCRIPT DE VERIFICAÇÃO
-- Execute após aplicar a migration para confirmar os resultados esperados.
-- =============================================================================

/*
-- 1. Confirmar que as 4 novas regiões foram inseridas (espera 4 linhas):
SELECT slug, name, service_radius_km, sort_order
  FROM regions
 WHERE slug IN ('cruz', 'acarau', 'camocim', 'granja')
 ORDER BY sort_order;

-- 2. Confirmar raio de Jericoacoara = 20 (espera 1 linha com 20):
SELECT slug, service_radius_km
  FROM regions
 WHERE slug = 'jericoacoara';

-- 3. Confirmar que a coluna region_ids existe em establishments:
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'establishments'
   AND column_name = 'region_ids';

-- 4. Confirmar que a migração de dados ocorreu corretamente
--    (espera 0 linhas — nenhum establishment com region_id preenchido e region_ids vazio):
SELECT COUNT(*) AS pendentes
  FROM establishments
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');

-- 5. Confirmar que o índice GIN foi criado:
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'establishments'
   AND indexname = 'idx_establishments_region_ids';
*/
