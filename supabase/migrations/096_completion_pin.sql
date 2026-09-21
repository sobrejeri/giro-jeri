-- 096 — PIN de conclusão da corrida (trava de segurança)
-- Quando o operador INICIA a corrida, é gerado um PIN de 4 dígitos que só
-- aparece no app do CLIENTE. O cliente informa o PIN ao motorista, que repassa
-- ao operador. A corrida só é concluída (e o repasse do motorista só é
-- contabilizado) quando o PIN correto é informado — ou quando um admin força a
-- conclusão em caráter de exceção (fica registrado quem forçou).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS completion_pin           TEXT,
  ADD COLUMN IF NOT EXISTS completion_confirmed_via TEXT,  -- 'pin' | 'admin_override'
  ADD COLUMN IF NOT EXISTS completion_confirmed_by  UUID REFERENCES users(id) ON DELETE SET NULL;
