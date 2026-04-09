-- =============================================================================
-- GIRO JERI — Schema completo v2
-- Baseado na especificação completa do sistema (seções 34–82)
-- Supabase / PostgreSQL
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- =============================================================================
-- TIPOS ENUMERADOS
-- =============================================================================

-- Perfis de usuário
CREATE TYPE user_type AS ENUM (
  'tourist', 'agency', 'operator', 'admin', 'finance', 'affiliate'
);

-- Tipos de veículo
CREATE TYPE vehicle_type AS ENUM (
  'buggy', 'quadricycle', 'jardineira', 'hilux_4x4', 'hilux_sw4',
  'utv_2', 'utv_4', 'van', 'boat', 'minibus', 'other'
);

-- Tipo de serviço na reserva
CREATE TYPE service_type AS ENUM ('tour', 'transfer');

-- Modo da reserva
CREATE TYPE booking_mode AS ENUM ('private', 'shared');

-- Status comercial da reserva
CREATE TYPE status_commercial AS ENUM (
  'draft', 'awaiting_payment', 'paid', 'payment_failed', 'cancelled', 'refunded'
);

-- Status operacional da reserva
CREATE TYPE status_operational AS ENUM (
  'new', 'awaiting_dispatch', 'confirmed', 'assigned',
  'en_route', 'in_progress', 'completed', 'occurrence', 'cancelled'
);

-- Canal de origem da reserva
CREATE TYPE source_channel AS ENUM (
  'app', 'web', 'whatsapp', 'agency_link', 'affiliate_link', 'admin_manual'
);

-- Modelo de pagamento
CREATE TYPE payment_model AS ENUM ('full', 'deposit', 'pre_auth', 'remaining_balance');

-- Método de pagamento
CREATE TYPE payment_method AS ENUM ('pix', 'credit_card', 'debit_card', 'manual_link');

-- Tipo de pagamento
CREATE TYPE payment_type AS ENUM ('full', 'deposit', 'pre_auth', 'remaining_balance');

-- Status do pagamento
CREATE TYPE payment_status AS ENUM (
  'pending', 'approved', 'failed', 'expired', 'refunded', 'partially_refunded'
);

-- Status de envio da notificação
CREATE TYPE send_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'opened');

-- Canal de notificação
CREATE TYPE notification_channel AS ENUM ('whatsapp', 'email', 'push', 'sms', 'internal');

-- Status do job de automação
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Status de despacho operacional
CREATE TYPE assignment_status AS ENUM (
  'pending', 'assigned', 'confirmed', 'in_service', 'completed', 'issue_reported'
);

-- Status financeiro
CREATE TYPE financial_status AS ENUM ('pending', 'scheduled', 'credited', 'paid', 'cancelled');

-- Direção do lançamento financeiro
CREATE TYPE ledger_direction AS ENUM ('inflow', 'outflow');

-- Status de repasse de comissão
CREATE TYPE payout_status AS ENUM ('pending', 'ready', 'paid', 'cancelled');

-- Tipo de preço (veículo/serviço)
CREATE TYPE pricing_mode AS ENUM ('per_vehicle', 'fixed', 'override');

-- Tipo de adicional (temporada/feriado)
CREATE TYPE additional_type AS ENUM ('percentage', 'fixed');

-- Aplica a (regras de temporada)
CREATE TYPE applies_to AS ENUM ('all', 'tours', 'transfers', 'selected_services');

-- Tipo de desconto de cupom
CREATE TYPE discount_type AS ENUM ('fixed', 'percentage');

-- Modo de precificação do transfer
CREATE TYPE transfer_pricing_mode AS ENUM (
  'fixed_route', 'by_vehicle', 'by_distance', 'manual_quote'
);

-- Tipo de ação no audit log
CREATE TYPE audit_action_type AS ENUM (
  'create', 'update', 'cancel', 'refund', 'status_change',
  'login', 'manual_override', 'delete'
);

-- Modelo de comissão
CREATE TYPE commission_model AS ENUM ('percentage', 'fixed', 'hybrid');

-- Tipo de role do operador
CREATE TYPE operator_role_type AS ENUM ('driver', 'guide', 'dispatcher', 'coordinator');

