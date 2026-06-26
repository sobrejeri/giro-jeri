-- =============================================================================
-- GIRO JERI — 037: novo status comercial "expired"
--
-- Contexto: o fluxo de translado personalizado unificado em `bookings` (ver
-- migration 038) precisa que uma reserva "aguardando preço" ou "aguardando
-- pagamento" possa expirar automaticamente quando a janela de 2h (a partir da
-- SOLICITAÇÃO original) se esgota sem que a cooperativa precifique e o
-- turista pague.
--
-- `payments.js` (rota /api/payments/:id/status, linha ~618) já tentava setar
-- `status_commercial = 'expired'` para expiração de pagamento — esse valor
-- ainda não existia no enum, então essa atualização falharia silenciosamente
-- em produção. Esta migration corrige a lacuna e formaliza o valor para os
-- dois casos de expiração (preço não definido a tempo / pagamento não feito
-- a tempo).
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE deve rodar FORA de uma transação e o
-- novo valor não pode ser usado na MESMA migração. Rode este arquivo sozinho,
-- antes da migration 038.
-- =============================================================================

ALTER TYPE status_commercial ADD VALUE IF NOT EXISTS 'expired' AFTER 'awaiting_payment';

-- =============================================================================
-- VERIFICAÇÃO (espera ver 'expired' na lista de valores do enum)
-- =============================================================================
/*
SELECT enumlabel
  FROM pg_enum
  JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
 WHERE pg_type.typname = 'status_commercial'
 ORDER BY pg_enum.enumsortorder;
*/
