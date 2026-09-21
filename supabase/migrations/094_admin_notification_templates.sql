-- 094 — Avisos internos do admin (estilo Hotmart)
-- Modelos automáticos que avisam SÓ os admins: novo usuário cadastrado,
-- recebimento aprovado e pagamento recusado. Editáveis/desativáveis na aba
-- Notificações do admin, como os demais modelos (migração 092).

INSERT INTO notification_templates (key, enabled, title, body) VALUES
  ('admin_new_user', TRUE, 'Novo cadastro 👤',
   'Um novo usuário acabou de criar conta na Turiva.'),
  ('admin_payment_approved', TRUE, 'Recebimento aprovado 💰',
   'Um pagamento foi aprovado.'),
  ('admin_payment_rejected', TRUE, 'Pagamento recusado ⚠️',
   'Uma tentativa de pagamento foi recusada.')
ON CONFLICT (key) DO NOTHING;
