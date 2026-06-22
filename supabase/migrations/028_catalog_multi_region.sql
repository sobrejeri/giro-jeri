-- =============================================================================
-- GIRO JERI — Migration 028: multi-região em tours, transfers e vehicles
--
-- Objetivo:
--   Estender o suporte a múltiplas regiões (introduzido em establishments na
--   migration 027) para as tabelas do catálogo de serviços:
--
--   1. Adicionar coluna region_ids UUID[] em tours.
--   2. Adicionar coluna region_ids UUID[] em transfers.
--   3. Adicionar coluna region_ids UUID[] em vehicles.
--   4. Migrar dados existentes: copiar region_id -> region_ids para cada tabela.
--   5. Criar índices GIN em region_ids para buscas eficientes por array.
--
-- Padrão adotado: igual à migration 027 (establishments).
--   - Coluna nullable com DEFAULT '{}' (array vazio) para não quebrar linhas existentes.
--   - Backfill idempotente: só preenche linhas com region_ids vazio/nulo.
--   - Índice GIN suporta operadores @> (contém), && (sobrepõe) e = em arrays UUID.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Adicionar coluna region_ids em tours
--    DEFAULT '{}' garante que inserções futuras sem este campo não quebrem.
--    IF NOT EXISTS torna o passo reentrante.
-- -----------------------------------------------------------------------------
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS region_ids UUID[] DEFAULT '{}';


-- -----------------------------------------------------------------------------
-- 2. Adicionar coluna region_ids em transfers
-- -----------------------------------------------------------------------------
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS region_ids UUID[] DEFAULT '{}';


-- -----------------------------------------------------------------------------
-- 3. Adicionar coluna region_ids em vehicles
-- -----------------------------------------------------------------------------
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS region_ids UUID[] DEFAULT '{}';


-- -----------------------------------------------------------------------------
-- 4. Migrar dados existentes de tours
--    Copia o valor escalar region_id para dentro do array region_ids.
--    A condição (region_ids IS NULL OR region_ids = '{}') evita dupla escrita
--    caso a migration seja reaplicada acidentalmente.
-- -----------------------------------------------------------------------------
UPDATE tours
   SET region_ids = ARRAY[region_id]
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');


-- -----------------------------------------------------------------------------
-- 5. Migrar dados existentes de transfers
-- -----------------------------------------------------------------------------
UPDATE transfers
   SET region_ids = ARRAY[region_id]
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');


-- -----------------------------------------------------------------------------
-- 6. Migrar dados existentes de vehicles
-- -----------------------------------------------------------------------------
UPDATE vehicles
   SET region_ids = ARRAY[region_id]
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');


-- -----------------------------------------------------------------------------
-- 7. Índices GIN para buscas eficientes em region_ids (operadores @>, &&, etc.)
--    GIN é o tipo correto para colunas de array com muitos valores distintos.
--    IF NOT EXISTS garante idempotência.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tours_region_ids
  ON tours USING GIN (region_ids);

CREATE INDEX IF NOT EXISTS idx_transfers_region_ids
  ON transfers USING GIN (region_ids);

CREATE INDEX IF NOT EXISTS idx_vehicles_region_ids
  ON vehicles USING GIN (region_ids);


-- =============================================================================
-- SCRIPT DE VERIFICAÇÃO
-- Execute após aplicar a migration para confirmar os resultados esperados.
-- =============================================================================

/*
-- 1. Confirmar que as colunas region_ids foram criadas nas 3 tabelas
--    (espera 3 linhas, uma por tabela):
SELECT table_name, column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name IN ('tours', 'transfers', 'vehicles')
   AND column_name = 'region_ids'
 ORDER BY table_name;

-- 2. Confirmar que o backfill de tours não deixou registros pendentes
--    (espera COUNT = 0):
SELECT COUNT(*) AS pendentes_tours
  FROM tours
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');

-- 3. Confirmar que o backfill de transfers não deixou registros pendentes
--    (espera COUNT = 0):
SELECT COUNT(*) AS pendentes_transfers
  FROM transfers
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');

-- 4. Confirmar que o backfill de vehicles não deixou registros pendentes
--    (espera COUNT = 0):
SELECT COUNT(*) AS pendentes_vehicles
  FROM vehicles
 WHERE region_id IS NOT NULL
   AND (region_ids IS NULL OR region_ids = '{}');

-- 5. Confirmar que os 3 índices GIN foram criados
--    (espera 3 linhas):
SELECT tablename, indexname, indexdef
  FROM pg_indexes
 WHERE tablename IN ('tours', 'transfers', 'vehicles')
   AND indexname IN (
     'idx_tours_region_ids',
     'idx_transfers_region_ids',
     'idx_vehicles_region_ids'
   )
 ORDER BY tablename;

-- 6. Amostra de consistência: tours com region_id devem ter region_ids não vazio
--    (espera 0 linhas discrepantes):
SELECT id, region_id, region_ids
  FROM tours
 WHERE region_id IS NOT NULL
   AND NOT (region_ids @> ARRAY[region_id]);
*/
