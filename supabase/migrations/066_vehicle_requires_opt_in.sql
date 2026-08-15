-- =============================================================================
-- 066_vehicle_requires_opt_in.sql — Veículo restrito: só quem OPTA recebe
-- =============================================================================
-- PROBLEMA
-- O filtro de frota era OPT-OUT: a solicitação ia para TODAS as cooperativas,
-- exceto as que tivessem desativado aquele veículo explicitamente. Para veículo
-- comum (buggy, 4x4) isso é razoável. Para veículo especial — helicóptero — é
-- errado: quase nenhuma coop opera, então o pedido chegava para todo mundo.
--
-- Pior: reserva COMPARTILHADA não gera linhas em `booking_vehicles`, e o filtro
-- tratava "sem veículo" como fail-open → o voo panorâmico compartilhado ia para
-- todas as cooperativas mesmo que elas nunca operassem helicóptero.
--
-- SOLUÇÃO
-- `vehicles.requires_opt_in`: quando true, a solicitação só aparece (e só
-- notifica) as cooperativas com preferência EXPLÍCITA is_active = true para
-- aquele veículo. Inverte a regra apenas para os veículos marcados — os demais
-- seguem no modelo opt-out de hoje, sem mudança de comportamento.
--
-- Os veículos exigidos por uma reserva passam a ser resolvidos por
-- `booking_vehicles` e, quando não houver (caso do compartilhado), pelas regras
-- de preço do serviço (`vehicle_pricing_rules`) — ver services/fleet.js.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS requires_opt_in BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vehicles.requires_opt_in IS
  'true = veículo restrito: a solicitação só vai para cooperativas com '
  'preferência explícita is_active=true (opt-in). false = modelo padrão '
  'opt-out (vai para todas, menos quem desativou).';

-- Helicóptero é restrito (cadastrado na 065).
UPDATE vehicles SET requires_opt_in = true WHERE slug = 'helicoptero-3-pax';

-- ── Vínculo veículo × voo COMPARTILHADO ──────────────────────────────────────
-- O voo 01 é vendido POR PESSOA, então o preço mora no passeio e ele não tem
-- regra em vehicle_pricing_rules. Sem nenhuma regra, o filtro de frota não tem
-- como saber que aquele passeio é de helicóptero e a solicitação escapava para
-- todas as cooperativas. Criamos a regra para DECLARAR QUAL VEÍCULO executa o
-- serviço. O preço aqui não é usado na venda: o passeio tem
-- is_private_enabled = false, então o app nunca oferece a escolha de veículo.
INSERT INTO vehicle_pricing_rules (
  vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, is_active
)
SELECT veh.id, r.id, 'tour', t.id, 'per_vehicle', t.shared_price_per_person, TRUE
FROM tours t
JOIN vehicles veh ON veh.slug = 'helicoptero-3-pax'
JOIN regions  r   ON r.slug   = 'jericoacoara'
WHERE t.slug = 'heli-01-panoramico-compartilhado'
  AND NOT EXISTS (
    SELECT 1 FROM vehicle_pricing_rules x
    WHERE x.vehicle_id = veh.id AND x.service_id = t.id AND x.service_type = 'tour'
  );

-- ── Verificação ──────────────────────────────────────────────────────────────
--   SELECT name, slug, requires_opt_in FROM vehicles WHERE requires_opt_in;
--
-- LIBERAR uma cooperativa para receber os voos (troque o CNPJ):
--   INSERT INTO operator_service_preferences (operator_id, entity_type, entity_id, is_active)
--   SELECT u.id, 'vehicle', v.id, true
--     FROM users u, vehicles v
--    WHERE u.document_number = '00000000000000'   -- CNPJ da cooperativa
--      AND v.slug = 'helicoptero-3-pax'
--   ON CONFLICT (operator_id, entity_type, entity_id)
--   DO UPDATE SET is_active = true;
--
-- Conferir quem está liberado:
--   SELECT u.full_name, p.is_active
--     FROM operator_service_preferences p
--     JOIN users u ON u.id = p.operator_id
--     JOIN vehicles v ON v.id = p.entity_id
--    WHERE v.slug = 'helicoptero-3-pax' AND p.entity_type = 'vehicle';
