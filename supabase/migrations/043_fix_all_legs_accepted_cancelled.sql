-- =============================================================================
-- GIRO JERI — 043: FIX booking_all_legs_accepted() ignora pernas 'cancelled'
--
-- Bug relatado pelo Engenheiro Senior na implementação do checkout parcial
-- (Etapa 2, Onda A): `booking_all_legs_accepted` (042) considera QUALQUER
-- perna com status_leg <> 'accepted' como bloqueio — inclusive 'cancelled'.
--
-- No checkout parcial o cliente aceita pagar só as pernas já ACCEPTED e
-- CANCELA as pernas ainda pendentes (status_leg='cancelled' nelas). Isso é
-- uma escolha legítima e definitiva do cliente (não é "pendência", é
-- desistência daquele veículo) — mas a função antiga passa a retornar FALSE
-- para sempre (a perna cancelada nunca vira 'accepted'), e o trigger
-- `enforce_pay_after_all_legs` bloqueia o pagamento PERMANENTEMENTE, mesmo
-- das pernas que o cliente decidiu manter e pagar. Isso inutiliza o
-- checkout parcial.
--
-- Correção: pernas 'cancelled' deixam de contar como bloqueio. A função
-- passa a checar "não existe perna pendente/expirada" (isto é, toda perna
-- está em ('accepted','cancelled')) E "existe pelo menos 1 perna accepted"
-- (evita que um pedido com TODAS as pernas canceladas — cliente desistiu de
-- tudo — seja lido como "liberado para pagamento": nesse caso o pedido
-- correto é cancelado, não pago; ver bookings.status_commercial).
--
-- Nenhuma tabela/enum/policy muda nesta migration — só a função
-- `booking_all_legs_accepted`. `enforce_pay_after_all_legs` (o trigger que a
-- usa) não precisa mudar: ele já delega 100% da decisão à função.
--
-- Confirmado nesta migration (ver texto acima do Grep feito pelo DBA): a
-- função/trigger `recompute_booking_from_legs` mencionada pelo backend NÃO
-- existe em nenhuma migration aplicada (001..042) — o motor de pernas hoje
-- não recalcula bookings.status_commercial automaticamente a partir de
-- booking_legs; isso é responsabilidade da API. Ver Handoff.
-- =============================================================================

CREATE OR REPLACE FUNCTION booking_all_legs_accepted(p_booking_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
           SELECT 1 FROM booking_legs
           WHERE booking_id = p_booking_id AND status_leg = 'accepted'
         )
     AND NOT EXISTS (
           SELECT 1 FROM booking_legs
           WHERE booking_id = p_booking_id
             AND status_leg NOT IN ('accepted', 'cancelled')
         );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION booking_all_legs_accepted(UUID) IS
  'TRUE quando o pedido está liberado para pagamento (pay-after-all): '
  'existe pelo menos 1 perna accepted E nenhuma perna está em '
  'awaiting_acceptance/expired (pendente). Pernas cancelled são IGNORADAS '
  '(não bloqueiam) — é o caso do checkout parcial, onde o cliente cancela as '
  'pernas pendentes e paga só as aceitas. Um pedido com TODAS as pernas '
  'cancelled retorna FALSE (nada para pagar; o pedido deve ser cancelado, '
  'não pago). Corrige 042_booking_legs_split_engine.sql, que tratava '
  'cancelled como bloqueio permanente. enforce_pay_after_all_legs (mesmo '
  'arquivo 042) não muda — ele só delega a esta função.';


-- =============================================================================
-- VERIFICAÇÃO — roda dentro da própria migration, com fixtures 100%
-- descartáveis (region/user/tour/vehicle/bookings sintéticos, prefixo
-- 'zzz_test043_'), cobrindo os 4 cenários pedidos. Se qualquer cenário der
-- o resultado errado, a migration inteira ABORTA (RAISE EXCEPTION), o que é
-- o comportamento desejado — não aplicar um fix que não prova a si mesmo.
-- No caminho feliz, as fixtures são apagadas ao final do bloco (DELETE
-- explícito), não deixando nenhum resíduo em bookings/booking_legs/vehicles/
-- tours/users/regions.
-- =============================================================================

DO $$
DECLARE
  v_region_id   UUID;
  v_user_id     UUID;
  v_tour_id     UUID;
  v_vehicle_id  UUID;
  v_b_all_accepted       UUID;
  v_b_accepted_cancelled UUID;
  v_b_accepted_awaiting  UUID;
  v_b_all_cancelled      UUID;
  v_result BOOLEAN;
