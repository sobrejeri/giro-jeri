-- ── Passo 1 da 089: DESCOBRIR quais cadastros são serviço adicional ─────────
--
-- Somente LEITURA. Não altera nada.
--
-- Esta consulta NÃO decide por nome. Ela levanta SINAIS ESTRUTURAIS e entrega a
-- lista para conferência humana. Reclassificar "GUIA", "SERVIÇO", "INGRESSO"
-- por texto reclassificaria dado de produção sem confirmação — e um cadastro
-- chamado "Buggy do Guia Pedro" viraria serviço por engano.
--
-- Rode no SQL Editor do Supabase e confira linha a linha. O que interessa:
--   • `sinais` — quantos indícios de "não transporta gente" o cadastro tem
--   • `assentos_usados` — se ele JÁ foi usado como transporte em reserva real
--
-- Um cadastro com sinais altos E `assentos_usados = 0` é candidato forte.
-- Um cadastro com `assentos_usados > 0` foi usado como transporte de verdade:
-- pense duas vezes antes de marcar como serviço.

SELECT
  v.id,
  v.name,
  v.vehicle_type,
  v.seat_capacity,
  v.luggage_capacity,
  v.is_active,
  r.name AS regiao,

  -- Sinais estruturais (0 a 4). Quanto maior, mais parece serviço adicional.
  (
    (v.seat_capacity = 1)::int                                    -- 1 "assento"
  + (v.vehicle_type = 'other')::int                               -- sem tipo real
  + (COALESCE(v.luggage_capacity, 0) = 0)::int                    -- não leva bagagem
  + (v.is_transfer_allowed = FALSE AND v.is_shared_allowed = FALSE)::int
  ) AS sinais,

  -- Quantas vezes ESTE cadastro já entrou numa reserva como veículo, e quantos
  -- assentos ele representou. É o teste mais forte: serviço adicional não
  -- costuma ter histórico de transporte.
  COALESCE(bv.vezes, 0)           AS vezes_em_reservas,
  COALESCE(bv.assentos_usados, 0) AS assentos_usados,

  -- Quanto custa. Um "veículo" muito mais barato que o resto da frota da mesma
  -- região costuma ser taxa de serviço, não transporte.
  pr.menor_preco,

  v.is_transport AS marcado_hoje

FROM vehicles v
LEFT JOIN regions r ON r.id = v.region_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS vezes,
         SUM(bv.vehicle_capacity_snapshot * bv.quantity) AS assentos_usados
  FROM booking_vehicles bv
  WHERE bv.vehicle_id = v.id
) bv ON TRUE
LEFT JOIN LATERAL (
  SELECT MIN(vpr.base_price) AS menor_preco
  FROM vehicle_pricing_rules vpr
  WHERE vpr.vehicle_id = v.id AND vpr.is_active = TRUE
) pr ON TRUE

ORDER BY sinais DESC, COALESCE(bv.assentos_usados, 0) ASC, v.name;
