-- =============================================================================
-- GIRO JERI — 042: MOTOR DE PERNAS / pedido dividido (PROPOSTA DE DESENHO)
--
-- >>> Este arquivo é uma PROPOSTA do DBA para discussão com Arquiteto/PO/Tech
-- >>> Lead. NÃO é o deploy final da Etapa 2. Antes de aplicar em produção:
-- >>>   1) o motor de pagamento (Pay-after-all + split por coop via Mercado
-- >>>      Pago marketplace, migration 036) precisa confirmar que consegue
-- >>>      liquidar N contas de coop diferentes a partir de UM pagamento do
-- >>>      pedido (ver "Riscos/Objeções" na resposta do DBA);
-- >>>   2) o Engenheiro Senior precisa ter os endpoints de aceite/cancelamento
-- >>>      por perna prontos antes de ligar `booking_legs_engine_enabled`.
--
-- Conceito: reserva = PEDIDO (bookings, já existe). Cada veículo = PERNA nova
-- (`booking_legs`), roteável a UMA cooperativa. Tudo-ou-nada no pedido
-- (pay-after-all), split por perna. 1 veículo = 1 perna, inclusive N=1.
--
-- Perna expira em service_datetime − 15min (ancorado no passeio, não em
-- relógio fixo de 24h como em `bookings.acceptance_expires_at`, migration
-- 037 — aquele campo continua existindo e serve para o fluxo ANTIGO/pedidos
-- sem legs; o prazo por perna é um conceito novo e independente).
-- =============================================================================


-- =============================================================================
-- 0. system_settings — chave de liga/desliga do motor (rollout seguro)
-- =============================================================================
-- Enquanto 'false', a criação de booking_legs a partir de booking_vehicles
-- fica inerte (trigger no item 3 verifica esta flag). Isso permite aplicar
-- esta migration em produção SEM mudar o comportamento visível do app até
-- que o Engenheiro Senior tenha os endpoints de aceite/cancelamento por
-- perna prontos nas 3 SPAs.
INSERT INTO system_settings (setting_key, setting_value, value_type, description)
VALUES (
  'booking_legs_engine_enabled', 'false', 'boolean',
  'Liga a geração automática de booking_legs a partir de booking_vehicles '
  '(motor de pernas / pedido dividido). Manter false até o fluxo de aceite '
  'e pagamento por perna estar pronto nas SPAs cooperativa/admin.'
)
ON CONFLICT (setting_key) DO NOTHING;


-- =============================================================================
-- 1. ENUM status_leg
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_leg') THEN
    CREATE TYPE status_leg AS ENUM (
      'awaiting_acceptance', 'accepted', 'expired', 'cancelled'
    );
  END IF;
END;
$$;


-- =============================================================================
-- 2. bookings.service_datetime — coluna materializada (DATE + TIME)
-- =============================================================================
-- `service_date`/`service_time` já existem e são "hora local ingênua" (sem
-- timezone), tal como todo o restante do schema (ver 001). Materializar a
-- combinação como GENERATED evita repetir `service_date + service_time` em
-- toda query/trigger, e permite indexar/ordenar sem função. O cutoff de
-- cada perna (service_datetime − 15min) é congelado em
-- `booking_legs.acceptance_expires_at` no momento da criação da perna (ver
-- item 4) — não é recalculado em toda leitura — porque índice parcial sobre
-- expressão com NOW() não é imutável, e a fila de expiração (item 6) precisa
-- de um valor estável e indexável.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS service_datetime TIMESTAMP
    GENERATED ALWAYS AS (service_date + service_time) STORED;

CREATE INDEX IF NOT EXISTS idx_bookings_service_datetime
  ON bookings(service_datetime);

COMMENT ON COLUMN bookings.service_datetime IS
  'service_date + service_time materializado (hora local ingênua, sem tz — '
  'mesma convenção do restante do schema). Base para o cutoff das pernas '
  '(booking_legs.acceptance_expires_at = service_datetime - 15min).';


