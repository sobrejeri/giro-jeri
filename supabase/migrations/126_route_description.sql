-- =============================================================================
-- GIRO JERI — Migration 126
-- Descrição individual por rota de translado
-- =============================================================================
-- Até aqui a descrição exibida no app vinha só da CATEGORIA
-- (transfers.short_description / full_description), compartilhada por todas as
-- rotas da categoria. Esta coluna dá um texto próprio por trecho — ex.: a rota
-- "Aeroporto → Jericoacoara" pode ter uma descrição diferente de "Fortaleza →
-- Jericoacoara", mesmo ambas sendo "Transfer Jericoacoara".
--
-- O app usa a descrição da ROTA quando ela existe e cai na da CATEGORIA quando
-- a rota não tem a sua. Enquanto esta migração não roda, a API grava a rota sem
-- a coluna (loop tolerante em catalog.js), então nada quebra.

ALTER TABLE transfer_routes
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN transfer_routes.description IS
  'Descrição própria da rota, exibida no app. Em branco, o app usa a descrição '
  'da categoria (transfers.full_description / short_description).';
