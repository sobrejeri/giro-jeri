-- =============================================================================
-- GIRO JERI — Migration 023: vincula estabelecimentos à região (geo-filtro)
-- =============================================================================

-- 1. Coluna region_id em establishments
ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES regions(id);

-- 2. Garante raio de 100 km para Jericoacoara
UPDATE regions
   SET service_radius_km = 100
 WHERE slug = 'jericoacoara';

-- 3. Vincula todos os estabelecimentos existentes à região Jericoacoara
--    (Preá, Jijoca, Caiçara e demais localidades do guia estão dentro do raio de 100 km)
UPDATE establishments
   SET region_id = (SELECT id FROM regions WHERE slug = 'jericoacoara' LIMIT 1)
 WHERE region_id IS NULL;

-- 4. Índice para acelerar o filtro por região
CREATE INDEX IF NOT EXISTS idx_establishments_region
  ON establishments (region_id, is_active, is_featured DESC, sort_order);
