-- 092 — Notificações personalizadas/automáticas
-- Modelos editáveis no admin (boas-vindas, aniversário, carrinho) + log de
-- envios para não repetir (aniversário 1x/ano, lembrete 1x/reserva).

CREATE TABLE IF NOT EXISTS notification_templates (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  title       TEXT        NOT NULL DEFAULT 'Turiva',
  body        TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO notification_templates (key, enabled, title, body) VALUES
  ('welcome', TRUE, 'Bem-vindo(a) à Turiva! 🌴',
   'Sua conta está pronta. Explore passeios e transfers em Jericoacoara e viva momentos inesquecíveis.'),
  ('birthday', TRUE, 'Feliz aniversário! 🎉',
   'A Turiva deseja um dia incrível! Que tal comemorar com um passeio em Jeri?'),
  ('cart_reminder', TRUE, 'Sua reserva está esperando 🛒',
   'Você tem uma reserva aguardando pagamento. Conclua antes que a vaga seja liberada!')
ON CONFLICT (key) DO NOTHING;

-- Dedupe de envios automáticos: (usuário, tipo, referência).
--   birthday      → ref = ano (ex.: "2026")
--   cart_reminder → ref = booking_id
CREATE TABLE IF NOT EXISTS notification_sends (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  ref      TEXT NOT NULL,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);

-- Acesso só pela API (service role, que ignora RLS). RLS ligada sem policies
-- fecha para anon/authenticated diretos.
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_sends     ENABLE ROW LEVEL SECURITY;
