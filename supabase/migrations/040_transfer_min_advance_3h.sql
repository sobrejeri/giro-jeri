-- 040 — Antecedência mínima de agendamento de transfers = 3h
-- Aplica a mesma regra do translado personalizado ao translado de rota
-- definida: só é possível agendar a partir de 3h do horário atual (bloqueia
-- agendamento imediato/"ao vivo"). A validação usa o setting abaixo, agora
-- compartilhado por ambos os fluxos.

UPDATE system_settings
   SET setting_value = '3'
 WHERE setting_key = 'transfer_min_advance_hours';

INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
SELECT 'transfer_min_advance_hours', '3', 'number', 'Antecedencia minima transfer (horas)'
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings WHERE setting_key = 'transfer_min_advance_hours'
);
