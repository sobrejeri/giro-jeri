-- Índices para a busca por bounding-box do "Explorar Turiva" (GET /api/explore/map).
-- Sem PostGIS: a query filtra por faixa de latitude/longitude, então um índice
-- composto em (latitude, longitude) já acelera bastante o recorte da área visível.

CREATE INDEX IF NOT EXISTS idx_establishments_latlng ON establishments (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_tours_latlng          ON tours          (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_transfers_latlng      ON transfers      (latitude, longitude);