BEGIN
  -- Fixtures mínimas -----------------------------------------------------
  INSERT INTO regions (name, slug) VALUES
    ('zzz_test043_region', 'zzz-test043-region-' || uuid_generate_v4())
  RETURNING id INTO v_region_id;

  INSERT INTO users (full_name, email, user_type) VALUES
    ('zzz_test043_user', 'zzz_test043_' || uuid_generate_v4() || '@example.com', 'tourist')
  RETURNING id INTO v_user_id;

  INSERT INTO tours (region_id, name, slug) VALUES
    (v_region_id, 'zzz_test043_tour', 'zzz-test043-tour-' || uuid_generate_v4())
  RETURNING id INTO v_tour_id;

  INSERT INTO vehicles (region_id, name, vehicle_type, seat_capacity) VALUES
    (v_region_id, 'zzz_test043_vehicle', 'van', 10)
  RETURNING id INTO v_vehicle_id;

  -- 4 bookings, um por cenário (criados individualmente para capturar os 4
  -- ids em variáveis escalares) ---------------------------------------------
  INSERT INTO bookings (user_id, region_id, service_type, service_id, booking_mode, service_date, service_time, people_count)
    VALUES (v_user_id, v_region_id, 'tour', v_tour_id, 'private', CURRENT_DATE + 1, '10:00', 4)
    RETURNING id INTO v_b_all_accepted;
  INSERT INTO bookings (user_id, region_id, service_type, service_id, booking_mode, service_date, service_time, people_count)
    VALUES (v_user_id, v_region_id, 'tour', v_tour_id, 'private', CURRENT_DATE + 1, '10:00', 4)
    RETURNING id INTO v_b_accepted_cancelled;
  INSERT INTO bookings (user_id, region_id, service_type, service_id, booking_mode, service_date, service_time, people_count)
    VALUES (v_user_id, v_region_id, 'tour', v_tour_id, 'private', CURRENT_DATE + 1, '10:00', 4)
    RETURNING id INTO v_b_accepted_awaiting;
  INSERT INTO bookings (user_id, region_id, service_type, service_id, booking_mode, service_date, service_time, people_count)
    VALUES (v_user_id, v_region_id, 'tour', v_tour_id, 'private', CURRENT_DATE + 1, '10:00', 4)
    RETURNING id INTO v_b_all_cancelled;

  -- (a) todas as pernas 'accepted' -> esperado TRUE
  INSERT INTO booking_legs (booking_id, vehicle_id, vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot, pax_count, operator_id, status_leg)
    VALUES (v_b_all_accepted, v_vehicle_id, 'v', 'van', 10, 2, v_user_id, 'accepted'),
           (v_b_all_accepted, v_vehicle_id, 'v', 'van', 10, 2, v_user_id, 'accepted');

  -- (b) 1 accepted + 1 cancelled -> esperado TRUE (checkout parcial)
  INSERT INTO booking_legs (booking_id, vehicle_id, vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot, pax_count, operator_id, status_leg)
    VALUES (v_b_accepted_cancelled, v_vehicle_id, 'v', 'van', 10, 2, v_user_id, 'accepted'),
           (v_b_accepted_cancelled, v_vehicle_id, 'v', 'van', 10, 2, NULL, 'cancelled');

  -- (c) 1 accepted + 1 awaiting_acceptance -> esperado FALSE
  INSERT INTO booking_legs (booking_id, vehicle_id, vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot, pax_count, operator_id, status_leg)
    VALUES (v_b_accepted_awaiting, v_vehicle_id, 'v', 'van', 10, 2, v_user_id, 'accepted'),
           (v_b_accepted_awaiting, v_vehicle_id, 'v', 'van', 10, 2, NULL, 'awaiting_acceptance');

  -- (d) todas 'cancelled' -> esperado FALSE (nada para pagar)
  INSERT INTO booking_legs (booking_id, vehicle_id, vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot, pax_count, operator_id, status_leg)
    VALUES (v_b_all_cancelled, v_vehicle_id, 'v', 'van', 10, 2, NULL, 'cancelled'),
           (v_b_all_cancelled, v_vehicle_id, 'v', 'van', 10, 2, NULL, 'cancelled');

  -- Asserções --------------------------------------------------------------
  v_result := booking_all_legs_accepted(v_b_all_accepted);
  RAISE NOTICE 'VERIFICACAO 043 (a) todas accepted: %', v_result;
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FALHA cenario (a) todas accepted: esperado TRUE, obtido %', v_result;
  END IF;

  v_result := booking_all_legs_accepted(v_b_accepted_cancelled);
  RAISE NOTICE 'VERIFICACAO 043 (b) accepted+cancelled: %', v_result;
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FALHA cenario (b) accepted+cancelled: esperado TRUE, obtido %', v_result;
  END IF;

  v_result := booking_all_legs_accepted(v_b_accepted_awaiting);
  RAISE NOTICE 'VERIFICACAO 043 (c) accepted+awaiting: %', v_result;
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'FALHA cenario (c) accepted+awaiting: esperado FALSE, obtido %', v_result;
  END IF;

  v_result := booking_all_legs_accepted(v_b_all_cancelled);
  RAISE NOTICE 'VERIFICACAO 043 (d) todas cancelled: %', v_result;
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'FALHA cenario (d) todas cancelled: esperado FALSE, obtido %', v_result;
  END IF;

  -- Cleanup: apaga as fixtures (bookings -> cascade em booking_legs) ------
  DELETE FROM bookings
   WHERE id IN (v_b_all_accepted, v_b_accepted_cancelled, v_b_accepted_awaiting, v_b_all_cancelled);
  DELETE FROM vehicles WHERE id = v_vehicle_id;
  DELETE FROM tours    WHERE id = v_tour_id;
  DELETE FROM users    WHERE id = v_user_id;
  DELETE FROM regions  WHERE id = v_region_id;

  RAISE NOTICE 'VERIFICACAO 043: os 4 cenarios passaram e as fixtures foram removidas.';
END;
$$;
