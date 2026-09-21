-- 097 — Snapshot do carrinho (lembrete de carrinho não finalizado)
-- O carrinho vive no aparelho (localStorage). Para lembrar o cliente de voltar
-- e SOLICITAR a reserva, o app manda um resumo leve do carrinho para cá. O
-- agendador usa isso para disparar um push quando o carrinho fica parado, sem
-- a solicitação ter sido feita.

CREATE TABLE IF NOT EXISTS cart_snapshots (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  item_count  INTEGER     NOT NULL DEFAULT 0,
  summary     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminded_at TIMESTAMPTZ
);

-- Modelo editável no admin (aba Notificações).
INSERT INTO notification_templates (key, enabled, title, body) VALUES
  ('cart_pending', TRUE, 'Você deixou itens no carrinho 🛒',
   'Volte e finalize sua solicitação em Jericoacoara — é rápido e sua reserva fica garantida!')
ON CONFLICT (key) DO NOTHING;

-- Acesso só pela API (service role ignora RLS).
ALTER TABLE cart_snapshots ENABLE ROW LEVEL SECURITY;
