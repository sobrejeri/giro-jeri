-- =============================================================================
-- GIRO JERI — 008: Filtragem geográfica de serviços por raio
--
-- Adiciona coordenadas e raio operacional opcionais em tours, transfers
-- e vehicles. Quando NULL, herdam da região (center_latitude / center_longitude
-- / service_radius_km).
--
-- Modelo de filtro (pseudo):
--   distancia_km(turista, COALESCE(servico.lat, regiao.center_lat),
--                         COALESCE(servico.lon, regiao.center_lon))
--   <= COALESCE(servico.service_radius_km, regiao.service_radius_km)
-- =============================================================================

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS latitude          DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude         DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS service_radius_km DECIMAL(8, 2);

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS latitude          DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude         DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS service_radius_km DECIMAL(8, 2);

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS latitude          DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude         DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS service_radius_km DECIMAL(8, 2);

-- Distância em km entre dois pontos (fórmula de Haversine, raio médio 6371 km)
CREATE OR REPLACE FUNCTION haversine_km(
  lat1 DECIMAL, lon1 DECIMAL,
  lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
  SELECT 2 * 6371 * ASIN(SQRT(
    POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
    COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
    POWER(SIN(RADIANS(lon2 - lon1) / 2), 2)
  ))::DECIMAL;
$$ LANGUAGE SQL IMMUTABLE;
