-- =============================================================================
-- 048_leg_service_anchored_autocancel.sql
-- =============================================================================
-- Cancelamento automático do motor de pernas ANCORADO NO HORÁRIO DO PASSEIO
-- (não em timer a partir do 1º aceite). Regras de negócio confirmadas:
--
--   • Prazo de pagamento do cliente = service_datetime − 15min. Ele pode esperar
--     o combo fechar e pagar até 15 min antes do passeio.
--   • Ninguém aceitou nenhuma perna → cancela em service_datetime − 20min
--     (5 min antes), pra não deixar o cliente pendurado até o último minuto.
--
-- Esta função faz a varredura em SQL (joins fáceis) e devolve as reservas
-- canceladas para a API notificar o cliente. Chamada de forma LAZY pela
-- `sweepExpiredLegBookings()` (legFlow.js), que só a invoca com a flag
-- booking_legs_engine_enabled ligada.
--
-- Segurança/inércia: só toca reservas que TÊM pernas (EXISTS booking_legs).
-- Com a flag off nenhuma perna é criada, então a função é inerte em produção.
-- SECURITY DEFINER para agir mesmo se chamada de contexto com RLS.
-- Idempotente: CREATE OR REPLACE; só age em reservas ainda pendentes/não pagas.
-- =============================================================================

CREATE OR REPLACE FUNCTION cancel_overdue_leg_bookings()
RETURNS TABLE (id UUID, user_id UUID, booking_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH overdue AS (
    SELECT b.id, b.user_id, b.booking_code
    FROM bookings b
    WHERE b.status_commercial IN ('awaiting_acceptance', 'awaiting_payment')
      AND b.payment_status <> 'approved'
      AND b.service_datetime IS NOT NULL
      -- só pedidos do motor de pernas
      AND EXISTS (SELECT 1 FROM booking_legs l WHERE l.booking_id = b.id)
      AND (
        -- não pago e passou de 15 min antes do passeio
        NOW() >= b.service_datetime - INTERVAL '15 minutes'
        -- OU ninguém aceitou nenhuma perna e passou de 20 min antes (5 min antes)
        OR (
          NOW() >= b.service_datetime - INTERVAL '20 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM booking_legs l2
            WHERE l2.booking_id = b.id AND l2.status_leg = 'accepted'
          )
        )
      )
  ),
  legs_cancelled AS (
    UPDATE booking_legs l
    SET status_leg = 'cancelled', updated_at = NOW()
    WHERE l.booking_id IN (SELECT o.id FROM overdue o)
      AND l.status_leg IN ('awaiting_acceptance', 'accepted')
    RETURNING l.booking_id
  ),
  bookings_cancelled AS (
    UPDATE bookings b
    SET status_commercial  = 'cancelled',
        status_operational = 'cancelled',
        updated_at         = NOW()
    WHERE b.id IN (SELECT o.id FROM overdue o)
    RETURNING b.id, b.user_id, b.booking_code
  )
  SELECT bc.id, bc.user_id, bc.booking_code FROM bookings_cancelled bc;
END;
$$;

-- ── Verificação (manual) ─────────────────────────────────────────────────────
--   -- Deve devolver reservas com pernas, não pagas, passadas de service−15min
--   -- (ou não-aceitas passadas de service−20min), já cancelando reserva+pernas.
--   SELECT * FROM cancel_overdue_leg_bookings();
--   -- Sem dados do motor (flag off) → 0 linhas, nada muda.
