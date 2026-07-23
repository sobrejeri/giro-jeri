-- =============================================================
-- GIRO JERI — 038: flag de aviso ao admin quando solicitação expira
--
-- Toda vez que /api/operator/bookings é chamado, o servidor detecta
-- solicitações recém-expiradas (24h sem aceite) e dispara um WhatsApp
-- pro admin. Esta coluna marca quais já receberam o aviso, evitando
-- mandar várias vezes a mesma notificação.
-- =============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS admin_notified_expired_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_admin_notify_pending
  ON bookings (acceptance_expires_at)
  WHERE status_commercial = 'awaiting_acceptance'
    AND admin_notified_expired_at IS NULL;

COMMENT ON COLUMN bookings.admin_notified_expired_at IS
  'Quando o WhatsApp de aviso ao admin foi disparado (solicitação que '
  'ninguém aceitou em 24h). NULL = ainda não avisado.';