-- =============================================================================
-- 3. TABELA booking_legs
-- =============================================================================
CREATE TABLE IF NOT EXISTS booking_legs (
  id                        UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id                UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_vehicle_id        UUID        REFERENCES booking_vehicles(id) ON DELETE SET NULL,
  leg_number                INT,        -- auto-preenchido pelo trigger (item 4) se NULL
  -- Veículo (snapshot imutável, mesmo padrão de booking_vehicles)
  vehicle_id                UUID        NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vehicle_name_snapshot     VARCHAR(200) NOT NULL,
  vehicle_type_snapshot     vehicle_type NOT NULL,
  vehicle_capacity_snapshot INT         NOT NULL CHECK (vehicle_capacity_snapshot > 0),
  -- Pax e preço DESTA perna
  pax_count                 INT         NOT NULL CHECK (pax_count > 0),
  leg_price                 DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (leg_price >= 0),
  -- Roteamento
  operator_id               UUID        REFERENCES users(id) ON DELETE SET NULL,
  status_leg                status_leg  NOT NULL DEFAULT 'awaiting_acceptance',
  acceptance_expires_at     TIMESTAMPTZ NOT NULL,  -- preenchido pelo trigger se NULL (item 4)
  admin_notified_at         TIMESTAMPTZ,           -- espelha bookings.admin_notified_expired_at (038)
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_legs_accepted_has_operator CHECK (
    status_leg != 'accepted' OR operator_id IS NOT NULL
  ),
  UNIQUE (booking_id, leg_number)
);

SELECT create_updated_at_trigger('booking_legs');

COMMENT ON TABLE booking_legs IS
  'Motor de pernas: cada linha = 1 veículo do pedido, roteável a UMA '
  'cooperativa. 1 veículo = 1 perna (inclusive pedidos com N=1). Coexiste '
  'com booking_vehicles (snapshot comercial/preço já existente); '
  'booking_legs é a camada de despacho/aceite por cooperativa. Pay-after-all: '
  'bookings só avança para awaiting_payment/paid quando '
  'booking_all_legs_accepted(booking_id) = TRUE (ver trigger '
  'enforce_pay_after_all_legs).';

COMMENT ON COLUMN booking_legs.acceptance_expires_at IS
  'service_datetime do pedido menos 15 minutos, ancorado no passeio (NÃO um '
  'relógio fixo de 24h como bookings.acceptance_expires_at). Congelado na '
  'criação da perna; recalculado apenas se o pedido for reagendado (trigger '
  'reschedule_booking_legs) enquanto a perna ainda estiver awaiting_acceptance.';

COMMENT ON COLUMN booking_legs.status_leg IS
  'awaiting_acceptance: na fila, visível a coops compatíveis + admin. '
  'accepted: fechada por operator_id. '
  'expired: cutoff passou sem aceite (job de varredura externo flip este '
  'status; ver índice idx_booking_legs_expiry_sweep). '
  'cancelled: pedido inteiro cancelado (cascata) — NÃO é o estado usado '
  'quando uma coop desiste depois de aceitar (nesse caso a perna VOLTA para '
  'awaiting_acceptance com operator_id NULL; realocação é manual pelo admin).';


-- =============================================================================
-- 4. Trigger: auto-preencher leg_number e acceptance_expires_at no INSERT
-- =============================================================================
CREATE OR REPLACE FUNCTION booking_legs_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_service_datetime TIMESTAMP;
BEGIN
  IF NEW.leg_number IS NULL THEN
    SELECT COALESCE(MAX(leg_number), 0) + 1 INTO NEW.leg_number
    FROM booking_legs WHERE booking_id = NEW.booking_id;
  END IF;

  IF NEW.acceptance_expires_at IS NULL THEN
    SELECT service_datetime INTO v_service_datetime
    FROM bookings WHERE id = NEW.booking_id;

    NEW.acceptance_expires_at := v_service_datetime - INTERVAL '15 minutes';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_legs_before_insert ON booking_legs;
