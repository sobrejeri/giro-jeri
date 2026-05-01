-- Atualiza o raio de cobertura das regiões para 100 km
UPDATE regions
SET service_radius_km = 100
WHERE service_radius_km IS NOT NULL OR service_radius_km < 100;

-- Garante raio padrão de 100km para regiões que ainda não têm
UPDATE regions
SET service_radius_km = 100
WHERE service_radius_km IS NULL;
