-- =============================================================================
-- 067_translados_aereos_exclusivos.sql — Translados de helicóptero (Frisonfly)
-- =============================================================================
-- Os 6 translados aéreos da tabela @jerivoospanoramicos entram como um serviço
-- de transfer EXCLUSIVO, com as rotas e valores confirmados pelo dono.
--
-- POR QUE EXCLUSIVO (mesma decisão dos voos panorâmicos, migration 065):
--   • para o CLIENTE: translado aéreo não deve se misturar com o de buggy na
--     mesma lista — a diferença de preço (R$ 3.000 x R$ 200) confunde;
--   • para a COOPERATIVA: quem opera helicóptero é só a Frisonfly. O filtro de
--     frota (requires_opt_in, migration 066) já cuida de não notificar as
--     outras — mas para isso a rota precisa estar LIGADA ao veículo, e é o que
--     as regras de preço abaixo fazem.
--
-- `transfers.is_exclusive` é o espelho de `tours.is_exclusive` (migration 051):
-- venda direta, um serviço por vez, fora do carrinho.
--
-- Idempotente.
-- =============================================================================

-- ── 0. Garantias de coluna ───────────────────────────────────────────────────
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS is_exclusive      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS region_ids        UUID[] DEFAULT '{}';   -- 028
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS min_advance_hours INT;                    -- 049

COMMENT ON COLUMN transfers.is_exclusive IS
  'true = translado exclusivo (venda direta, carrossel próprio, fora do carrinho). '
  'Espelha tours.is_exclusive.';

-- ── 1. O serviço-pai ─────────────────────────────────────────────────────────
INSERT INTO transfers (
  region_id, region_ids, name, slug, origin_label, destination_label,
  short_description, full_description,
  base_price, pricing_mode, is_private_only, is_exclusive, is_active,
  display_order, min_advance_hours, estimated_duration_minutes
)
SELECT
  r.id, ARRAY[r.id],
  'Translado Aéreo — Helicóptero',
  'translado-aereo-helicoptero',
  'Jericoacoara', 'Aeroportos e cidades da região',
  'Translado privativo de helicóptero saindo de Jericoacoara. Até 3 passageiros.',
  'Translado aéreo privativo em helicóptero, com saída de Jericoacoara.'
  || E'\n\nCapacidade de até 3 passageiros por voo. O valor é por trecho (voo), não por pessoa.'
  || E'\n\nSujeito a condições meteorológicas e à autorização de voo.',
  3000.00, 'fixed_route', TRUE, TRUE, TRUE,
  50, 24, 60
FROM regions r
WHERE r.slug = 'jericoacoara'
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  is_exclusive      = EXCLUDED.is_exclusive,
  is_private_only   = EXCLUDED.is_private_only,
  is_active         = EXCLUDED.is_active,
  display_order     = EXCLUDED.display_order,
  min_advance_hours = EXCLUDED.min_advance_hours,
  region_ids        = EXCLUDED.region_ids,
  updated_at        = NOW();

-- ── 2. As 6 rotas (valor por VOO, até 3 passageiros) ─────────────────────────
INSERT INTO transfer_routes (
  transfer_id, origin_name, destination_name, default_price, is_active
)
SELECT t.id, 'Jericoacoara', v.destino, v.preco, TRUE
FROM transfers t
CROSS JOIN (VALUES
  ('Aeroporto de Jericoacoara (JJD)',  3000.00::numeric),
  ('Camocim',                          6000.00::numeric),
  ('Sobral',                           7600.00::numeric),
  ('Parnaíba',                        10000.00::numeric),
  ('Fortaleza',                       15000.00::numeric),
  ('Teresina',                        30000.00::numeric)
) AS v(destino, preco)
WHERE t.slug = 'translado-aereo-helicoptero'
  AND NOT EXISTS (
    SELECT 1 FROM transfer_routes x
    WHERE x.transfer_id = t.id AND x.destination_name = v.destino
  );

-- Reexecução: mantém os valores fiéis à tabela do parceiro.
UPDATE transfer_routes x
SET default_price = v.preco, is_active = TRUE, updated_at = NOW()
FROM (VALUES
  ('Aeroporto de Jericoacoara (JJD)',  3000.00::numeric),
  ('Camocim',                          6000.00::numeric),
  ('Sobral',                           7600.00::numeric),
  ('Parnaíba',                        10000.00::numeric),
  ('Fortaleza',                       15000.00::numeric),
  ('Teresina',                        30000.00::numeric)
) AS v(destino, preco)
JOIN transfers t ON t.slug = 'translado-aereo-helicoptero'
WHERE x.transfer_id = t.id AND x.destination_name = v.destino;

-- ── 3. Vínculo com o HELICÓPTERO (filtro de frota) ───────────────────────────
-- Sem regra de preço ligando a rota ao veículo, o filtro de frota não sabe que
-- o translado é aéreo e a solicitação escaparia para todas as cooperativas —
-- exatamente o problema corrigido na 066 para o voo compartilhado.
INSERT INTO vehicle_pricing_rules (
  vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, is_active
)
SELECT veh.id, r.id, 'transfer', rt.id, 'per_vehicle', rt.default_price, TRUE
FROM transfer_routes rt
JOIN transfers t   ON t.id = rt.transfer_id AND t.slug = 'translado-aereo-helicoptero'
JOIN vehicles veh  ON veh.slug = 'helicoptero-3-pax'
JOIN regions  r    ON r.slug   = 'jericoacoara'
WHERE NOT EXISTS (
  SELECT 1 FROM vehicle_pricing_rules x
  WHERE x.vehicle_id = veh.id AND x.service_id = rt.id AND x.service_type = 'transfer'
);

-- ── Verificação (rode depois) ────────────────────────────────────────────────
--   SELECT rt.destination_name, rt.default_price, t.is_exclusive
--     FROM transfer_routes rt
--     JOIN transfers t ON t.id = rt.transfer_id
--    WHERE t.slug = 'translado-aereo-helicoptero'
--    ORDER BY rt.default_price;
--   -- Esperado: 6 rotas, de R$ 3.000 (JJD) a R$ 30.000 (Teresina), is_exclusive = t
