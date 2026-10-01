-- =============================================================================
-- 107_parking_foundation.sql — Estacionamento (Fase 1: fundação)
-- =============================================================================
-- Terceira vertical da Turiva, em DOMÍNIO PRÓPRIO (sem mexer em bookings/enums
-- de passeio/translado). Esta fase cria só o esqueleto de dados: catálogo
-- (parking_lots + tarifas), reservas, bloqueios de capacidade e estadia.
-- As tabelas de retirada/PIN e auditoria vêm nas fases seguintes.
--
-- Regras de negócio (preço, comissão, prazos, tolerância) são CONFIGURÁVEIS por
-- lot/tarifa — nada de número mágico. Valores em NUMERIC(10,2) para casar com o
-- resto da plataforma; o cálculo definitivo é no servidor.
--
-- RLS habilitada e SEM policies: igual ao restante do projeto, só a API
-- (service role) acessa; o recorte por dono/estabelecimento é feito na API.
-- Idempotente (IF NOT EXISTS / DO $$ EXCEPTION).
-- =============================================================================

-- ── Catálogo: o estacionamento (parceiro dono + localização + capacidade) ─────
CREATE TABLE IF NOT EXISTS parking_lots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name           TEXT NOT NULL,
  description    TEXT,
  photos         JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_id      UUID REFERENCES regions(id) ON DELETE SET NULL,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  timezone       TEXT NOT NULL DEFAULT 'America/Fortaleza',
  opening_hours  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { seg:[['08:00','18:00']], ... }
  capacity       INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  -- Prazos (minutos) — defaults explícitos, configuráveis por lot.
  accept_deadline_min  INTEGER NOT NULL DEFAULT 1440,  -- 24h para o parceiro responder
  payment_deadline_min INTEGER NOT NULL DEFAULT 15,    -- 15min para pagar após aceite
  pin_ttl_min          INTEGER NOT NULL DEFAULT 5,     -- validade do PIN de retirada
  auth_ttl_min         INTEGER NOT NULL DEFAULT 10,    -- validade da autorização já validada
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_lots_owner  ON parking_lots (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_parking_lots_region ON parking_lots (region_id) WHERE is_active;

-- ── Tarifas: preço por tipo de veículo + política de diária (versionada) ──────
CREATE TABLE IF NOT EXISTS parking_tariffs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id         UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  vehicle_type   TEXT NOT NULL,                    -- 'carro', 'moto', 'suv'...
  price_per_unit NUMERIC(10,2) NOT NULL CHECK (price_per_unit >= 0),
  unit           TEXT NOT NULL DEFAULT 'daily',    -- unidade de cobrança
  hours_per_unit INTEGER NOT NULL DEFAULT 24 CHECK (hours_per_unit > 0),
  min_units      INTEGER NOT NULL DEFAULT 1 CHECK (min_units >= 1),
  version        INTEGER NOT NULL DEFAULT 1,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_tariffs_lot ON parking_tariffs (lot_id, vehicle_type) WHERE is_active;

-- ── Reserva/solicitação (ciclo próprio e independente) ────────────────────────
-- Estados separados de propósito (negócio x pagamento x ocupação) — nunca um só.
CREATE TABLE IF NOT EXISTS parking_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  lot_id          UUID NOT NULL REFERENCES parking_lots(id) ON DELETE RESTRICT,
  vehicle_type    TEXT NOT NULL,
  plate           TEXT,                            -- opcional na compra, confere na entrada
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  -- Fotografia da cotação/política no momento da criação (não muda com a tabela).
  units           INTEGER NOT NULL CHECK (units >= 1),
  unit_price      NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  total_amount    NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  commission_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Estado de NEGÓCIO: draft nunca é persistido aqui (fica no carrinho).
  status          TEXT NOT NULL DEFAULT 'awaiting_partner'
    CHECK (status IN ('awaiting_partner','rejected','expired_no_answer',
                      'accepted_awaiting_payment','expired_no_payment',
                      'confirmed','in_lot','withdrawal_requested',
                      'withdrawal_authorized','completed','cancelled')),
  -- Estado de PAGAMENTO, à parte do negócio.
  payment_status  TEXT NOT NULL DEFAULT 'none'
    CHECK (payment_status IN ('none','pending','paid','failed','refunded')),
  -- Rastreio de lote do carrinho (APENAS rastreio — não gera conjunto).
  batch_ref            TEXT,
  acceptance_expires_at TIMESTAMPTZ,
  payment_deadline_at   TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_parking_res_user ON parking_reservations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parking_res_lot  ON parking_reservations (lot_id, status);
CREATE INDEX IF NOT EXISTS idx_parking_res_window ON parking_reservations (lot_id, start_at, end_at);

-- ── Bloqueio de capacidade (hold temporário / confirmado / administrativo) ────
-- É isto que impede overbooking: cada reserva aceita/paga gera um bloqueio no
-- intervalo [start_at, end_at). Holds temporários expiram; cancelamento libera.
CREATE TABLE IF NOT EXISTS parking_capacity_blocks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id         UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES parking_reservations(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('temp_hold','confirmed','admin')),
  vehicle_type   TEXT,
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ NOT NULL,
  qty            INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','expired')),
  expires_at     TIMESTAMPTZ,                      -- só para temp_hold
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_parking_blocks_lot_window
  ON parking_capacity_blocks (lot_id, start_at, end_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_parking_blocks_res ON parking_capacity_blocks (reservation_id);

-- ── Estadia/ocupação física (entrada/saída reais; inclui balcão) ──────────────
CREATE TABLE IF NOT EXISTS parking_stays (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id         UUID NOT NULL REFERENCES parking_lots(id) ON DELETE RESTRICT,
  reservation_id UUID REFERENCES parking_reservations(id) ON DELETE SET NULL, -- null = balcão
  origin         TEXT NOT NULL DEFAULT 'turiva' CHECK (origin IN ('turiva','walkin')),
  plate          TEXT,
  spot           TEXT,                             -- vaga física (opcional)
  entered_at     TIMESTAMPTZ,
  exited_at      TIMESTAMPTZ,
  entered_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  exited_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parking_stays_lot ON parking_stays (lot_id) WHERE exited_at IS NULL;
-- Uma estadia aberta por reserva (não duplica ocupação na entrada repetida).
CREATE UNIQUE INDEX IF NOT EXISTS uq_parking_stay_open_per_res
  ON parking_stays (reservation_id) WHERE reservation_id IS NOT NULL AND exited_at IS NULL;

ALTER TABLE parking_lots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_tariffs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_reservations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_capacity_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_stays           ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT table_name FROM information_schema.tables
 WHERE table_name LIKE 'parking_%' ORDER BY table_name;
*/