CREATE TRIGGER trg_booking_legs_before_insert
  BEFORE INSERT ON booking_legs
  FOR EACH ROW EXECUTE FUNCTION booking_legs_before_insert();

-- Trigger: se o pedido for reagendado, propaga o novo cutoff para as pernas
-- que ainda estão na fila (pernas já aceitas/expiradas/canceladas não mudam
-- retroativamente — reagendar um pedido já fechado é decisão operacional
-- manual do admin, fora do escopo deste trigger).
CREATE OR REPLACE FUNCTION reschedule_booking_legs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.service_datetime IS DISTINCT FROM OLD.service_datetime THEN
    UPDATE booking_legs
       SET acceptance_expires_at = NEW.service_datetime - INTERVAL '15 minutes'
     WHERE booking_id = NEW.id
       AND status_leg = 'awaiting_acceptance';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_reschedule_legs ON bookings;
CREATE TRIGGER trg_bookings_reschedule_legs
  AFTER UPDATE OF service_date, service_time ON bookings
  FOR EACH ROW EXECUTE FUNCTION reschedule_booking_legs();


-- =============================================================================
-- 5. Trigger: geração automática de pernas a partir de booking_vehicles
-- =============================================================================
-- Resolve o item "coexistência" sem exigir que o Engenheiro Senior altere o
-- fluxo de checkout: toda vez que o checkout grava uma linha em
-- booking_vehicles (como já faz hoje), este trigger cria `quantity` pernas
-- (1 veículo = 1 perna). Fica inerte enquanto
-- system_settings.booking_legs_engine_enabled = 'false' (item 0).
--
-- pax_count aqui é um DEFAULT NAIVE (capacidade do veículo, limitado ao total
-- de pessoas do pedido) — é só um placeholder para não violar o CHECK
-- (pax_count > 0). O Engenheiro Senior deve fazer o checkout informar a
-- distribuição real de pax por veículo com um UPDATE logo após o insert
-- (ou expor um parâmetro pax_breakdown na rota de criação da reserva).
CREATE OR REPLACE FUNCTION spawn_booking_legs_from_vehicle()
RETURNS TRIGGER AS $$
DECLARE
  v_enabled  BOOLEAN;
  v_people   INT;
  v_vtype    vehicle_type;
  i          INT;
