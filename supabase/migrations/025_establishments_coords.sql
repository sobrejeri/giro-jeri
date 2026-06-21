-- =============================================================================
-- GIRO JERI — Migration 025: coordenadas geográficas nos estabelecimentos
-- =============================================================================
-- Permite exibir estabelecimentos como markers no Google Maps.
-- O admin preenche latitude/longitude manualmente ou via extração do maps_url.

ALTER TABLE establishments
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN establishments.latitude  IS 'Latitude decimal (ex: -2.7976)';
COMMENT ON COLUMN establishments.longitude IS 'Longitude decimal (ex: -40.5147)';

-- Índice para consultas geoespaciais futuras
CREATE INDEX IF NOT EXISTS idx_establishments_coords
  ON establishments (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
