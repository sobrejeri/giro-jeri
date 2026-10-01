-- =============================================================================
-- 117_parking_address.sql — Endereço do estacionamento (para "Como chegar")
-- =============================================================================
-- lat/lng já existem em parking_lots (migration 107). Aqui adicionamos o endereço
-- legível para o cliente abrir no Google Maps/Waze. Idempotente.
-- =============================================================================

ALTER TABLE parking_lots ADD COLUMN IF NOT EXISTS address TEXT;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'parking_lots' AND column_name IN ('address','lat','lng');
*/
