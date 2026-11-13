-- =============================================================================
-- 131_reservas_externas.sql — vendas feitas FORA da plataforma
-- =============================================================================
-- O operador da equipe registra o que vendeu por fora (balcão, WhatsApp,
-- indicação) para a EMPRESA enxergar o desempenho completo da equipe — as
-- reservas da plataforma + as externas, lado a lado.
--
-- É só REGISTRO: nenhuma cobrança, comissão ou repasse nasce daqui. Por isso
-- fica numa tabela própria, longe de bookings/pagamentos.
--
-- company_id é a FOTO do vínculo no momento do registro (mesma regra dos
-- repasses): se o operador mudar de empresa, o que ele registrou antes continua
-- com a empresa da época.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.external_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  company_id          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  customer_name       varchar(200) NOT NULL,
  customer_phone      varchar(30),
  service_type        text NOT NULL DEFAULT 'tour',
  service_description varchar(300) NOT NULL,
  service_date        date NOT NULL,
  service_time        time,
  people_count        int NOT NULL DEFAULT 1,
  total_amount        numeric(10,2) NOT NULL DEFAULT 0,
  executor_name       varchar(200),
  notes               text,
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_bookings_tipo_chk   CHECK (service_type IN ('tour', 'transfer', 'other')),
  CONSTRAINT external_bookings_status_chk CHECK (status IN ('active', 'cancelled')),
  CONSTRAINT external_bookings_pessoas_chk CHECK (people_count > 0),
  CONSTRAINT external_bookings_valor_chk  CHECK (total_amount >= 0),
  CONSTRAINT external_bookings_cliente_chk CHECK (length(btrim(customer_name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_external_bookings_operador
  ON public.external_bookings (operator_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_external_bookings_empresa
  ON public.external_bookings (company_id, service_date DESC) WHERE company_id IS NOT NULL;

-- Só a API (service role) lê e escreve; nenhum acesso direto pelo app.
ALTER TABLE public.external_bookings ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
