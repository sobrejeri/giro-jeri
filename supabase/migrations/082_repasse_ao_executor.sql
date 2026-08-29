-- =============================================================================
-- 082_repasse_ao_executor.sql — O admin também paga quem executou
-- =============================================================================
-- Decisão do dono: a plataforma recebe 100% e paga NA MÃO cooperativa/operador
-- E executor. Até aqui só dava para pagar quem tinha cadastro na plataforma —
-- `booking_payouts.payee_user_id` é FK para `users`, e o motorista que a
-- cooperativa manda a campo não é usuário do sistema.
--
-- Estas colunas são o destino do dinheiro para quem NÃO tem cadastro. São um
-- INSTANTÂNEO de propósito, copiado do despacho no momento em que o repasse é
-- criado: se o motorista trocar de chave PIX depois, o que já foi lançado (e
-- talvez pago) não pode mudar sozinho debaixo do admin.
--
-- `payee_user_id` continua valendo e tem precedência quando existe — é o caso
-- da comissão da cooperativa e do executor fixo do aéreo, que são usuários.
--
-- ATENÇÃO — isto NÃO muda sozinho para onde vai o dinheiro de ninguém. A linha
-- de execução só passa a ser gerada em modais que tenham
-- `acceptor_commission_pct > 0` configurado. Enquanto o percentual for zero, o
-- comportamento é o de hoje: quem aceitou recebe tudo menos a parte da
-- plataforma. Ver `calcularRepasses` em services/payouts.js.
-- =============================================================================

ALTER TABLE booking_payouts
  ADD COLUMN IF NOT EXISTS payee_name         VARCHAR(200),
  ADD COLUMN IF NOT EXISTS payee_document     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS payee_pix_key      VARCHAR(200),
  ADD COLUMN IF NOT EXISTS payee_pix_key_type VARCHAR(20);

-- Mesmos tipos de `users.pix_key_type` (009) e do despacho (081).
DO $$
BEGIN
  ALTER TABLE booking_payouts ADD CONSTRAINT booking_payouts_pix_type_chk
    CHECK (payee_pix_key_type IS NULL
           OR payee_pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random_key'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Um repasse precisa ter destino: ou um usuário da plataforma, ou um nome
-- avulso. Sem isto dava para gravar uma linha "a pagar" sem dizer a quem — o
-- admin veria o valor e não teria como quitá-lo.
DO $$
BEGIN
  ALTER TABLE booking_payouts ADD CONSTRAINT booking_payouts_tem_destino_chk
    CHECK (payee_user_id IS NOT NULL OR coalesce(btrim(payee_name), '') <> '');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  -- Se já houver linha órfã de antes, não trava a migration: o admin resolve
  -- pela tela. Barrar a subida do schema por um dado velho seria pior.
  WHEN check_violation THEN
    RAISE NOTICE 'Há repasses sem destino; constraint não aplicada. '
                 'Confira: SELECT id, booking_id, kind, amount FROM booking_payouts '
                 'WHERE payee_user_id IS NULL AND coalesce(btrim(payee_name), '''') = '''';';
END $$;

-- A tela agrupa por destinatário para fazer UM PIX cobrindo várias reservas.
-- Sem cadastro o agrupamento é pelo nome.
CREATE INDEX IF NOT EXISTS idx_booking_payouts_payee_name
  ON booking_payouts (payee_name, status)
  WHERE payee_user_id IS NULL;

COMMENT ON COLUMN booking_payouts.payee_name IS
  'Nome de quem recebe quando NÃO tem cadastro na plataforma (motorista que a '
  'cooperativa mandou a campo). Instantâneo do despacho — não acompanha '
  'alterações posteriores.';
COMMENT ON COLUMN booking_payouts.payee_pix_key IS
  'Chave PIX de destino, copiada no momento do lançamento. Dado sensível: só a '
  'API acessa (service role) e a policy de operador filtra por payee_user_id.';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Tudo que o admin deve, com o destino ao lado (cadastrados e avulsos):
SELECT p.kind,
       coalesce(u.full_name, p.payee_name, '(sem destino)') AS quem_recebe,
       CASE WHEN p.payee_user_id IS NOT NULL THEN 'cadastrado' ELSE 'avulso' END AS tipo,
       coalesce(u.pix_key, p.payee_pix_key, '(sem chave)')  AS chave_pix,
       count(*) AS reservas, sum(p.amount) AS total
  FROM booking_payouts p
  LEFT JOIN users u ON u.id = p.payee_user_id
 WHERE p.status = 'pending'
 GROUP BY 1, 2, 3, 4
 ORDER BY 6 DESC;

-- Modais que já dividem com o executor (comissão de aceite > 0) e os que ainda
-- seguem no modelo antigo:
SELECT name,
       acceptor_commission_pct AS pct_aceite,
       platform_commission_pct AS pct_plataforma,
       CASE WHEN coalesce(acceptor_commission_pct, 0) > 0
            THEN 'divide com o executor'
            ELSE 'quem aceita recebe tudo menos a plataforma' END AS modelo
  FROM service_modals ORDER BY sort_order;
*/
