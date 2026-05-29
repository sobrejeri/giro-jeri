-- =============================================================================
-- GIRO JERI — Migration 010: adiciona CNPJ ao enum document_type
-- =============================================================================

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'cnpj';