BEGIN
  SELECT (setting_value = 'true') INTO v_enabled
  FROM system_settings WHERE setting_key = 'booking_legs_engine_enabled';

  IF NOT COALESCE(v_enabled, FALSE) THEN
    RETURN NEW;
  END IF;

  SELECT people_count INTO v_people FROM bookings WHERE id = NEW.booking_id;
  SELECT vehicle_type INTO v_vtype FROM vehicles WHERE id = NEW.vehicle_id;

  FOR i IN 1..NEW.quantity LOOP
    INSERT INTO booking_legs (
      booking_id, booking_vehicle_id, vehicle_id,
      vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot,
      pax_count, leg_price, status_leg
    ) VALUES (
      NEW.booking_id, NEW.id, NEW.vehicle_id,
      NEW.vehicle_name_snapshot, v_vtype, NEW.vehicle_capacity_snapshot,
      LEAST(NEW.vehicle_capacity_snapshot, GREATEST(1, COALESCE(v_people, 1))),
      NEW.unit_price, 'awaiting_acceptance'
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_vehicles_spawn_legs ON booking_vehicles;
CREATE TRIGGER trg_booking_vehicles_spawn_legs
  AFTER INSERT ON booking_vehicles
  FOR EACH ROW EXECUTE FUNCTION spawn_booking_legs_from_vehicle();

COMMENT ON FUNCTION spawn_booking_legs_from_vehicle IS
  'Cria 1 booking_legs por unidade de booking_vehicles.quantity. Inerte '
  'enquanto system_settings.booking_legs_engine_enabled = false. pax_count '
  'é um placeholder (capacidade do veículo limitada ao total de pessoas do '
  'pedido) — o Engenheiro Senior deve corrigir com a distribuição real logo '
  'após o insert, quando o checkout tiver essa informação.';


-- =============================================================================
-- 6. Pay-after-all: trava a nível de banco (defesa em profundidade)
-- =============================================================================
-- Só bloqueia pedidos que TÊM pernas (booking_legs.booking_id existe) — não
-- afeta em nada os pedidos legados sem pernas (compartilhado/cotação/manual,
-- ou pedidos antigos migrados sem backfill). A trava principal é da API;
-- isto aqui é a rede de segurança contra bug de aplicação.
CREATE OR REPLACE FUNCTION booking_all_legs_accepted(p_booking_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM booking_legs WHERE booking_id = p_booking_id)
     AND NOT EXISTS (
       SELECT 1 FROM booking_legs
       WHERE booking_id = p_booking_id AND status_leg <> 'accepted'
     );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION enforce_pay_after_all_legs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_commercial IN ('awaiting_payment', 'paid')
     AND OLD.status_commercial NOT IN ('awaiting_payment', 'paid')
     AND EXISTS (SELECT 1 FROM booking_legs WHERE booking_id = NEW.id)
     AND NOT booking_all_legs_accepted(NEW.id)
  THEN
    RAISE EXCEPTION
      'booking % tem perna(s) não aceita(s); não pode avançar para %',
      NEW.id, NEW.status_commercial;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_pay_after_all_legs ON bookings;
CREATE TRIGGER trg_bookings_pay_after_all_legs
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_pay_after_all_legs();


-- =============================================================================
-- 7. Contabilidade por perna: leg_id em financial_ledger/commissions
-- =============================================================================
-- Objeção do PO: sem leg_id, a auditoria de repasse por cooperativa se perde
-- assim que um pedido tem mais de uma coop envolvida. Mudança mínima e
-- aditiva: leg_id NULLABLE (lançamentos de nível-pedido como booking_gross/
-- gateway_fee/booking_net continuam com leg_id NULL — o dinheiro entra uma
-- vez só, por pedido, no modelo pay-after-all); lançamentos de repasse
-- (commission_platform, payout_operator) por cooperativa passam a carregar
-- leg_id quando o pedido tiver pernas.
ALTER TABLE financial_ledger
  ADD COLUMN IF NOT EXISTS leg_id UUID REFERENCES booking_legs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_leg
  ON financial_ledger(leg_id) WHERE leg_id IS NOT NULL;

COMMENT ON COLUMN financial_ledger.leg_id IS
  'Preenchido apenas em lançamentos de repasse por cooperativa '
  '(commission_platform, payout_operator) quando o pedido tem pernas. '
  'Lançamentos de nível-pedido (booking_gross/gateway_fee/booking_net) '
  'ficam com leg_id NULL — o pagamento do cliente continua sendo UM só '
  'por pedido (pay-after-all).';

-- commissions hoje é 1 linha por booking_id. Com pernas, um pedido com N
-- cooperativas diferentes precisa de N linhas (uma por perna/operador) —
-- leg_id NULLABLE preserva 100% das linhas antigas (leg_id = NULL = modelo
-- legado 1 pedido/1 coop). operator_id é um snapshot explícito do
-- pagador-final da perna: evita depender de bookings.operator_id (que é
-- ambíguo/legado quando o pedido tem múltiplas pernas com operadores
-- diferentes) e mantém o repasse rastreável mesmo se a perna for
-- reatribuída depois (coop cancela → volta pra fila → outra coop aceita).
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS leg_id      UUID REFERENCES booking_legs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commissions_leg
  ON commissions(leg_id) WHERE leg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_operator
  ON commissions(operator_id) WHERE operator_id IS NOT NULL;

COMMENT ON COLUMN commissions.leg_id IS
  'NULL = modelo legado (1 linha por booking_id, pedido sem pernas). '
  'Preenchido = repasse referente a UMA perna/cooperativa específica dentro '
  'de um pedido dividido.';
COMMENT ON COLUMN commissions.operator_id IS
  'Snapshot da cooperativa pagadora desta linha de comissão. Não depender de '
  'bookings.operator_id quando o pedido tiver pernas (ele é ambíguo/legado '
  'nesse caso — cada perna pode ter uma cooperativa diferente).';


-- =============================================================================
-- 8. Índices — feed por perna (roteável + prazo) e varredura de expiração
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_booking_legs_booking ON booking_legs(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_legs_status  ON booking_legs(status_leg);

CREATE INDEX IF NOT EXISTS idx_booking_legs_operator
  ON booking_legs(operator_id) WHERE operator_id IS NOT NULL;

-- Feed da cooperativa: pernas pendentes por veículo, ordenáveis pelo prazo.
-- Casa com operator_service_preferences(operator_id, entity_type='vehicle',
-- is_active) do mesmo jeito que 041 fez para booking_vehicles.
CREATE INDEX IF NOT EXISTS idx_booking_legs_feed_routable
  ON booking_legs(vehicle_id, acceptance_expires_at)
  WHERE status_leg = 'awaiting_acceptance';

-- Job de varredura (cron): pernas pendentes cujo cutoff já passou, para
-- flipar status_leg -> 'expired' (equivalente ao que 037/038 fazem hoje em
-- bookings, mas ancorado no passeio em vez de criado_em + 24h fixas).
CREATE INDEX IF NOT EXISTS idx_booking_legs_expiry_sweep
  ON booking_legs(acceptance_expires_at)
  WHERE status_leg = 'awaiting_acceptance';

-- Aviso ao admin (mesmo padrão de 038): pernas pendentes ainda não avisadas.
CREATE INDEX IF NOT EXISTS idx_booking_legs_admin_notify_pending
  ON booking_legs(acceptance_expires_at)
  WHERE status_leg = 'awaiting_acceptance' AND admin_notified_at IS NULL;


-- =============================================================================
-- 9. RLS em booking_legs
-- =============================================================================
ALTER TABLE booking_legs ENABLE ROW LEVEL SECURITY;

-- Cliente: enxerga (somente leitura) as pernas do PRÓPRIO pedido.
DROP POLICY IF EXISTS "booking_legs_client_select" ON booking_legs;
CREATE POLICY "booking_legs_client_select" ON booking_legs
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

-- Admin: acesso total (SELECT/INSERT/UPDATE/DELETE) — fecha qualquer perna,
-- reatribui manualmente, corrige dados.
DROP POLICY IF EXISTS "booking_legs_admin_all" ON booking_legs;
CREATE POLICY "booking_legs_admin_all" ON booking_legs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND user_type = 'admin')
  );

