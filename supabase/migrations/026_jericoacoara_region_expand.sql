-- Migration 026: expande cobertura de Jericoacoara para municípios do entorno
-- Cobre Cruz, Jijoca de Jericoacoara, Acaraú, Camocim e Granja (todos < 80 km do centro)

-- 1. Garante raio generoso (150 km) para cobrir todos os municípios vizinhos
UPDATE regions
SET service_radius_km = 150
WHERE slug = 'jericoacoara';

-- 2. Vincula todos os estabelecimentos sem região à Jericoacoara
UPDATE establishments e
SET region_id = r.id
FROM regions r
WHERE r.slug = 'jericoacoara'
  AND e.region_id IS NULL;

-- 3. Vincula também tours sem região (exibição no feed de passeios)
UPDATE tours t
SET region_id = r.id
FROM regions r
WHERE r.slug = 'jericoacoara'
  AND t.region_id IS NULL;

-- 4. Vincula transfers sem região
UPDATE transfers t
SET region_id = r.id
FROM regions r
WHERE r.slug = 'jericoacoara'
  AND t.region_id IS NULL;