-- =============================================================================
-- FUNÇÃO AUXILIAR: updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Macro para criar trigger de updated_at
CREATE OR REPLACE FUNCTION create_updated_at_trigger(tbl TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s
     FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    tbl, tbl
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- FUNÇÃO: gerador de booking_code  (GJ-YYYY-NNNNNN)
-- =============================================================================

CREATE SEQUENCE bookings_seq START 1;

CREATE OR REPLACE FUNCTION generate_booking_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'GJ-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
         LPAD(nextval('bookings_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. USERS
-- Todos os usuários do sistema: turistas, operadores, admins, agências
-- =============================================================================

CREATE TABLE users (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  -- Vínculo com Supabase Auth (pode ser NULL para usuários criados manualmente)
  auth_id             UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name           VARCHAR(200) NOT NULL,
  email               VARCHAR(255) UNIQUE,
  phone               VARCHAR(30) UNIQUE,
  user_type           user_type NOT NULL DEFAULT 'tourist',
  profile_photo_url   TEXT,
  document_number     VARCHAR(30),
  birth_date          DATE,
  preferred_region_id UUID,  -- FK adicionada depois (REGIONS ainda não existe)
  language            VARCHAR(10) DEFAULT 'pt-BR',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

SELECT create_updated_at_trigger('users');

-- =============================================================================
-- 2. REGIONS
-- Regiões onde a plataforma opera
-- =============================================================================

CREATE TABLE regions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  slug              VARCHAR(100) NOT NULL UNIQUE,
  description       TEXT,
  cover_image_url   TEXT,
  city              VARCHAR(100),
  state             VARCHAR(50),
  country           VARCHAR(50) DEFAULT 'Brasil',
  timezone          VARCHAR(50) DEFAULT 'America/Fortaleza',
  currency          VARCHAR(10) DEFAULT 'BRL',
  center_latitude   DECIMAL(10, 7),
  center_longitude  DECIMAL(10, 7),
  service_radius_km DECIMAL(8, 2),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('regions');

-- Agora que REGIONS existe, adicionar FK em USERS
ALTER TABLE users
  ADD CONSTRAINT fk_users_preferred_region
  FOREIGN KEY (preferred_region_id) REFERENCES regions(id) ON DELETE SET NULL;

-- =============================================================================
-- 3. AGENCIES
-- Agências parceiras comerciais
-- =============================================================================

CREATE TABLE agencies (
  id                         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  region_id                  UUID REFERENCES regions(id) ON DELETE SET NULL,
  name                       VARCHAR(150) NOT NULL,
  slug                       VARCHAR(150) UNIQUE,
  legal_name                 VARCHAR(200),
  tax_document               VARCHAR(30),
  contact_phone              VARCHAR(30),
  contact_email              VARCHAR(255),
  logo_url                   TEXT,
  commission_default_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('agencies');

-- =============================================================================
-- 4. CATEGORIES
-- Categorias de passeios (aventura, lagoa, sunset, etc.)
-- =============================================================================

CREATE TABLE categories (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  icon          VARCHAR(100),
  color         VARCHAR(20),
  category_type VARCHAR(50),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('categories');

-- =============================================================================
-- 5. TOURS
-- Passeios disponíveis
-- =============================================================================

CREATE TABLE tours (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id               UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  category_id             UUID REFERENCES categories(id) ON DELETE SET NULL,
  name                    VARCHAR(200) NOT NULL,
  slug                    VARCHAR(200) NOT NULL UNIQUE,
  short_description       TEXT,
  full_description        TEXT,
  duration_hours          DECIMAL(5, 2),
  meeting_instructions    TEXT,
  includes_text           TEXT,
  excludes_text           TEXT,
  cancellation_policy_text TEXT,
  -- Modos disponíveis
  is_private_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  is_shared_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  shared_price_per_person DECIMAL(10, 2),  -- obrigatório se is_shared_enabled
  -- Capacidade
  min_people              INT DEFAULT 1,
  max_people              INT,
  -- Visuais
  cover_image_url         TEXT,
  gallery_urls            TEXT[],
  highlight_badge         VARCHAR(50),
  -- Destaque
  is_featured             BOOLEAN NOT NULL DEFAULT FALSE,
  tags                    TEXT[],
  difficulty_level        VARCHAR(30),
  -- Avaliação (desnormalizado para performance)
  rating_average          DECIMAL(3, 2) DEFAULT 0,
  rating_count            INT DEFAULT 0,
  -- Controle
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  display_order           INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tours_shared_price_check CHECK (
    is_shared_enabled = FALSE OR shared_price_per_person IS NOT NULL
  )
);

SELECT create_updated_at_trigger('tours');

-- =============================================================================
-- 6. TOUR_SCHEDULES
-- Horários padrão dos passeios
-- =============================================================================

CREATE TABLE tour_schedules (
  id                     UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tour_id                UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  region_id              UUID REFERENCES regions(id) ON DELETE SET NULL,
  schedule_name          VARCHAR(100) NOT NULL,
  departure_time         TIME NOT NULL,
  estimated_return_time  TIME,
  -- Dias da semana como array: [0=dom, 1=seg, ..., 6=sab]
  active_weekdays        INT[] DEFAULT '{0,1,2,3,4,5,6}',
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('tour_schedules');

-- =============================================================================
-- 7. TRANSFERS
-- Serviços de transfer (deslocamentos entre pontos)
-- =============================================================================

CREATE TABLE transfers (
  id                         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id                  UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name                       VARCHAR(200) NOT NULL,
  slug                       VARCHAR(200) NOT NULL UNIQUE,
  origin_label               VARCHAR(200),
  destination_label          VARCHAR(200),
  short_description          TEXT,
  full_description           TEXT,
  base_price                 DECIMAL(10, 2) NOT NULL DEFAULT 0,
  pricing_mode               transfer_pricing_mode NOT NULL DEFAULT 'fixed_route',
  baggage_rules_text         TEXT,
  cancellation_policy_text   TEXT,
  estimated_duration_minutes INT,
  is_private_only            BOOLEAN NOT NULL DEFAULT TRUE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  display_order              INT NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('transfers');

-- =============================================================================
-- 8. TRANSFER_ROUTES
-- Rotas específicas de transfer com preços individuais
-- =============================================================================

CREATE TABLE transfer_routes (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  transfer_id           UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  origin_name           VARCHAR(200) NOT NULL,
  destination_name      VARCHAR(200) NOT NULL,
  origin_latitude       DECIMAL(10, 7),
  origin_longitude      DECIMAL(10, 7),
  destination_latitude  DECIMAL(10, 7),
  destination_longitude DECIMAL(10, 7),
  default_price         DECIMAL(10, 2) NOT NULL,
  extra_stop_price      DECIMAL(10, 2) DEFAULT 0,
  night_fee             DECIMAL(10, 2) DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('transfer_routes');

-- =============================================================================
-- 9. VEHICLES
-- Veículos disponíveis para passeios e transfers
-- =============================================================================

CREATE TABLE vehicles (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id            UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name                 VARCHAR(150) NOT NULL,
  slug                 VARCHAR(150),
  vehicle_type         vehicle_type NOT NULL,
  category             VARCHAR(100),
  description          TEXT,
  seat_capacity        INT NOT NULL CHECK (seat_capacity > 0),
  luggage_capacity     INT DEFAULT 0,
  image_url            TEXT,
  -- Onde pode ser usado
  is_private_allowed   BOOLEAN NOT NULL DEFAULT TRUE,
  is_shared_allowed    BOOLEAN NOT NULL DEFAULT FALSE,
  is_transfer_allowed  BOOLEAN NOT NULL DEFAULT TRUE,
  is_tour_allowed      BOOLEAN NOT NULL DEFAULT TRUE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  display_order        INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('vehicles');

-- =============================================================================
-- 10. VEHICLE_PRICING_RULES
-- Preço do veículo por contexto (passeio específico, transfer, região)
-- CHAVE DO MOTOR DE PREÇOS PRIVATIVO
-- =============================================================================

CREATE TABLE vehicle_pricing_rules (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vehicle_id         UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  region_id          UUID REFERENCES regions(id) ON DELETE SET NULL,
  service_type       service_type NOT NULL,
  service_id         UUID,  -- tour_id ou transfer_id (sem FK para suportar ambos)
  pricing_mode       pricing_mode NOT NULL DEFAULT 'per_vehicle',
  base_price         DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
  high_season_price  DECIMAL(10, 2),  -- preço alternativo na alta temporada
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from         DATE,
  valid_until        DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('vehicle_pricing_rules');

-- =============================================================================
-- 11. HIGH_SEASON_RULES
-- Regras de alta temporada (ex: julho–janeiro +10%)
-- =============================================================================

CREATE TABLE high_season_rules (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id        UUID REFERENCES regions(id) ON DELETE CASCADE,
  name             VARCHAR(150) NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  additional_type  additional_type NOT NULL DEFAULT 'percentage',
  additional_value DECIMAL(7, 4) NOT NULL,  -- ex: 10.00 = 10%
  applies_to       applies_to NOT NULL DEFAULT 'all',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT high_season_dates_check CHECK (end_date >= start_date)
);

SELECT create_updated_at_trigger('high_season_rules');

-- =============================================================================
-- 12. HOLIDAYS
-- Feriados e datas especiais
-- =============================================================================

CREATE TABLE holidays (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id            UUID REFERENCES regions(id) ON DELETE SET NULL,
  name                 VARCHAR(150) NOT NULL,
  holiday_date         DATE NOT NULL,
  affects_pricing      BOOLEAN NOT NULL DEFAULT FALSE,
  additional_type      additional_type,
  additional_value     DECIMAL(7, 4),
  affects_availability BOOLEAN NOT NULL DEFAULT FALSE,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('holidays');

-- =============================================================================
-- 13. COUPONS
-- Cupons promocionais
-- =============================================================================

CREATE TABLE coupons (
  id                       UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code                     VARCHAR(50) NOT NULL UNIQUE,
  title                    VARCHAR(150) NOT NULL,
  description              TEXT,
  discount_type            discount_type NOT NULL DEFAULT 'percentage',
  discount_value           DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
  min_order_amount         DECIMAL(10, 2) DEFAULT 0,
  max_discount_amount      DECIMAL(10, 2),
  valid_from               TIMESTAMPTZ,
  valid_until              TIMESTAMPTZ,
  usage_limit_total        INT,
  usage_limit_per_user     INT DEFAULT 1,
  applicable_service_type  service_type,  -- NULL = ambos
  applicable_region_id     UUID REFERENCES regions(id) ON DELETE SET NULL,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('coupons');

-- =============================================================================
-- 14. COUPON_REDEMPTIONS
-- Registro de usos de cupom
-- =============================================================================

CREATE TABLE coupon_redemptions (
  id                     UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coupon_id              UUID NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id             UUID,  -- FK adicionada depois (BOOKINGS ainda não existe)
  discount_applied_amount DECIMAL(10, 2) NOT NULL,
  redeemed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 15. SERVICES_AVAILABILITY
-- Controle de disponibilidade por data/horário/serviço
-- =============================================================================

CREATE TABLE services_availability (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id         UUID REFERENCES regions(id) ON DELETE CASCADE,
  service_type      service_type NOT NULL,
  service_id        UUID NOT NULL,
  schedule_id       UUID REFERENCES tour_schedules(id) ON DELETE SET NULL,
  avail_date        DATE NOT NULL,
  avail_time        TIME,
  total_capacity    INT NOT NULL,
  used_capacity     INT NOT NULL DEFAULT 0,
  -- remaining_capacity é GERADO: total_capacity - used_capacity
  is_blocked        BOOLEAN NOT NULL DEFAULT FALSE,
  block_reason      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT avail_capacity_check CHECK (used_capacity <= total_capacity),
  UNIQUE (service_type, service_id, avail_date, avail_time)
);

SELECT create_updated_at_trigger('services_availability');

-- =============================================================================
-- 16. BOOKINGS
-- Tabela central das reservas
-- =============================================================================

CREATE TABLE bookings (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_code            VARCHAR(20) NOT NULL UNIQUE DEFAULT generate_booking_code(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  region_id               UUID NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  -- Serviço
  service_type            service_type NOT NULL,
  service_id              UUID NOT NULL,  -- tour_id ou transfer_id
  route_id                UUID REFERENCES transfer_routes(id) ON DELETE SET NULL,
  schedule_id             UUID REFERENCES tour_schedules(id) ON DELETE SET NULL,
  booking_mode            booking_mode NOT NULL,
  -- Status duplo: comercial e operacional
  status_commercial       status_commercial NOT NULL DEFAULT 'draft',
  status_operational      status_operational NOT NULL DEFAULT 'new',
  -- Datas
  booking_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  service_date            DATE NOT NULL,
  service_time            TIME NOT NULL,
  -- Pessoas e local
  people_count            INT NOT NULL CHECK (people_count > 0),
  origin_text             VARCHAR(300),
  destination_text        VARCHAR(300),
  pickup_address_text     VARCHAR(300),
  special_notes           TEXT,
  -- Financeiro — imutável após pagamento
  subtotal_amount         DECIMAL(10, 2) NOT NULL DEFAULT 0,
  season_additional_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount         DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount            DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_status          payment_status NOT NULL DEFAULT 'pending',
  payment_model           payment_model NOT NULL DEFAULT 'full',
  -- Origem e rastreabilidade
  source_channel          source_channel NOT NULL DEFAULT 'app',
  coupon_id               UUID REFERENCES coupons(id) ON DELETE SET NULL,
  agency_id               UUID REFERENCES agencies(id) ON DELETE SET NULL,
  affiliate_id            UUID,  -- FK para affiliates (tabela futura)
  -- Cancelamento e conclusão
  cancel_reason           TEXT,
  cancelled_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bookings_shared_mode_check CHECK (
    -- Compartilhado só pode existir em tours
    booking_mode != 'shared' OR service_type = 'tour'
  )
);

SELECT create_updated_at_trigger('bookings');

-- Agora adicionar FK do coupon_redemptions para bookings
ALTER TABLE coupon_redemptions
  ADD CONSTRAINT fk_coupon_redemptions_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- =============================================================================
-- 17. BOOKING_ITEMS
-- Item principal da reserva (snapshot histórico do serviço)
-- =============================================================================

CREATE TABLE booking_items (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id           UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_type         service_type NOT NULL,
  service_id           UUID NOT NULL,
  title_snapshot       VARCHAR(300) NOT NULL,
  description_snapshot TEXT,
  quantity             INT NOT NULL DEFAULT 1,
  unit_price           DECIMAL(10, 2) NOT NULL,
  total_price          DECIMAL(10, 2) NOT NULL,
  metadata_json        JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 18. BOOKING_VEHICLES
-- Veículos escolhidos na reserva privativa (snapshot histórico)
-- =============================================================================

CREATE TABLE booking_vehicles (
  id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  vehicle_id                UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  vehicle_name_snapshot     VARCHAR(200) NOT NULL,
  vehicle_capacity_snapshot INT NOT NULL,
  quantity                  INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price                DECIMAL(10, 2) NOT NULL,
  total_price               DECIMAL(10, 2) NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 19. PAYMENTS
-- Transações financeiras
-- =============================================================================

CREATE TABLE payments (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  gateway_name            VARCHAR(50),
  gateway_transaction_id  VARCHAR(200) UNIQUE,
  payment_method          payment_method,
  payment_type            payment_type NOT NULL DEFAULT 'full',
  amount_gross            DECIMAL(10, 2) NOT NULL,
  gateway_fee_amount      DECIMAL(10, 2) NOT NULL DEFAULT 0,
  amount_net              DECIMAL(10, 2) GENERATED ALWAYS AS
                            (amount_gross - gateway_fee_amount) STORED,
  currency                VARCHAR(10) DEFAULT 'BRL',
  status                  payment_status NOT NULL DEFAULT 'pending',
  paid_at                 TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  expected_credit_date    DATE,
  credited_at             TIMESTAMPTZ,
  receipt_url             TEXT,
  raw_response_json       JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('payments');

-- =============================================================================
-- 20. PAYMENT_EVENTS
-- Histórico detalhado de eventos do gateway (idempotência de webhook)
-- =============================================================================

CREATE TABLE payment_events (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  payment_id         UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_name         VARCHAR(100) NOT NULL,
  event_payload_json JSONB,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at       TIMESTAMPTZ,
  processing_status  VARCHAR(30) DEFAULT 'pending',
  -- Previne duplicatas: mesmo evento do mesmo pagamento
  UNIQUE (payment_id, event_name, received_at)
);

-- =============================================================================
-- 21. FINANCIAL_LEDGER
-- Livro-caixa: todas as entradas e saídas da plataforma
-- =============================================================================

CREATE TABLE financial_ledger (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id            UUID REFERENCES bookings(id) ON DELETE SET NULL,
  payment_id            UUID REFERENCES payments(id) ON DELETE SET NULL,
  region_id             UUID REFERENCES regions(id) ON DELETE SET NULL,
  agency_id             UUID REFERENCES agencies(id) ON DELETE SET NULL,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  entry_type            VARCHAR(50) NOT NULL,
  -- Valores: booking_gross, gateway_fee, booking_net, refund,
  --          commission_platform, commission_agency, payout_operator,
  --          manual_expense, manual_income
  category              VARCHAR(100),
  description           TEXT NOT NULL,
  amount                DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  direction             ledger_direction NOT NULL,
  financial_status      financial_status NOT NULL DEFAULT 'pending',
  due_date              DATE,
  expected_credit_date  DATE,
  effective_date        DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('financial_ledger');

-- =============================================================================
-- 22. COMMISSIONS
-- Comissões e repasses por reserva
-- =============================================================================

CREATE TABLE commissions (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  agency_id           UUID REFERENCES agencies(id) ON DELETE SET NULL,
  affiliate_id        UUID,
  commission_model    commission_model NOT NULL DEFAULT 'percentage',
  commission_percent  DECIMAL(5, 2) NOT NULL DEFAULT 0,
  commission_amount   DECIMAL(10, 2) NOT NULL DEFAULT 0,
  platform_amount     DECIMAL(10, 2) NOT NULL DEFAULT 0,
  operator_amount     DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payout_status       payout_status NOT NULL DEFAULT 'pending',
  payout_due_date     DATE,
  payout_paid_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('commissions');

-- =============================================================================
-- 23. OPERATIONAL_ASSIGNMENTS
-- Despacho e execução operacional
-- =============================================================================

CREATE TABLE operational_assignments (
  id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id                UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  assigned_operator_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_driver_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_guide_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  supplier_name             VARCHAR(200),
  real_vehicle_text         VARCHAR(200),
  dispatch_notes            TEXT,
  confirmation_notes        TEXT,
  started_at                TIMESTAMPTZ,
  boarded_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  assignment_status         assignment_status NOT NULL DEFAULT 'pending',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('operational_assignments');

-- =============================================================================
-- 24. NOTIFICATIONS
-- Registro de todas as notificações enviadas
-- =============================================================================

CREATE TABLE notifications (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  booking_id        UUID REFERENCES bookings(id) ON DELETE SET NULL,
  channel           notification_channel NOT NULL,
  template_key      VARCHAR(100),
  title             VARCHAR(300),
  message_body      TEXT NOT NULL,
  destination       VARCHAR(300),  -- e-mail, número de telefone, etc.
  send_status       send_status NOT NULL DEFAULT 'queued',
  scheduled_for     TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  provider_response JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('notifications');

-- =============================================================================
-- 25. AUTOMATION_JOBS
-- Fila de automações agendadas
-- =============================================================================

CREATE TABLE automation_jobs (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  related_entity_type  VARCHAR(100) NOT NULL,
  related_entity_id    UUID NOT NULL,
  job_type             VARCHAR(100) NOT NULL,
  -- job_type exemplos:
  --   booking_confirmation, pre_trip_reminder_24h, pre_trip_reminder_2h,
  --   post_trip_review_request, abandoned_cart_reminder
  payload_json         JSONB,
  run_at               TIMESTAMPTZ NOT NULL,
  job_status           job_status NOT NULL DEFAULT 'pending',
  attempts_count       INT NOT NULL DEFAULT 0,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('automation_jobs');

-- =============================================================================
-- 26. REVIEWS
-- Avaliações pós-serviço
-- =============================================================================

CREATE TABLE reviews (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id    UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  service_type  service_type NOT NULL,
  service_id    UUID NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment_text  TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id)  -- uma avaliação por reserva
);

SELECT create_updated_at_trigger('reviews');

-- =============================================================================
-- 27. AUDIT_LOGS
-- Registro de todas as ações críticas do sistema
-- =============================================================================

CREATE TABLE audit_logs (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type      VARCHAR(100) NOT NULL,
  entity_id        UUID,
  action_type      audit_action_type NOT NULL,
  old_values_json  JSONB,
  new_values_json  JSONB,
  ip_address       INET,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 28. SYSTEM_SETTINGS
-- Configurações globais da plataforma
-- =============================================================================

CREATE TABLE system_settings (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  setting_key           VARCHAR(100) NOT NULL UNIQUE,
  setting_value         TEXT,
  value_type            VARCHAR(20) DEFAULT 'string',
  -- 'string', 'number', 'boolean', 'json'
  description           TEXT,
  updated_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('system_settings');

-- =============================================================================
-- 29. BANNERS
-- Banners da home e campanhas
-- =============================================================================

CREATE TABLE banners (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  region_id   UUID REFERENCES regions(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  subtitle    VARCHAR(300),
  image_url   TEXT NOT NULL,
  cta_label   VARCHAR(100),
  cta_link    TEXT,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('banners');

-- =============================================================================
-- 30. USER_ADDRESSES
-- Endereços frequentes do usuário
-- =============================================================================

CREATE TABLE user_addresses (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label           VARCHAR(100) NOT NULL,
  address_line    TEXT NOT NULL,
  reference_point TEXT,
  neighborhood    VARCHAR(100),
  city            VARCHAR(100),
  state           VARCHAR(50),
  zip_code        VARCHAR(20),
  latitude        DECIMAL(10, 7),
  longitude       DECIMAL(10, 7),
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_updated_at_trigger('user_addresses');

-- =============================================================================
-- ÍNDICES — performance nas queries mais frequentes
-- =============================================================================

-- Users
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_phone       ON users(phone);
CREATE INDEX idx_users_user_type   ON users(user_type);
CREATE INDEX idx_users_is_active   ON users(is_active);

-- Regions
CREATE INDEX idx_regions_slug      ON regions(slug);
CREATE INDEX idx_regions_is_active ON regions(is_active);

-- Tours
CREATE INDEX idx_tours_region      ON tours(region_id, is_active);
CREATE INDEX idx_tours_slug        ON tours(slug);
CREATE INDEX idx_tours_is_featured ON tours(is_featured) WHERE is_featured = TRUE;

-- Transfers
CREATE INDEX idx_transfers_region  ON transfers(region_id, is_active);
CREATE INDEX idx_transfers_slug    ON transfers(slug);

-- Vehicles
CREATE INDEX idx_vehicles_region   ON vehicles(region_id, is_active);

-- Vehicle pricing
CREATE INDEX idx_vpr_vehicle       ON vehicle_pricing_rules(vehicle_id, service_type, is_active);
CREATE INDEX idx_vpr_service       ON vehicle_pricing_rules(service_id, service_type);

-- Availability
CREATE INDEX idx_avail_lookup      ON services_availability(service_type, service_id, avail_date);
CREATE INDEX idx_avail_date        ON services_availability(avail_date) WHERE is_blocked = FALSE;

-- Bookings — os mais consultados
CREATE UNIQUE INDEX idx_bookings_code        ON bookings(booking_code);
CREATE INDEX idx_bookings_user               ON bookings(user_id);
CREATE INDEX idx_bookings_service_date       ON bookings(service_date);
CREATE INDEX idx_bookings_status_commercial  ON bookings(status_commercial);
CREATE INDEX idx_bookings_status_operational ON bookings(status_operational);
CREATE INDEX idx_bookings_region             ON bookings(region_id);
CREATE INDEX idx_bookings_agency             ON bookings(agency_id) WHERE agency_id IS NOT NULL;
CREATE INDEX idx_bookings_service            ON bookings(service_type, service_id);

-- Payments
CREATE INDEX idx_payments_booking          ON payments(booking_id);
CREATE INDEX idx_payments_status           ON payments(status);
CREATE INDEX idx_payments_expected_credit  ON payments(expected_credit_date) WHERE credited_at IS NULL;
CREATE INDEX idx_payments_gateway_txn      ON payments(gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL;

-- Financial ledger
CREATE INDEX idx_ledger_booking         ON financial_ledger(booking_id);
CREATE INDEX idx_ledger_status          ON financial_ledger(financial_status);
CREATE INDEX idx_ledger_region          ON financial_ledger(region_id);
CREATE INDEX idx_ledger_agency          ON financial_ledger(agency_id) WHERE agency_id IS NOT NULL;
CREATE INDEX idx_ledger_effective_date  ON financial_ledger(effective_date);

-- Commissions
CREATE INDEX idx_commissions_booking ON commissions(booking_id);
CREATE INDEX idx_commissions_payout  ON commissions(payout_status);

-- Notifications
CREATE INDEX idx_notifications_user    ON notifications(user_id);
CREATE INDEX idx_notifications_booking ON notifications(booking_id);
CREATE INDEX idx_notifications_status  ON notifications(send_status, scheduled_for);

-- Automation jobs
CREATE INDEX idx_jobs_run_at ON automation_jobs(run_at, job_status);
CREATE INDEX idx_jobs_entity ON automation_jobs(related_entity_type, related_entity_id);

-- Coupons
CREATE UNIQUE INDEX idx_coupons_code ON coupons(code);

-- Audit
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user   ON audit_logs(user_id);
CREATE INDEX idx_audit_date   ON audit_logs(created_at);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_vehicles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions      ENABLE ROW LEVEL SECURITY;

-- Usuário vê e edita apenas seus próprios dados
CREATE POLICY "users_own_data" ON users
  FOR ALL USING (auth.uid()::text = auth_id::text);

CREATE POLICY "users_own_bookings" ON bookings
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "users_own_booking_items" ON booking_items
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "users_own_booking_vehicles" ON booking_vehicles
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "users_own_payments" ON payments
  FOR SELECT USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "users_own_notifications" ON notifications
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "users_own_reviews" ON reviews
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "users_own_addresses" ON user_addresses
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "users_own_redemptions" ON coupon_redemptions
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Tabelas públicas (leitura sem autenticação)
ALTER TABLE regions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tours             ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_schedules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_routes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_regions"        ON regions        FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_tours"          ON tours           FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_transfers"      ON transfers       FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_vehicles"       ON vehicles        FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_categories"     ON categories      FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_schedules"      ON tour_schedules  FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_routes"         ON transfer_routes FOR SELECT USING (is_active = TRUE);
CREATE POLICY "public_banners"        ON banners         FOR SELECT USING (is_active = TRUE);

-- =============================================================================
-- DADOS INICIAIS (seed)
-- =============================================================================

-- Região inicial: Jericoacoara
INSERT INTO regions (name, slug, description, city, state,
                     center_latitude, center_longitude, service_radius_km)
VALUES (
  'Jericoacoara', 'jericoacoara',
  'Vila de Jericoacoara — uma das praias mais bonitas do mundo',
  'Jijoca de Jericoacoara', 'Ceará',
  -2.7976, -40.5128, 50
);

-- Categorias iniciais
INSERT INTO categories (name, slug, category_type, sort_order) VALUES
  ('Aventura',      'aventura',      'tour',     1),
  ('Lagoa',         'lagoa',         'tour',     2),
  ('Sunset',        'sunset',        'tour',     3),
  ('Família',       'familia',       'tour',     4),
  ('Privativo',     'privativo',     'mode',     5),
  ('Compartilhado', 'compartilhado', 'mode',     6),
  ('Transfer',      'transfer',      'transfer', 7);

-- Configurações globais do sistema
INSERT INTO system_settings (setting_key, setting_value, value_type, description) VALUES
  ('default_currency',           'BRL',                     'string',  'Moeda padrão'),
  ('default_timezone',           'America/Fortaleza',       'string',  'Timezone padrão'),
  ('whatsapp_support_number',    '+5588999999999',          'string',  'Número do suporte WhatsApp'),
  ('cancellation_tour_hours',    '24',                      'number',  'Horas antes para cancelamento gratuito de passeio'),
  ('cancellation_transfer_days', '3',                       'number',  'Dias antes para cancelamento gratuito de transfer'),
  ('platform_fee_percent',       '7',                       'number',  'Taxa da plataforma (%)'),
  ('gateway_fee_percent',        '3.5',                     'number',  'Taxa estimada do gateway (%)'),
  ('max_people_per_booking',     '50',                      'number',  'Máximo de pessoas por reserva'),
  ('app_version',                '2.0.0',                   'string',  'Versão atual do app'),
  ('maintenance_mode',           'false',                   'boolean', 'Modo de manutenção');

-- Regra de alta temporada: julho a janeiro (+10%)
-- Nota: como cruza o ano (julho/2026 a janeiro/2027), criar uma regra por biênio
INSERT INTO high_season_rules
  (region_id, name, start_date, end_date, additional_type, additional_value, applies_to)
SELECT
  id,
  'Alta temporada 2025-2026',
  '2025-07-01',
  '2026-01-31',
  'percentage',
  10.00,
  'all'
FROM regions WHERE slug = 'jericoacoara';

INSERT INTO high_season_rules
  (region_id, name, start_date, end_date, additional_type, additional_value, applies_to)
SELECT
  id,
  'Alta temporada 2026-2027',
  '2026-07-01',
  '2027-01-31',
  'percentage',
  10.00,
  'all'
FROM regions WHERE slug = 'jericoacoara';

-- Veículos reais do Giro Jeri
WITH jeri AS (SELECT id FROM regions WHERE slug = 'jericoacoara')
INSERT INTO vehicles
  (region_id, name, vehicle_type, seat_capacity, is_private_allowed,
   is_shared_allowed, is_transfer_allowed, is_tour_allowed, display_order)
SELECT
  jeri.id, v.name, v.vtype::vehicle_type, v.cap,
  TRUE, FALSE, v.transfer_ok, TRUE, v.ord
FROM jeri, (VALUES
  ('Buggy',                  'buggy',        4,  TRUE,  1),
  ('Quadriciclo',            'quadricycle',  2,  FALSE, 2),
  ('Caminhonete Jardineira', 'jardineira',   12, TRUE,  3),
  ('Hilux 4x4',              'hilux_4x4',    4,  TRUE,  4),
  ('Hilux SW4',              'hilux_sw4',    7,  TRUE,  5),
  ('UTV 2 lugares',          'utv_2',        2,  FALSE, 6),
  ('UTV 4 lugares',          'utv_4',        4,  FALSE, 7)
) AS v(name, vtype, cap, transfer_ok, ord);

-- =============================================================================
-- FUNÇÃO: calcular se a data está em alta temporada
-- =============================================================================

CREATE OR REPLACE FUNCTION is_high_season(
  p_region_id UUID,
  p_date DATE
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM high_season_rules
    WHERE region_id = p_region_id
      AND is_active = TRUE
      AND p_date BETWEEN start_date AND end_date
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FUNÇÃO: calcular adicional de alta temporada para um valor
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_season_addition(
  p_region_id UUID,
  p_date DATE,
  p_subtotal DECIMAL(10,2)
) RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_rule high_season_rules%ROWTYPE;
BEGIN
  SELECT * INTO v_rule
  FROM high_season_rules
  WHERE region_id = p_region_id
    AND is_active = TRUE
    AND p_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_rule.additional_type = 'percentage' THEN
    RETURN ROUND(p_subtotal * (v_rule.additional_value / 100), 2);
  ELSE
    RETURN v_rule.additional_value;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- FUNÇÃO: validar capacidade de veículos na reserva privativa
-- Retorna TRUE se a combinação atende o número de pessoas
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_vehicle_capacity(
  p_booking_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_people_count INT;
  v_total_capacity INT;
BEGIN
  SELECT people_count INTO v_people_count
  FROM bookings WHERE id = p_booking_id;

  SELECT COALESCE(SUM(vehicle_capacity_snapshot * quantity), 0)
  INTO v_total_capacity
  FROM booking_vehicles
  WHERE booking_id = p_booking_id;

  RETURN v_total_capacity >= v_people_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGER: auditoria automática em bookings
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_booking_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status_commercial != NEW.status_commercial
       OR OLD.status_operational != NEW.status_operational
       OR OLD.total_amount != NEW.total_amount
    THEN
      INSERT INTO audit_logs
        (entity_type, entity_id, action_type, old_values_json, new_values_json)
      VALUES (
        'bookings',
        NEW.id,
        'status_change',
        jsonb_build_object(
          'status_commercial',  OLD.status_commercial,
          'status_operational', OLD.status_operational,
          'total_amount',       OLD.total_amount
        ),
        jsonb_build_object(
          'status_commercial',  NEW.status_commercial,
          'status_operational', NEW.status_operational,
          'total_amount',       NEW.total_amount
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_audit
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION audit_booking_changes();

-- =============================================================================
-- TRIGGER: atualizar used_capacity na disponibilidade
-- quando uma reserva compartilhada é confirmada
-- =============================================================================

CREATE OR REPLACE FUNCTION update_availability_on_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Ao confirmar pagamento de reserva compartilhada
  IF NEW.status_commercial = 'paid'
     AND OLD.status_commercial != 'paid'
     AND NEW.booking_mode = 'shared'
     AND NEW.schedule_id IS NOT NULL
  THEN
    UPDATE services_availability
    SET used_capacity = used_capacity + NEW.people_count
    WHERE service_type = NEW.service_type
      AND service_id = NEW.service_id
      AND avail_date = NEW.service_date
      AND schedule_id = NEW.schedule_id;
  END IF;

  -- Ao cancelar, liberar vagas
  IF NEW.status_commercial = 'cancelled'
     AND OLD.status_commercial = 'paid'
     AND NEW.booking_mode = 'shared'
     AND NEW.schedule_id IS NOT NULL
  THEN
    UPDATE services_availability
    SET used_capacity = GREATEST(0, used_capacity - NEW.people_count)
    WHERE service_type = NEW.service_type
      AND service_id = NEW.service_id
      AND avail_date = NEW.service_date
      AND schedule_id = NEW.schedule_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_availability
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_availability_on_booking();

-- =============================================================================
-- COMENTÁRIOS nas tabelas principais (documentação no banco)
-- =============================================================================

COMMENT ON TABLE bookings IS
  'Tabela central. booking_code = GJ-YYYY-NNNNNN. '
  'total_amount é imutável após pagamento. '
  'status_commercial e status_operational são campos separados.';

COMMENT ON TABLE booking_vehicles IS
  'Snapshot histórico dos veículos escolhidos. '
  'unit_price e vehicle_capacity_snapshot nunca mudam após criação.';

COMMENT ON TABLE financial_ledger IS
  'Livro-caixa. Cada entrada representa uma linha financeira. '
  'Bruto: booking_gross. Líquido: booking_net. '
  'Não creditado: pending + scheduled com expected_credit_date futura.';

COMMENT ON TABLE vehicle_pricing_rules IS
  'Motor de preços do privativo. '
  'service_id = NULL significa regra padrão para qualquer serviço daquele tipo.';

COMMENT ON TABLE high_season_rules IS
  'Regras de alta temporada. '
  'Julho a janeiro = +10%. '
  'Usar a função calculate_season_addition() no backend.';
