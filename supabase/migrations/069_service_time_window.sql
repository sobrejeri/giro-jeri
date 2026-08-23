-- =============================================================================
-- 069_service_time_window.sql — Janela de horário de operação do serviço
-- =============================================================================
-- Hoje o cliente escolhe QUALQUER horário: dava para agendar um passeio de
-- buggy às 18:22, fora de qualquer horário de operação. As regras existentes
-- tratam de OUTRA coisa:
--   • booking_cutoff_time  → até que hora aceita PEDIDO para o mesmo dia
--   • min_advance_hours    → antecedência mínima entre o pedido e o serviço
-- Faltava a janela em que o serviço REALMENTE acontece (ex.: 06:00–12:00).
--
-- Nulo = sem restrição (comportamento atual preservado). As três regras se
-- combinam: o horário escolhido precisa estar dentro da janela E respeitar a
-- antecedência mínima E o cutoff do mesmo dia. Se a janela do dia já passou,
-- o app empurra para o dia seguinte.
-- =============================================================================

ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS service_window_start TIME,
  ADD COLUMN IF NOT EXISTS service_window_end   TIME;

-- Translados usam a mesma regra; a janela mora no serviço-pai (transfers),
-- igual ao booking_cutoff_time.
ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS service_window_start TIME,
  ADD COLUMN IF NOT EXISTS service_window_end   TIME;

COMMENT ON COLUMN tours.service_window_start IS
  'Primeiro horário em que o passeio pode ser agendado (ex.: 06:00). NULL = sem restrição.';
COMMENT ON COLUMN tours.service_window_end IS
  'Último horário em que o passeio pode ser agendado (ex.: 12:00). NULL = sem restrição.';
COMMENT ON COLUMN transfers.service_window_start IS
  'Primeiro horário em que o translado pode ser agendado. NULL = sem restrição.';
COMMENT ON COLUMN transfers.service_window_end IS
  'Último horário em que o translado pode ser agendado. NULL = sem restrição.';
