-- 125 — PASSEIO PERSONALIZADO (cotação). Mesmo fluxo do translado personalizado,
-- mas para passeios: o cliente monta o roteiro (ponto de partida + paradas) +
-- veículo + data/hora/pessoas, SEM preço, e envia a solicitação. O operador
-- precifica, o cliente aceita e paga, e vira uma reserva normal
-- (service_type='tour', privativo) que segue o fluxo padrão (despacho etc.).
-- Reaproveita o enum quote_status (migração 002): pending_quote → quoted →
-- accepted → paid (+ expired/rejected/cancelled).

CREATE TABLE IF NOT EXISTS tour_quotes (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  region_id          UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,

  -- Ponto de partida (embarque). Vira o pin de localização do motorista/turista.
  origin_place_name  VARCHAR(300) NOT NULL,
  origin_latitude    DECIMAL(10, 7),
  origin_longitude   DECIMAL(10, 7),

  -- Roteiro: paradas que o cliente quer visitar — [{ "name", "lat", "lng" }].
  stops              JSONB NOT NULL DEFAULT '[]',

  -- Veículo desejado (texto do tipo: 'Buggy', '4x4', 'Lancha'…). Privativo.
  vehicle_type       VARCHAR(80),

  -- Dados do serviço.
  service_date       DATE NOT NULL,
  service_time       TIME NOT NULL,
  people_count       INT  NOT NULL CHECK (people_count > 0),
  special_notes      TEXT,
  source_channel     source_channel NOT NULL DEFAULT 'app',

  -- Fluxo de cotação (mesmo enum do translado).
  status             quote_status NOT NULL DEFAULT 'pending_quote',

  -- Cotação da cooperativa/operador.
  quoted_price       DECIMAL(10, 2),
  quoted_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  quoted_at          TIMESTAMPTZ,
  quote_notes        TEXT,                 -- observações do operador para o cliente
  expires_at         TIMESTAMPTZ,          -- prazo do cliente para aceitar (ex.: +2h)

  -- Resposta do cliente / reserva gerada ao aceitar (mesmos nomes do translado).
  client_responded_at TIMESTAMPTZ,
  rejection_reason    TEXT,
  booking_id          UUID REFERENCES bookings(id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_quotes_user   ON tour_quotes (user_id);
CREATE INDEX IF NOT EXISTS idx_tour_quotes_status ON tour_quotes (status);

ALTER TABLE tour_quotes ENABLE ROW LEVEL SECURITY;

-- Fila do operador (mesma ideia do v_quotes_dashboard dos translados): esconde
-- as pagas/canceladas e marca urgência / tempo restante para o cliente decidir.
CREATE OR REPLACE VIEW v_tour_quotes_dashboard AS
SELECT
  tq.id, tq.status,
  u.full_name AS client_name,
  u.phone     AS client_phone,
  tq.origin_place_name,
  tq.stops,
  tq.vehicle_type,
  tq.service_date, tq.service_time, tq.people_count,
  tq.quoted_price, tq.expires_at, tq.special_notes, tq.quote_notes, tq.created_at,
  CASE
    WHEN (tq.service_date::TIMESTAMPTZ + tq.service_time::INTERVAL) - NOW() <= INTERVAL '6 hours'
    THEN TRUE ELSE FALSE
  END AS is_urgent,
  CASE
    WHEN tq.expires_at IS NOT NULL AND tq.status = 'quoted'
    THEN EXTRACT(EPOCH FROM (tq.expires_at - NOW())) / 3600
    ELSE NULL
  END AS hours_to_expire
FROM tour_quotes tq
JOIN users u ON u.id = tq.user_id
WHERE tq.status NOT IN ('paid', 'cancelled');
