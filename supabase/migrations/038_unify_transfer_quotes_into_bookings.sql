-- =============================================================================
-- GIRO JERI — 038: unificar translado personalizado em BOOKINGS
--
-- Objetivo: eliminar `transfer_quotes` como sistema de estados ativo. Passeio,
-- translado de rota fixa e translado de rota personalizada passam a viver
-- inteiramente em `bookings`, usando o mesmo ciclo solicitar → aceitar/precificar
-- → pagar → operar que já existe para os outros serviços (migration 035).
--
-- Regra de negócio (PO):
--   - Translado personalizado nasce em status_commercial = 'awaiting_acceptance',
--     SEM total_amount definido (pricing_mode manual).
--   - A cooperativa "aceita e precifica" em um único ato — não há mais um passo
--     separado de aceite de preço pelo cliente. Ao precificar, o booking já
--     vai para 'awaiting_payment' e o operator_id já é atribuído (mesmo
--     comportamento de POST /api/operator/bookings/:id/accept, mas setando o
--     preço no mesmo update).
--   - A partir da SOLICITAÇÃO original (created_at do booking, não da
--     precificação) corre uma única janela de `quote_expiry_hours` (system_settings,
--     padrão 2h) para a cooperativa precificar E o turista pagar. Se o prazo
--     se esgotar antes do pagamento aprovado, o booking expira
--     automaticamente (status_commercial = 'expired', ver migration 037),
--     independentemente de já ter sido precificado ou não.
--
-- `transfer_quotes` deixa de ser ponto de entrada do fluxo ativo. A tabela é
-- preservada como histórico/log (cotações já finalizadas antes desta
-- migration) e como destino opcional de auditoria caso algum relatório legado
-- ainda dependa dela — mas nenhuma rota nova deve inserir ali.
-- =============================================================================

-- =============================================================================
-- 1. BOOKINGS — campos para suportar precificação manual (translado personalizado)
-- =============================================================================

ALTER TABLE bookings
  -- Quem precificou manualmente e quando (auditoria). operator_id já guarda
  -- "quem aceitou" — mas como aceite e precificação são o mesmo ato no novo
  -- fluxo, quoted_by_user_id é redundante com operator_id na maioria dos casos.
  -- Mantemos os dois: operator_id é genérico (toda reserva atribuída),
  -- quoted_by_user_id só é preenchido quando houve precificação manual,
  -- preservando a semântica "quem definiu o preço" mesmo se operator_id mudar
  -- depois por algum motivo administrativo.
  ADD COLUMN IF NOT EXISTS quoted_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quoted_at          TIMESTAMPTZ,

  -- Prazo único (a partir da solicitação original) para precificar + pagar.
  -- NULL para reservas que não passam por esse fluxo (passeio, rota fixa).
  ADD COLUMN IF NOT EXISTS quote_expires_at   TIMESTAMPTZ,

  -- Campos do translado personalizado que hoje só existiam em transfer_quotes.
  -- people_count e special_notes já existem em bookings — só faltava luggage_count.
  ADD COLUMN IF NOT EXISTS luggage_count      INT NOT NULL DEFAULT 0 CHECK (luggage_count >= 0),

  -- Observações da cooperativa para o cliente junto com o preço (existia em
  -- transfer_quotes.quote_notes).
  ADD COLUMN IF NOT EXISTS quote_notes        TEXT,

  -- Marca explicitamente reservas originadas do fluxo de cotação manual,
  -- para telas/filtros sem precisar inferir por pricing_mode do transfer pai.
  ADD COLUMN IF NOT EXISTS is_manual_quote    BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bookings.quoted_by_user_id IS
  'Usuário (cooperativa) que definiu o preço manualmente. Preenchido apenas '
  'para translado de rota personalizada (pricing_mode = manual_quote no transfer pai).';
COMMENT ON COLUMN bookings.quoted_at IS
  'Momento em que a cooperativa precificou a solicitação (aceite + preço no mesmo ato).';
COMMENT ON COLUMN bookings.quote_expires_at IS
  'Prazo único, contado a partir de bookings.created_at (solicitação original), '
  'para a cooperativa precificar E o turista pagar. Passado esse prazo sem '
  'pagamento aprovado, expire_pending_bookings() move o booking para ''expired''. '
  'NULL para serviços que não usam precificação manual (passeio, rota fixa).';
COMMENT ON COLUMN bookings.luggage_count IS
  'Quantidade de bagagens informada na solicitação de translado personalizado.';
COMMENT ON COLUMN bookings.quote_notes IS
  'Observações da cooperativa ao precificar, visíveis para o cliente.';
