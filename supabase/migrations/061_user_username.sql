-- 061 — Login por nome de usuário (username)
-- Adiciona a coluna opcional `username` em users e um índice único
-- case-insensitive. Nullable: contas existentes seguem sem username até o
-- dono escolher um no perfil. O login por username resolve o e-mail da conta
-- e autentica normalmente (a senha continua sendo o segredo).

ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;

-- Unicidade case-insensitive, ignorando nulos (só quem definiu um username
-- ocupa o índice). Guardamos sempre em minúsculas na aplicação, mas o índice
-- funcional garante a regra mesmo se algum registro escapar.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON users (lower(username))
  WHERE username IS NOT NULL;
