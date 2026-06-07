-- Adiciona campos de endereço e CEP ao perfil do operador/cooperativa
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS cep     VARCHAR(9);