COMMENT ON COLUMN bookings.is_manual_quote IS
  'TRUE quando o booking nasceu como solicitação de translado de rota '
  'personalizada (sem total_amount, pricing_mode manual). Facilita filtros '
  'sem precisar voltar a transfers.pricing_mode.';

-- total_amount já é NOT NULL DEFAULT 0 (migration 001) — isso é suficiente
-- para "nascer sem preço": o booking nasce com total_amount = 0 e
-- status_commercial = 'awaiting_acceptance'; o front e as rotas de pagamento
-- já tratam total_amount <= 0 / status diferente de awaiting_payment como
-- "ainda não pode pagar" (ver payments.js linha ~234). Não tornamos a coluna
-- NULLABLE para não quebrar somas/relatórios existentes que assumem NOT NULL;
-- 0 é semanticamente "sem preço ainda" neste fluxo, igual ao default já usado
-- por todo o resto do sistema.

-- Índice para o job de expiração (só percorre candidatos ativos)
CREATE INDEX IF NOT EXISTS idx_bookings_quote_expires
  ON bookings(quote_expires_at)
  WHERE status_commercial IN ('awaiting_acceptance', 'awaiting_payment')
    AND quote_expires_at IS NOT NULL;

-- Índice para o painel da cooperativa listar solicitações de translado
-- personalizado aguardando preço.
CREATE INDEX IF NOT EXISTS idx_bookings_manual_quote_pending
  ON bookings(created_at)
  WHERE is_manual_quote AND status_commercial = 'awaiting_acceptance';

-- =============================================================================
-- 2. route_id — confirmação de que NÃO há sobreposição de FK
-- bookings.route_id sempre referenciou transfer_routes(id) (migration 001,
-- linha 554) — rota fixa. transfer_quotes nunca foi referenciada por
-- bookings.route_id; o relacionamento inverso (transfer_quotes.booking_id →
-- bookings.id) é que existia, para linkar a cotação paga ao booking criado
-- depois. Como o booking agora NASCE diretamente (sem quote intermediária),
-- esse relacionamento inverso fica obsoleto para fluxo novo. Não há, portanto,
-- sobrecarga de coluna a desfazer em route_id: ele continua exclusivamente
-- "rota fixa, se houver" e permanece NULL para translado personalizado
-- (a origem/destino do translado personalizado já vêm de
-- pickup_place_id/destination_place_id, preenchidos desde a migration 002).
COMMENT ON COLUMN bookings.route_id IS
  'Rota tabelada (transfer_routes), aplicável apenas a translado de rota fixa. '
  'NULL para passeios e para translado de rota personalizada — nesse caso a '
  'origem/destino vêm de pickup_place_id/destination_place_id e o preço é '
  'definido manualmente (ver quoted_by_user_id, quoted_at, quote_expires_at).';

-- =============================================================================
-- 3. FUNÇÃO: expirar bookings de cotação manual sem pagamento a tempo
-- Substitui expire_pending_quotes() (migration 002) como job ativo. A função
-- antiga é mantida (não editamos migrations existentes) mas não deve mais ser
-- chamada pelo cron do backend a partir desta migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION expire_pending_bookings()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE bookings
  SET status_commercial = 'expired',
      updated_at        = NOW()
  WHERE is_manual_quote
    AND status_commercial IN ('awaiting_acceptance', 'awaiting_payment')
    AND quote_expires_at IS NOT NULL
    AND quote_expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_pending_bookings IS
  'Expira bookings de translado personalizado (is_manual_quote) cuja janela '
  'única de 2h (quote_expires_at, contada da solicitação original) passou sem '
  'pagamento aprovado — tanto os que nunca foram precificados quanto os que '
  'foram precificados mas não pagos. Chamar via cron/Edge Function a cada '
  '5–15 minutos. Substitui expire_pending_quotes() (migration 002) para o '
  'fluxo ativo; aquela função permanece apenas para a tabela legada '
  'transfer_quotes, hoje sem inserts novos.';

-- =============================================================================
-- 4. TRIGGER DE AUDITORIA — reaproveita audit_logs já existente
-- O trigger trg_bookings_status_change (migration 001) já audita toda
-- transição de status_commercial/status_operational em bookings. Não é
-- necessário trigger novo: a auditoria de "quem precificou e quando" fica em
-- quoted_by_user_id/quoted_at (colunas, não log) e a transição de status que
-- resulta da precificação (awaiting_acceptance → awaiting_payment) já cai no
-- trigger existente automaticamente.
-- =============================================================================