-- Cooperativa — leitura: pernas já atribuídas a ela OU pendentes e
-- compatíveis com seus veículos ativos (Model B opt-out, mesmo padrão de
-- 006/041). Sem registro em operator_service_preferences = não vê pendentes
-- (opt-in, coerente com o comentário original de 006 — aqui NÃO se aplica o
-- fail-open de 041, porque toda perna tem vehicle_id obrigatório; o
-- fail-open de 041 tratava pedidos SEM NENHUMA linha em booking_vehicles,
-- caso que não existe em booking_legs).
DROP POLICY IF EXISTS "booking_legs_operator_select" ON booking_legs;
CREATE POLICY "booking_legs_operator_select" ON booking_legs
  FOR SELECT USING (
    operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    OR (
      status_leg = 'awaiting_acceptance'
      AND vehicle_id IN (
        SELECT entity_id FROM operator_service_preferences
        WHERE entity_type = 'vehicle'
          AND is_active = TRUE
          AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

-- Cooperativa — aceite: só pode mover uma perna PENDENTE, DENTRO do prazo e
-- roteável ao seu próprio veículo, para 'accepted' assumindo o operator_id
-- dela mesma. Modelado para o dia em que a rota usar req.supabase (JWT do
-- usuário) em vez de service_role — hoje a API deve fazer isso via
-- service_role com um UPDATE condicional atômico
-- (WHERE status_leg='awaiting_acceptance') para garantir "primeiro a
-- aceitar vence" mesmo com 2 coops tentando ao mesmo tempo.
DROP POLICY IF EXISTS "booking_legs_operator_accept" ON booking_legs;
CREATE POLICY "booking_legs_operator_accept" ON booking_legs
  FOR UPDATE USING (
    status_leg = 'awaiting_acceptance'
    AND acceptance_expires_at > NOW()
    AND vehicle_id IN (
      SELECT entity_id FROM operator_service_preferences
      WHERE entity_type = 'vehicle'
        AND is_active = TRUE
        AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    status_leg = 'accepted'
    AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Cooperativa — cancelamento pós-aceite: só a própria coop dona da perna
-- aceita pode devolvê-la à fila (status volta a awaiting_acceptance,
-- operator_id volta a NULL). Realocação subsequente é manual do admin —
-- não existe policy que permita a uma coop "roubar" perna de outra.
DROP POLICY IF EXISTS "booking_legs_operator_cancel" ON booking_legs;
CREATE POLICY "booking_legs_operator_cancel" ON booking_legs
  FOR UPDATE USING (
    status_leg = 'accepted'
    AND operator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    status_leg = 'awaiting_acceptance'
    AND operator_id IS NULL
  );

-- Nota de modelagem (ver "Riscos/Objeções" da resposta do DBA): policies de
-- RLS são por LINHA, não por COLUNA — uma cooperativa que satisfaça a
-- USING de uma policy de UPDATE poderia, em tese, escrever qualquer coluna
-- da linha (inclusive leg_price/vehicle_id) desde que ALGUMA policy de
-- UPDATE aplicável tenha WITH CHECK satisfeito pela linha nova. Isso já é
-- uma limitação aceita no restante do schema (ver 041). A garantia real de
-- que só status_leg/operator_id mudam no aceite/cancelamento deve vir da
-- API (que hoje escreve com service_role e por isso já bypassa RLS).


-- =============================================================================
-- 10. Backfill — pedidos ATUAIS em aberto (sem cobrar 2x, sem tocar legado)
-- =============================================================================
-- Decisão: back-fill SOMENTE para pedidos ainda NÃO pagos
-- (status_commercial IN ('awaiting_acceptance','awaiting_payment')). Pedidos
-- já 'paid'/'completed'/'cancelled' NÃO recebem pernas retroativas — o
-- dinheiro desses pedidos já foi resolvido pelo fluxo antigo (1 coop via
-- bookings.operator_id) e criar pernas ali não agrega auditoria, só risco de
-- o trigger enforce_pay_after_all_legs travar uma atualização futura de um
-- pedido histórico por engano. Pedidos compartilhado/cotação/manual não têm
-- booking_vehicles e por isso não geram pernas (comportamento correto:
-- continuam fora do motor de pernas).
--
-- pax_count aqui usa distribuição uniforme com resto distribuído nas
-- primeiras pernas (aproximação; é só para os pedidos que JÁ estavam em
-- aberto no momento desta migration — pedidos novos, criados depois de
-- 'booking_legs_engine_enabled' = true, usam o trigger do item 5, cujo
-- pax_count também é um placeholder a ser refinado pelo Engenheiro Senior).
WITH expand AS (
  SELECT
    bv.id                    AS booking_vehicle_id,
    bv.booking_id,
    bv.vehicle_id,
    bv.vehicle_name_snapshot,
    bv.vehicle_capacity_snapshot,
    bv.unit_price,
    v.vehicle_type,
    b.people_count,
    gs.n                     AS instance_no
  FROM booking_vehicles bv
  JOIN bookings b ON b.id = bv.booking_id
  JOIN vehicles v ON v.id = bv.vehicle_id
  CROSS JOIN LATERAL generate_series(1, bv.quantity) AS gs(n)
  WHERE b.status_commercial IN ('awaiting_acceptance', 'awaiting_payment')
    AND NOT EXISTS (SELECT 1 FROM booking_legs bl WHERE bl.booking_id = b.id)
),
numbered AS (
  SELECT
    expand.*,
    ROW_NUMBER() OVER (PARTITION BY booking_id ORDER BY booking_vehicle_id, instance_no) AS leg_no,
    COUNT(*)     OVER (PARTITION BY booking_id) AS total_legs
  FROM expand
)
INSERT INTO booking_legs (
  booking_id, booking_vehicle_id, leg_number, vehicle_id,
  vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot,
  pax_count, leg_price, status_leg
)
SELECT
  booking_id, booking_vehicle_id, leg_no, vehicle_id,
  vehicle_name_snapshot, vehicle_type, vehicle_capacity_snapshot,
  GREATEST(
    1,
    (people_count / total_legs)
      + CASE WHEN leg_no <= (people_count % total_legs) THEN 1 ELSE 0 END
  ),
  unit_price,
  'awaiting_acceptance'
FROM numbered;


-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================

-- 10.1 Resumo imediato (roda como parte da migration, só leitura):
SELECT
  (SELECT COUNT(*) FROM booking_legs)                                           AS total_pernas,
  (SELECT COUNT(DISTINCT booking_id) FROM booking_legs)                        AS pedidos_com_pernas,
  (SELECT COUNT(*) FROM booking_legs WHERE status_leg = 'awaiting_acceptance') AS pernas_na_fila,
  (SELECT COUNT(*) FROM pg_type WHERE typname = 'status_leg')                  AS enum_status_leg_existe,
  (SELECT setting_value FROM system_settings
     WHERE setting_key = 'booking_legs_engine_enabled')                        AS motor_ligado;

-- 10.2 Checagens manuais adicionais (rodar após aplicar, ajustando o uuid):
/*
-- (a) Índices criados:
SELECT indexname, tablename FROM pg_indexes
 WHERE tablename IN ('booking_legs', 'financial_ledger', 'commissions', 'bookings')
   AND (indexname LIKE '%leg%' OR indexname = 'idx_bookings_service_datetime')
 ORDER BY tablename, indexname;

-- (b) RLS habilitado + 5 policies:
SELECT relrowsecurity FROM pg_class WHERE relname = 'booking_legs';  -- espera: t
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'booking_legs' ORDER BY policyname;
-- espera: booking_legs_admin_all (ALL), booking_legs_client_select (SELECT),
--         booking_legs_operator_accept (UPDATE), booking_legs_operator_cancel (UPDATE),
--         booking_legs_operator_select (SELECT)

-- (c) Cutoff correto (deve bater com service_datetime - 15min):
SELECT bl.id, bl.acceptance_expires_at, b.service_datetime,
       b.service_datetime - INTERVAL '15 minutes' AS esperado
FROM booking_legs bl JOIN bookings b ON b.id = bl.booking_id
LIMIT 20;

-- (d) Pay-after-all: tentar mover um pedido com pernas pendentes para
--     'awaiting_payment' deve estourar exceção (rode em transação e faça
--     ROLLBACK depois de conferir):
-- BEGIN;
--   UPDATE bookings SET status_commercial = 'awaiting_payment'
--   WHERE id = (SELECT booking_id FROM booking_legs
--               WHERE status_leg = 'awaiting_acceptance' LIMIT 1);
-- ROLLBACK;

-- (e) Plano de execução usa o índice do feed:
EXPLAIN SELECT id FROM booking_legs
 WHERE status_leg = 'awaiting_acceptance'
   AND vehicle_id = '00000000-0000-0000-0000-000000000000';
-- espera: Index Scan/Bitmap using idx_booking_legs_feed_routable
*/
