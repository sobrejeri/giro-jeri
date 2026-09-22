-- 100 — Chat por reserva (cliente ↔ operador)
-- Mensagens ligadas a uma reserva. Só o cliente dono, o operador da reserva e
-- o admin acessam (checado na API). Substitui a dependência do WhatsApp para a
-- conversa do serviço, centralizando o histórico.

CREATE TABLE IF NOT EXISTS booking_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_role    TEXT NOT NULL,            -- 'tourist' | 'operator' | 'admin'
  body           TEXT NOT NULL,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_messages_booking
  ON booking_messages (booking_id, created_at);

ALTER TABLE booking_messages ENABLE ROW LEVEL SECURITY;
