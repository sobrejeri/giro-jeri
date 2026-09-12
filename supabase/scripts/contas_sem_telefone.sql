-- ── Contas que NÃO conseguem recuperar a senha ─────────────────────────────
--
-- Só leitura. Não altera nada.
--
-- Hoje o único canal de recuperação é o WhatsApp. O cadastro exige telefone e
-- a conta só ativa com o código do WhatsApp, então toda conta criada pelo app
-- tem telefone. Mas podem existir cadastros antigos (anteriores a essa regra)
-- ou criados pelo admin sem telefone — e esses ficam sem NENHUM caminho de
-- recuperação enquanto o provedor de e-mail não estiver configurado.
--
-- Rode no SQL Editor do Supabase. Se vier zero, não há nada a fazer e a
-- configuração de e-mail pode esperar tranquilamente.

SELECT
  COUNT(*) FILTER (WHERE phone IS NULL OR btrim(phone) = '')                    AS sem_telefone,
  COUNT(*) FILTER (WHERE (phone IS NULL OR btrim(phone) = '')
                     AND email IS NOT NULL AND btrim(email) <> '')              AS sem_telefone_com_email,
  COUNT(*) FILTER (WHERE (phone IS NULL OR btrim(phone) = '')
                     AND (email IS NULL OR btrim(email) = ''))                  AS sem_telefone_e_sem_email,
  COUNT(*)                                                                       AS total_contas
FROM users
WHERE is_active = TRUE;


-- Quem são (para decidir caso a caso). Sem expor a senha, óbvio — ela nem
-- mora aqui; o Supabase Auth guarda o hash em auth.users.
SELECT id, full_name, email, user_type, created_at
FROM users
WHERE is_active = TRUE
  AND (phone IS NULL OR btrim(phone) = '')
ORDER BY created_at DESC
LIMIT 50;


-- Enquanto o e-mail não estiver ligado, o caminho para essas contas é:
--   1. o cliente informa um telefone (Perfil → editar), ou
--   2. o admin redefine a senha pelo painel do Supabase
--      (Authentication → Users → ... → Reset password / Send magic link).
