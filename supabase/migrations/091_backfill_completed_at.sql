-- =============================================================================
-- 091 — Backfill de bookings.completed_at (fila de repasses por conclusão)
-- =============================================================================
-- A coluna bookings.completed_at já existe (001) e passou a ser gravada na
-- transição para 'completed' (routes/operator.js, routes/bookings.js). Reservas
-- concluídas ANTES dessa gravação ficaram com completed_at NULL.
--
-- Backfill com a HORA REAL da conclusão: o trigger audit_booking_changes gravou
-- em audit_logs cada mudança de status_operational, com created_at. Usamos o
-- PRIMEIRO registro em que o status virou 'completed' — timestamp de verdade,
-- não estimado.
--
-- Reservas 'completed' SEM esse registro de auditoria permanecem NULL de
-- PROPÓSITO: a tela de Repasses as trata como "conciliação" (fora da fila de
-- liberação ordenada), em vez de inventar uma data.

UPDATE bookings b
   SET completed_at = sub.ts
  FROM (
    SELECT entity_id, MIN(created_at) AS ts
      FROM audit_logs
     WHERE entity_type = 'bookings'
       AND action_type = 'status_change'
       AND new_values_json->>'status_operational' = 'completed'
     GROUP BY entity_id
  ) sub
 WHERE b.id = sub.entity_id
   AND b.status_operational = 'completed'
   AND b.completed_at IS NULL;

-- Índice para a fila de liberação: ordena por completed_at ASC (mais antigas
-- primeiro). Parcial — só as concluídas entram na fila.
CREATE INDEX IF NOT EXISTS idx_bookings_completed_at
    ON bookings (completed_at)
 WHERE completed_at IS NOT NULL;
