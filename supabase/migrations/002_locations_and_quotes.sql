-- =============================================================================
-- GIRO JERI — Migration 002
-- Localização via Google Maps + Transfer Quotes + Regra 4h
-- =============================================================================

-- =============================================================================
-- 1. CAMPOS DE LOCALIZAÇÃO EM BOOKINGS
-- Enriquece pickup e destino com dados reais do Google Maps
-- =============================================================================

ALTER TABLE bookings
  -- Local de embarque (passeios e transfers)
  ADD COLUMN pickup_place_id      VARCHAR(300),
  ADD COLUMN pickup_place_name    VARCHAR(300),
  ADD COLUMN pickup_latitude      DECIMAL(10, 7),
  ADD COLUMN pickup_longitude     DECIMAL(10, 7),
  -- Destino (transfers e passeios com retorno em local diferente)
  ADD COLUMN destination_place_id   VARCHAR(300),
  ADD COLUMN destination_place_name VARCHAR(300),
  ADD COLUMN destination_latitude   DECIMAL(10, 7),
  ADD COLUMN destination_longitude  DECIMAL(10, 7);

COMMENT ON COLUMN bookings.pickup_place_id IS
  'Google Place ID do ponto de embarque — identificador único e imutável do Maps';
COMMENT ON COLUMN bookings.pickup_place_name IS
  'Nome formatado do local de embarque conforme retornado pelo Google Places';
COMMENT ON COLUMN bookings.destination_place_id IS
  'Google Place ID do destino (obrigatório para transfers)';

-- =============================================================================
-- 2. CAMPOS DE LOCALIZAÇÃO EM TRANSFER_ROUTES
-- As rotas tabeladas também ganham coordenadas precisas
-- =============================================================================

ALTER TABLE transfer_routes
  ADD COLUMN origin_place_id        VARCHAR(300),
  ADD COLUMN origin_place_name      VARCHAR(300),
  ADD COLUMN destination_place_id   VARCHAR(300),
  ADD COLUMN destination_place_name VARCHAR(300);

COMMENT ON TABLE transfer_routes IS
  'Rotas tabeladas com preço fixo. '
  'Para rotas não listadas, usar transfer_quotes (cotação manual pela cooperativa).';

-- =============================================================================
-- 3. STATUS DE COTAÇÃO DE TRANSFER
-- =============================================================================

CREATE TYPE quote_status AS ENUM (
  'pending_quote',   -- aguardando cooperativa definir preço
  'quoted',          -- cooperativa definiu o preço, aguardando cliente
  'accepted',        -- cliente aceitou, aguardando pagamento
  'paid',            -- pago, reserva criada
  'expired',         -- cliente não respondeu no prazo
  'rejected',        -- cliente recusou o preço
  'cancelled'        -- cancelado por qualquer parte
);

-- =============================================================================
-- 4. TABELA TRANSFER_QUOTES
-- Cotações para rotas livres (origem/destino do Maps)
-- =============================================================================

CREATE TABLE transfer_quotes (
  id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  region_id                 UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,

  -- Origem (Google Maps)
  origin_place_id           VARCHAR(300),
  origin_place_name         VARCHAR(300) NOT NULL,
  origin_latitude           DECIMAL(10, 7),
  origin_longitude          DECIMAL(10, 7),
  origin_address_text       TEXT,

  -- Destino (Google Maps)
  destination_place_id      VARCHAR(300),
  destination_place_name    VARCHAR(300) NOT NULL,
  destination_latitude      DECIMAL(10, 7),
  destination_longitude     DECIMAL(10, 7),
  destination_address_text  TEXT,

  -- Dados do serviço
  service_date              DATE NOT NULL,
  service_time              TIME NOT NULL,
  people_count              INT NOT NULL CHECK (people_count > 0),
  luggage_count             INT NOT NULL DEFAULT 0,
  special_notes             TEXT,
  source_channel            source_channel NOT NULL DEFAULT 'app',

  -- Status do fluxo de cotação
  status                    quote_status NOT NULL DEFAULT 'pending_quote',

  -- Cotação da cooperativa
  quoted_price              DECIMAL(10, 2),
  quoted_by_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  quoted_at                 TIMESTAMPTZ,
  quote_notes               TEXT,           -- observações da cooperativa para o cliente

  -- Prazo para o cliente aceitar (ex: quoted_at + 2h)
  expires_at                TIMESTAMPTZ,

  -- Resposta do cliente
  client_responded_at       TIMESTAMPTZ,
  rejection_reason          TEXT,

  -- Reserva gerada após aceite + pagamento
  booking_id                UUID REFERENCES bookings(id) ON DELETE SET NULL,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Antecedência mínima: service_date/time deve ser >= NOW() + 4h
  -- (validação feita na API, não no banco — depende de system_settings)
  CONSTRAINT quote_date_check CHECK (
    service_date >= CURRENT_DATE
  )
);

SELECT create_updated_at_trigger('transfer_quotes');

