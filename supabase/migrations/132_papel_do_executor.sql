-- =============================================================================
-- 132_papel_do_executor.sql — quem executa: motorista, guia ou piloto
-- =============================================================================
-- O despacho tratava todo executor como "motorista" e exigia placa de veículo.
-- Num passeio com GUIA não há placa; num voo de HELICÓPTERO o cliente lia
-- "Motorista" e "Placa". Guardar o papel deixa o despacho, a Ordem de Serviço,
-- o aviso ao cliente e os repasses falarem a língua certa.
--
-- Tudo o que já existe continua 'driver'. A API funciona sem esta migração
-- (trata todo mundo como motorista, como hoje). Idempotente.
-- =============================================================================

ALTER TABLE public.operational_assignments
  ADD COLUMN IF NOT EXISTS executor_role text NOT NULL DEFAULT 'driver';

DO $$
BEGIN
  ALTER TABLE public.operational_assignments
    ADD CONSTRAINT operational_assignments_executor_role_chk
    CHECK (executor_role IN ('driver', 'guide', 'pilot'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.operational_assignments.executor_role IS
  'driver = motorista (veículo com placa) · guide = guia (sem veículo) · pilot = piloto/tripulação (aeronave).';

NOTIFY pgrst, 'reload schema';
