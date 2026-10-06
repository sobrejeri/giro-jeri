-- 120 — E-mail opcional para operador (login é pelo documento)
--
-- O operador entra pelo CNPJ/CPF; o e-mail de LOGIN é sintético/interno
-- (<documento>@op.girojeri.app, reconstruído pelo backend no login) e o e-mail
-- do PERFIL (users.email) pode ficar EM BRANCO até o próprio operador preencher
-- o real nos dados pessoais.
--
-- O CHECK antigo exigia email OU phone — um operador recém-criado (só com
-- documento, sem e-mail/telefone) quebrava o cadastro. Relaxa para aceitar
-- também quem tem document_number. Só AFROUXA a regra (nunca aperta), então
-- toda linha existente continua válida.
--
-- Aplicar manualmente no Supabase (SQL Editor). Idempotente.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_contact_check;
ALTER TABLE users ADD CONSTRAINT users_contact_check
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR document_number IS NOT NULL);
