-- =============================================================================
-- GIRO JERI — Migration 003: campos de perfil do turista
-- Adiciona document_type, nationality, emergency_contact e gender à tabela users
-- =============================================================================

-- Tipo do documento de identificação
CREATE TYPE document_type AS ENUM ('cpf', 'passport', 'rg', 'cnh', 'other');

-- Gênero (opcional, para personalização e grupos)
CREATE TYPE gender_type AS ENUM ('male', 'female', 'non_binary', 'prefer_not_to_say');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS document_type        document_type,
  ADD COLUMN IF NOT EXISTS nationality          VARCHAR(100) DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS emergency_contact_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS gender               gender_type;

-- Índice para busca por nacionalidade (relatórios e filtros admin)
CREATE INDEX IF NOT EXISTS idx_users_nationality ON users (nationality);

COMMENT ON COLUMN users.document_type             IS 'Tipo do documento: cpf, passport, rg, cnh ou other';
COMMENT ON COLUMN users.nationality               IS 'Código ISO 3166-1 alpha-2 do país de origem (ex: BR, US, FR)';
COMMENT ON COLUMN users.emergency_contact_name    IS 'Nome do contato de emergência do turista';
COMMENT ON COLUMN users.emergency_contact_phone   IS 'Telefone/WhatsApp do contato de emergência';
COMMENT ON COLUMN users.gender                    IS 'Gênero declarado (opcional)';
