-- =============================================================================
-- GIRO JERI — 035: novo status comercial "awaiting_acceptance"
--
-- Reformulação do fluxo de reserva (solicitar → aceitar → pagar):
--   Antes:  cliente paga  → cooperativa aceita
--   Agora:  cliente solicita → cooperativa aceita → cliente paga
--
-- O ciclo comercial passa a ser:
--   awaiting_acceptance  (solicitada, aguardando uma cooperativa aceitar)
--   → awaiting_payment   (cooperativa aceitou; aguardando pagamento do cliente)
--   → paid               (pago; cooperativa já atribuída segue para o despacho)
--
-- Como a cooperativa já está definida ANTES do pagamento, o split automático
-- (cada cooperativa recebe sua parte direto) passa a ser possível no checkout.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE deve rodar FORA de uma transação e o
-- novo valor não pode ser usado na MESMA migração. Rode este arquivo sozinho.
-- =============================================================================

ALTER TYPE status_commercial ADD VALUE IF NOT EXISTS 'awaiting_acceptance' BEFORE 'awaiting_payment';

-- =============================================================================
-- VERIFICAÇÃO (espera ver 'awaiting_acceptance' na lista de valores do enum)
-- =============================================================================
/*
SELECT enumlabel
  FROM pg_enum
  JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
 WHERE pg_type.typname = 'status_commercial'
 ORDER BY pg_enum.enumsortorder;
*/
