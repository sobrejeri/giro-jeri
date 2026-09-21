-- 095 — Origem da inscrição de push (qual PWA)
-- Distingue de qual app veio cada inscrição (turista, operador, admin) para
-- que avisos internos do admin cheguem SÓ no PWA do admin, e não no aparelho
-- do mesmo usuário logado em outro app.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS app TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subs_user_app
  ON push_subscriptions (user_id, app);