-- RLS: turista vê apenas suas cotações
ALTER TABLE transfer_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_quotes" ON transfer_quotes
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Índices
CREATE INDEX idx_quotes_user        ON transfer_quotes(user_id);
CREATE INDEX idx_quotes_status      ON transfer_quotes(status);
CREATE INDEX idx_quotes_region      ON transfer_quotes(region_id);
CREATE INDEX idx_quotes_service_date ON transfer_quotes(service_date);
CREATE INDEX idx_quotes_expires     ON transfer_quotes(expires_at)
  WHERE status = 'quoted';

COMMENT ON TABLE transfer_quotes IS
  'Cotações para transfers com rotas não tabeladas. '
  'Fluxo: cliente solicita → cooperativa define preço → cliente aceita/recusa → se aceito, paga → booking criado.';

COMMENT ON COLUMN transfer_quotes.expires_at IS
  'Prazo para o cliente aceitar a cotação. Sugerido: quoted_at + 2 horas. '
  'Após expirar, status muda para expired automaticamente pelo job de automação.';

COMMENT ON COLUMN transfer_quotes.quoted_price IS
  'Preço definido manualmente pela cooperativa. '
  'Inclui alta temporada e quaisquer adicionais — a cooperativa já entrega o valor final.';

-- =============================================================================
-- 5. TRIGGER: auditoria automática em transfer_quotes
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_quote_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    INSERT INTO audit_logs
      (entity_type, entity_id, action_type, old_values_json, new_values_json)
    VALUES (
      'transfer_quotes',
      NEW.id,
      'status_change',
      jsonb_build_object('status', OLD.status, 'quoted_price', OLD.quoted_price),
      jsonb_build_object('status', NEW.status, 'quoted_price', NEW.quoted_price)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quotes_audit
  AFTER UPDATE ON transfer_quotes
  FOR EACH ROW EXECUTE FUNCTION audit_quote_changes();

-- =============================================================================
-- 6. AUTOMATION JOB: expirar cotações não respondidas
-- O backend deve rodar este job periodicamente (ex: a cada 15 min)
-- =============================================================================

CREATE OR REPLACE FUNCTION expire_pending_quotes()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE transfer_quotes
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'quoted'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_pending_quotes IS
  'Expira cotações que passaram do prazo sem resposta do cliente. '
  'Chamar via cron job ou Supabase Edge Function a cada 15 minutos.';

-- =============================================================================
-- 7. FUNÇÃO: validar antecedência mínima de transfer
-- Usada pela API antes de criar booking ou quote
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_transfer_advance(
  p_service_date DATE,
  p_service_time TIME
) RETURNS BOOLEAN AS $$
DECLARE
  v_min_hours     INT;
  v_service_ts    TIMESTAMPTZ;
  v_min_allowed   TIMESTAMPTZ;
BEGIN
  -- Lê configuração do banco (padrão: 4h)
  SELECT COALESCE(setting_value::INT, 4)
  INTO v_min_hours
  FROM system_settings
  WHERE setting_key = 'transfer_min_advance_hours';

  v_service_ts  := (p_service_date::TEXT || ' ' || p_service_time::TEXT)::TIMESTAMPTZ
                    AT TIME ZONE 'America/Fortaleza';
  v_min_allowed := NOW() AT TIME ZONE 'America/Fortaleza' + (v_min_hours || ' hours')::INTERVAL;

  RETURN v_service_ts >= v_min_allowed;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION validate_transfer_advance IS
  'Retorna TRUE se o horário do transfer respeita a antecedência mínima configurada. '
  'Usar no backend antes de criar booking ou transfer_quote.';

-- =============================================================================
-- 8. NOVOS VALORES EM system_settings
-- =============================================================================

INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  -- Regra das 4h para transfers
  ('transfer_min_advance_hours',    '4',    'number',
   'Antecedência mínima em horas para reserva ou cotação de transfer'),

  -- Prazo para cliente responder a uma cotação
  ('quote_expiry_hours',            '2',    'number',
   'Horas que o cliente tem para aceitar ou recusar uma cotação de transfer'),

  -- Google Maps
  ('google_maps_api_key_public',    '',     'string',
   'Chave pública da Google Maps Platform (Places Autocomplete no frontend)'),

  -- Alertas de cotação urgente (viagem próxima)
  ('quote_urgent_threshold_hours',  '6',    'number',
   'Cotações com viagem em até X horas são marcadas como urgentes no painel da cooperativa'),

  -- Máximo de bagagens por transfer
  ('transfer_max_luggage',          '10',   'number',
   'Quantidade máxima de bagagens por reserva de transfer');

-- =============================================================================
-- 9. SEED: rotas tabeladas de Jericoacoara
-- Preços já com alta temporada embutida ou base (cooperativa decide)
-- =============================================================================

-- Primeiro, criar o transfer "genérico" de Jericoacoara para vincular as rotas
WITH jeri AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO transfers
  (region_id, name, slug, short_description, pricing_mode, is_active, display_order)
SELECT
  jeri.id,
  'Transfer Jericoacoara',
  'transfer-jericoacoara',
  'Transfers com rotas fixas saindo de Jericoacoara. Para outros destinos, solicite cotação.',
  'fixed_route',
  TRUE,
  1
FROM jeri;

-- Rotas tabeladas
WITH t AS (SELECT id FROM transfers WHERE slug = 'transfer-jericoacoara')
INSERT INTO transfer_routes
  (transfer_id, origin_name, destination_name, default_price,
   origin_place_name, destination_place_name,
   extra_stop_price, night_fee, is_active)
SELECT t.id, r.orig, r.dest, r.price, r.orig, r.dest, r.extra, r.night, TRUE
FROM t, (VALUES
  -- Destinos principais
  ('Jericoacoara',   'Preá',                              200.00,  30.00, 50.00),
  ('Preá',           'Jericoacoara',                      200.00,  30.00, 50.00),
  ('Jericoacoara',   'Fortaleza',                         800.00,  80.00, 100.00),
  ('Fortaleza',      'Jericoacoara',                      800.00,  80.00, 100.00),
  ('Jericoacoara',   'Aeroporto de Jericoacoara (Cruz)',   150.00,  20.00, 30.00),
  ('Aeroporto de Jericoacoara (Cruz)', 'Jericoacoara',    150.00,  20.00, 30.00),
  ('Jericoacoara',   'Camocim',                           250.00,  30.00, 50.00),
  ('Camocim',        'Jericoacoara',                      250.00,  30.00, 50.00),
  ('Jericoacoara',   'Tatajuba',                          120.00,  20.00, 30.00),
  ('Tatajuba',       'Jericoacoara',                      120.00,  20.00, 30.00),
  ('Jericoacoara',   'Ilha de Jericoacoara (barco)',        80.00,   0.00,  0.00)
) AS r(orig, dest, price, extra, night);

-- =============================================================================
-- 10. VIEW: painel de cotações para a cooperativa
-- Facilita consulta no dashboard
-- =============================================================================

CREATE OR REPLACE VIEW v_quotes_dashboard AS
SELECT
  tq.id,
  tq.status,
  u.full_name                                    AS client_name,
  u.phone                                        AS client_phone,
  tq.origin_place_name,
  tq.destination_place_name,
  tq.service_date,
  tq.service_time,
  tq.people_count,
  tq.luggage_count,
  tq.quoted_price,
  tq.expires_at,
  tq.special_notes,
  tq.quote_notes,
  tq.created_at,
  -- Flag de urgência
  CASE
    WHEN (tq.service_date::TIMESTAMPTZ + tq.service_time::INTERVAL)
         - NOW() <= INTERVAL '6 hours'
    THEN TRUE ELSE FALSE
  END                                            AS is_urgent,
  -- Tempo restante para o cliente decidir
  CASE
    WHEN tq.expires_at IS NOT NULL AND tq.status = 'quoted'
    THEN EXTRACT(EPOCH FROM (tq.expires_at - NOW())) / 3600
    ELSE NULL
  END                                            AS hours_to_expire
FROM transfer_quotes tq
JOIN users u ON u.id = tq.user_id
WHERE tq.status NOT IN ('paid', 'cancelled');

COMMENT ON VIEW v_quotes_dashboard IS
  'Visão para o painel da cooperativa — mostra cotações ativas com flag de urgência.';

-- =============================================================================
-- 11. VIEW: detalhes de localização para o card operacional
-- Link direto para o Maps pronto para o motorista
-- =============================================================================

CREATE OR REPLACE VIEW v_booking_maps_links AS
SELECT
  b.id,
  b.booking_code,
  b.service_type,
  b.service_date,
  b.service_time,
  b.pickup_place_name,
  b.pickup_latitude,
  b.pickup_longitude,
  b.destination_place_name,
  b.destination_latitude,
  b.destination_longitude,
  -- Link para o Maps (abre rota no celular do motorista)
  CASE
    WHEN b.pickup_latitude IS NOT NULL AND b.destination_latitude IS NOT NULL
    THEN 'https://www.google.com/maps/dir/?api=1'
         || '&origin='      || b.pickup_latitude::TEXT || ','
                             || b.pickup_longitude::TEXT
         || '&destination=' || b.destination_latitude::TEXT || ','
                             || b.destination_longitude::TEXT
         || '&travelmode=driving'
    WHEN b.pickup_latitude IS NOT NULL
    THEN 'https://www.google.com/maps/search/?api=1&query='
         || b.pickup_latitude::TEXT || ',' || b.pickup_longitude::TEXT
    ELSE NULL
  END                      AS maps_route_url,
  -- Link só do ponto de embarque
  CASE
    WHEN b.pickup_place_id IS NOT NULL
    THEN 'https://www.google.com/maps/place/?q=place_id:' || b.pickup_place_id
    ELSE NULL
  END                      AS maps_pickup_url
FROM bookings b
WHERE b.status_operational NOT IN ('completed', 'cancelled');

COMMENT ON VIEW v_booking_maps_links IS
  'Links prontos do Google Maps para o painel operacional. '
  'maps_route_url abre a rota origem→destino. '
  'maps_pickup_url abre apenas o ponto de embarque.';