-- =============================================================================
-- 5. VIEW: painel da cooperativa para translado personalizado em BOOKINGS
-- Substitui v_quotes_dashboard (migration 002) como fonte para a tela de
-- "solicitações aguardando preço". Mantém o mesmo contrato de colunas usado
-- pelo front (client_name, client_phone, origin/destination, etc.) para
-- minimizar mudança no consumo da API.
-- =============================================================================

CREATE OR REPLACE VIEW v_manual_quote_bookings AS
SELECT
  b.id,
  b.booking_code,
  b.status_commercial                              AS status,
  u.full_name                                       AS client_name,
  u.phone                                            AS client_phone,
  b.pickup_place_name                                AS origin_place_name,
  b.destination_place_name,
  b.service_date,
  b.service_time,
  b.people_count,
  b.luggage_count,
  b.total_amount                                     AS quoted_price,
  b.quote_expires_at                                  AS expires_at,
  b.special_notes,
  b.quote_notes,
  b.created_at,
  -- Urgência: viagem em até quote_urgent_threshold_hours (system_settings)
  CASE
    WHEN (b.service_date::TIMESTAMPTZ + b.service_time::INTERVAL) - NOW()
         <= INTERVAL '6 hours'
    THEN TRUE ELSE FALSE
  END                                                  AS is_urgent,
  -- Tempo restante da janela única (precificar + pagar)
  CASE
    WHEN b.quote_expires_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (b.quote_expires_at - NOW())) / 3600
    ELSE NULL
  END                                                  AS hours_to_expire
FROM bookings b
JOIN users u ON u.id = b.user_id
WHERE b.is_manual_quote
  AND b.status_commercial IN ('awaiting_acceptance', 'awaiting_payment');

COMMENT ON VIEW v_manual_quote_bookings IS
  'Substitui v_quotes_dashboard. Lista bookings de translado personalizado '
  'ainda dentro da janela ativa (aguardando preço ou aguardando pagamento). '
  'v_quotes_dashboard (migration 002) é mantida apontando para transfer_quotes '
  'só como consulta de histórico legado.';

-- =============================================================================
-- 6. RLS — bookings já tem policy "users_own_bookings" (migration 001) que
-- restringe leitura/escrita ao próprio usuário via auth.uid(). A API sempre
-- acessa o banco com a service role key (packages/api/src/supabase.js), que
-- ignora RLS — então RLS aqui é defesa em profundidade, não o mecanismo de
-- controle de acesso usado pelas rotas de operador/admin. Não criamos policy
-- nova de "operador vê bookings pendentes" porque isso abriria acesso a TODOS
-- os bookings de outras cooperativas para qualquer usuário autenticado via
-- client direto (anon/authenticated key) — incompatível com o modelo atual,
-- que delega esse controle à API. Se algum dia um cliente Supabase
-- autenticado direto (sem passar pela API) precisar ler bookings pendentes,
-- a policy correta deve filtrar por `operator_id IS NULL` (visível, sem dados
-- de outro operador) e nunca por região/cooperativa specific sem checar
-- vínculo do usuário operador — isso é trabalho para uma migration própria,
-- fora do escopo desta unificação.
-- =============================================================================

-- =============================================================================
-- 7. MIGRAÇÃO DE DADOS — converter transfer_quotes ativas em bookings
-- Cotações ativas: pending_quote, quoted, accepted.
-- Cotações finalizadas (paid, expired, rejected, cancelled) NÃO são
-- convertidas — ficam só como histórico em transfer_quotes.
-- =============================================================================

-- bookings.service_id é UUID NOT NULL sem FK (tour_id OU transfer_id, resolvido
-- pela aplicação). transfer_quotes não guarda transfer_id, só region_id — então
-- resolvemos aqui o transfer "genérico" de rota personalizada (pricing_mode =
-- 'manual_quote') de cada região para popular service_id corretamente. Se uma
-- região não tiver um transfer manual_quote cadastrado, a cotação daquela
-- região fica de fora da conversão automática (log via RAISE WARNING) — não
-- inventamos um service_id falso.

DO $$
DECLARE
  v_converted   INT := 0;
  v_missing_ids UUID[];
