-- =============================================================================
-- GIRO JERI — 039: novo status comercial "rejected"
--
-- Contexto: com a unificação do translado personalizado em `bookings`
-- (migration 038), o turista precisa poder RECUSAR o preço definido pela
-- cooperativa — uma ação distinta de cancelar a solicitação. Hoje
-- `status_commercial` não tem valor para isso; o único enum com 'rejected'
-- é `quote_status` (tabela `transfer_quotes`, em descontinuação como sistema
-- de estados ativo — ver migration 038).
--
-- Sem esse valor, o endpoint novo POST /api/bookings/:id/reject (Engenheiro
-- Senior) ficou preso usando 'cancelled' + prefixo de texto em cancel_reason
-- como workaround temporário. Esta migration formaliza o estado real:
--
--   awaiting_payment (precificado, aguardando turista)
--     → rejected   (turista recusou o preço — distinto de 'cancelled', que
--                    é usado quando a solicitação é abandonada antes/depois
--                    de precificada por desistência, não por discordância
--                    de preço)
--
-- O motivo da recusa continua sendo registrado em bookings.cancel_reason
-- (reaproveitado — ver migration 038), agora sem necessidade de prefixo
-- textual: o próprio status_commercial = 'rejected' já distingue o caso.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE deve rodar FORA de uma transação e o
-- novo valor não pode ser usado na MESMA migração. Rode este arquivo
-- isolado, antes de qualquer migration ou deploy de API que dependa do
-- valor 'rejected' em status_commercial.
-- =============================================================================

ALTER TYPE status_commercial ADD VALUE IF NOT EXISTS 'rejected' AFTER 'awaiting_payment';

-- =============================================================================
-- VERIFICAÇÃO (espera ver 'rejected' na lista de valores do enum)
-- =============================================================================
/*
SELECT enumlabel
  FROM pg_enum
  JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
 WHERE pg_type.typname = 'status_commercial'
 ORDER BY pg_enum.enumsortorder;
*/