BEGIN
  -- Sanidade: regiões com cotação ativa mas sem transfer manual_quote cadastrado.
  SELECT array_agg(DISTINCT tq.region_id)
    INTO v_missing_ids
  FROM transfer_quotes tq
  WHERE tq.status IN ('pending_quote', 'quoted', 'accepted')
    AND tq.booking_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM transfers t
       WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote'
    );

  IF v_missing_ids IS NOT NULL THEN
    RAISE WARNING 'Regiões sem transfer manual_quote cadastrado — cotações ativas dessas regiões NÃO serão convertidas: %', v_missing_ids;
  END IF;

  -- pending_quote → awaiting_acceptance, sem preço, sem operador.
  -- Janela de 2h contada da solicitação ORIGINAL (tq.created_at), nunca usada
  -- antes porque a cotação ainda não tinha expires_at (só ganha ao precificar).
  INSERT INTO bookings (
    booking_code, user_id, region_id,
    service_type, service_id, booking_mode,
    status_commercial, status_operational,
    booking_date, service_date, service_time,
    people_count, luggage_count, special_notes,
    pickup_place_id, pickup_place_name,
    pickup_latitude, pickup_longitude,
    destination_place_id, destination_place_name,
    destination_latitude, destination_longitude,
    total_amount, payment_status, payment_model,
    source_channel,
    is_manual_quote,
    quote_expires_at,
    created_at
  )
  SELECT
    'GJ-MIG-' || LPAD(nextval('bookings_seq')::TEXT, 6, '0'),
    tq.user_id, tq.region_id,
    'transfer',
    (SELECT t.id FROM transfers t WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote' LIMIT 1),
    'private',
    'awaiting_acceptance', 'new',
    tq.created_at::DATE, tq.service_date, tq.service_time,
    tq.people_count, tq.luggage_count, tq.special_notes,
    tq.origin_place_id, tq.origin_place_name,
    tq.origin_latitude, tq.origin_longitude,
    tq.destination_place_id, tq.destination_place_name,
    tq.destination_latitude, tq.destination_longitude,
    0, 'pending', 'full',
    tq.source_channel,
    TRUE,
    tq.created_at + (
      COALESCE((SELECT setting_value::INT FROM system_settings
                WHERE setting_key = 'quote_expiry_hours'), 2) || ' hours'
    )::INTERVAL,
    tq.created_at
  FROM transfer_quotes tq
  WHERE tq.status = 'pending_quote'
    AND tq.booking_id IS NULL
    AND EXISTS (SELECT 1 FROM transfers t WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote');

  -- quoted → awaiting_payment, com preço e operador já definidos.
  -- A janela permanece a partir da solicitação original (tq.created_at), não
  -- de tq.quoted_at — é essa a regra nova do PO (antes a janela só começava
  -- na precificação).
  INSERT INTO bookings (
    booking_code, user_id, region_id, operator_id,
    service_type, service_id, booking_mode,
    status_commercial, status_operational,
    booking_date, service_date, service_time,
    people_count, luggage_count, special_notes,
    pickup_place_id, pickup_place_name,
    pickup_latitude, pickup_longitude,
    destination_place_id, destination_place_name,
    destination_latitude, destination_longitude,
    total_amount, payment_status, payment_model,
    source_channel,
    quoted_by_user_id, quoted_at, quote_notes,
    is_manual_quote,
    quote_expires_at,
    created_at
  )
  SELECT
    'GJ-MIG-' || LPAD(nextval('bookings_seq')::TEXT, 6, '0'),
    tq.user_id, tq.region_id, tq.quoted_by_user_id,
    'transfer',
    (SELECT t.id FROM transfers t WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote' LIMIT 1),
    'private',
    'awaiting_payment', 'new',
    tq.created_at::DATE, tq.service_date, tq.service_time,
    tq.people_count, tq.luggage_count, tq.special_notes,
    tq.origin_place_id, tq.origin_place_name,
    tq.origin_latitude, tq.origin_longitude,
    tq.destination_place_id, tq.destination_place_name,
    tq.destination_latitude, tq.destination_longitude,
    tq.quoted_price, 'pending', 'full',
    tq.source_channel,
    tq.quoted_by_user_id, tq.quoted_at, tq.quote_notes,
    TRUE,
    tq.created_at + (
      COALESCE((SELECT setting_value::INT FROM system_settings
                WHERE setting_key = 'quote_expiry_hours'), 2) || ' hours'
    )::INTERVAL,
    tq.created_at
  FROM transfer_quotes tq
  WHERE tq.status = 'quoted'
    AND tq.booking_id IS NULL
    AND EXISTS (SELECT 1 FROM transfers t WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote');

  -- accepted → awaiting_payment (cliente já tinha aceitado preço no fluxo
  -- antigo; no fluxo novo não existe mais o passo de aceite do cliente
  -- separado do pagamento — aceitar = pagar). Tratamos como awaiting_payment
  -- igual ao caso 'quoted'.
  INSERT INTO bookings (
    booking_code, user_id, region_id, operator_id,
    service_type, service_id, booking_mode,
    status_commercial, status_operational,
    booking_date, service_date, service_time,
    people_count, luggage_count, special_notes,
    pickup_place_id, pickup_place_name,
    pickup_latitude, pickup_longitude,
    destination_place_id, destination_place_name,
    destination_latitude, destination_longitude,
    total_amount, payment_status, payment_model,
    source_channel,
    quoted_by_user_id, quoted_at, quote_notes,
    is_manual_quote,
    quote_expires_at,
    created_at
  )
  SELECT
    'GJ-MIG-' || LPAD(nextval('bookings_seq')::TEXT, 6, '0'),
    tq.user_id, tq.region_id, tq.quoted_by_user_id,
    'transfer',
    (SELECT t.id FROM transfers t WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote' LIMIT 1),
    'private',
    'awaiting_payment', 'new',
    tq.created_at::DATE, tq.service_date, tq.service_time,
    tq.people_count, tq.luggage_count, tq.special_notes,
    tq.origin_place_id, tq.origin_place_name,
    tq.origin_latitude, tq.origin_longitude,
    tq.destination_place_id, tq.destination_place_name,
    tq.destination_latitude, tq.destination_longitude,
    tq.quoted_price, 'pending', 'full',
    tq.source_channel,
    tq.quoted_by_user_id, tq.quoted_at, tq.quote_notes,
    TRUE,
    tq.created_at + (
      COALESCE((SELECT setting_value::INT FROM system_settings
                WHERE setting_key = 'quote_expiry_hours'), 2) || ' hours'
    )::INTERVAL,
    tq.created_at
  FROM transfer_quotes tq
  WHERE tq.status = 'accepted'
    AND tq.booking_id IS NULL
    AND EXISTS (SELECT 1 FROM transfers t WHERE t.region_id = tq.region_id AND t.pricing_mode = 'manual_quote');

  GET DIAGNOSTICS v_converted = ROW_COUNT;
  RAISE NOTICE 'Migração transfer_quotes → bookings: linhas afetadas no último INSERT = %', v_converted;
END $$;

COMMENT ON TABLE transfer_quotes IS
  'OBSOLETA como sistema de estados ativo a partir da migration 038. Mantida '
  'apenas como histórico/log de cotações pré-unificação. Nenhuma rota nova '
  'deve inserir ou atualizar esta tabela — o fluxo de translado personalizado '
  'agora vive inteiramente em bookings (is_manual_quote = TRUE).';

-- =============================================================================
-- 8. SCRIPT DE VERIFICAÇÃO
-- =============================================================================
-- Rodar manualmente após a migration para validar:

-- 8.1 Enum 'expired' presente (deve ter sido aplicado por 037 antes desta):
-- SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
--  WHERE pg_type.typname = 'status_commercial' ORDER BY pg_enum.enumsortorder;

-- 8.2 Novas colunas existem:
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'bookings'
--    AND column_name IN ('quoted_by_user_id','quoted_at','quote_expires_at',
--                         'luggage_count','quote_notes','is_manual_quote')
--  ORDER BY column_name;

-- 8.3 Nenhuma cotação ativa ficou sem booking equivalente:
-- SELECT tq.id, tq.status, tq.created_at
--   FROM transfer_quotes tq
--  WHERE tq.status IN ('pending_quote','quoted','accepted')
--    AND tq.booking_id IS NULL
--    AND NOT EXISTS (
--      SELECT 1 FROM bookings b
--       WHERE b.user_id = tq.user_id
--         AND b.is_manual_quote
--         AND b.service_date = tq.service_date
--         AND b.service_time = tq.service_time
--         AND b.created_at = tq.created_at
--    );
-- (espera-se 0 linhas)

-- 8.4 Contagem de bookings convertidos por status:
-- SELECT status_commercial, count(*) FROM bookings
--  WHERE is_manual_quote GROUP BY status_commercial ORDER BY 1;

-- 8.5 Nenhum booking de cotação manual com quote_expires_at no passado e
--     ainda em estado ativo (o job expire_pending_bookings() deveria pegar):
-- SELECT id, booking_code, status_commercial, quote_expires_at
--   FROM bookings
--  WHERE is_manual_quote
--    AND status_commercial IN ('awaiting_acceptance','awaiting_payment')
--    AND quote_expires_at < NOW();
-- (após rodar SELECT expire_pending_bookings(); espera-se 0 linhas)

-- 8.6 View nova retorna dados coerentes:
-- SELECT * FROM v_manual_quote_bookings ORDER BY created_at DESC LIMIT 20;
