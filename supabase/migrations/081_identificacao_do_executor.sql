-- =============================================================================
-- 081_identificacao_do_executor.sql — Para quem o admin vai pagar
-- =============================================================================
-- Com a plataforma recebendo 100% (079) e repassando na mão (080), a tela de
-- repasses diz QUANTO e a QUEM — mas "a quem" era só um nome. Faltava o
-- essencial para fazer o PIX: documento e chave.
--
-- A cooperativa JÁ informa quem executa: `driver_name`, `driver_phone` e
-- `real_vehicle_text` são obrigatórios no despacho (migration 017). Então isto
-- não cria um cadastro paralelo — completa o que já existe com o que falta
-- para pagar. Uma tabela nova de "executores" divergiria do despacho, que é o
-- registro real de quem foi a campo.
--
-- `executed_confirmed_at` existe porque despacho e execução podem divergir: o
-- motorista escalado passa mal e vai outro. Quem conclui a corrida confirma (ou
-- corrige) quem de fato executou, e a data marca que aquilo foi conferido
-- depois do serviço — não é mais a intenção do despacho, é o que aconteceu.
--
-- CUIDADO — dado sensível: CPF/CNPJ e chave PIX de terceiros passam a morar
-- aqui. `operational_assignments` tem RLS habilitada e NENHUMA policy (053), ou
-- seja, é inacessível pelo PostgREST anônimo e só a API alcança, com service
-- role. Isso é proposital e não deve ser "consertado" adicionando policy de
-- leitura ampla: quem lê é a API, que já checa dono da reserva no
-- POST /operational/:id/assign e exige admin na tela de repasses.
-- =============================================================================

ALTER TABLE operational_assignments
  ADD COLUMN IF NOT EXISTS driver_document       VARCHAR(30),
  ADD COLUMN IF NOT EXISTS driver_pix_key        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS driver_pix_key_type   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS executed_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executed_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Mesmos tipos de `users.pix_key_type` (migration 009). NULL é permitido: o
-- despacho pode ser preenchido antes de a cooperativa ter a chave em mãos, e
-- travar o despacho por causa disso pararia a corrida.
DO $$
BEGIN
  ALTER TABLE operational_assignments
    ADD CONSTRAINT operational_assignments_pix_type_chk
    CHECK (driver_pix_key_type IS NULL
           OR driver_pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random_key'));
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- já existe: migration reexecutada
END $$;

-- Autocompletar o executor a partir dos despachos anteriores da MESMA
-- cooperativa. Redigitar uma chave PIX a cada corrida é onde o dinheiro vai
-- para a conta errada — a lista de quem já rodou antes evita isso.
CREATE INDEX IF NOT EXISTS operational_assignments_executor_idx
  ON operational_assignments (assigned_operator_user_id, driver_name)
  WHERE driver_name IS NOT NULL;

COMMENT ON COLUMN operational_assignments.driver_document IS
  'CPF/CNPJ de quem executou. Identificação para o repasse — o admin paga a '
  'uma pessoa, não a um nome solto.';
COMMENT ON COLUMN operational_assignments.driver_pix_key IS
  'Chave PIX de quem executou, para o repasse manual da plataforma (079/080). '
  'Dado sensível: só a API acessa (service role).';
COMMENT ON COLUMN operational_assignments.driver_pix_key_type IS
  'Tipo da chave: cpf, cnpj, email, phone, random_key. Mesmos valores de '
  'users.pix_key_type (migration 009).';
COMMENT ON COLUMN operational_assignments.executed_confirmed_at IS
  'Quando a cooperativa CONFIRMOU, ao concluir a corrida, quem de fato '
  'executou. NULL = os dados ainda são a intenção do despacho, não a '
  'confirmação do que aconteceu.';
COMMENT ON COLUMN operational_assignments.executed_confirmed_by IS
  'Usuário que confirmou o executor na conclusão.';

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
-- Repasses pendentes com o destino do dinheiro ao lado.
-- O DISTINCT ON existe porque nada impede duas linhas de despacho para a mesma
-- reserva (não há UNIQUE em booking_id) — sem ele o mesmo repasse apareceria
-- duplicado e o total conferido sairia dobrado.
SELECT b.booking_code,
       p.kind,
       p.amount,
       coalesce(u.full_name, '(sem destinatário)')          AS quem_recebe,
       coalesce(u.pix_key, '(sem chave cadastrada)')        AS pix_cadastrado,
       a.driver_name                                        AS executou,
       a.driver_pix_key                                     AS pix_do_executor,
       a.executed_confirmed_at IS NOT NULL                  AS confirmado
  FROM booking_payouts p
  JOIN bookings b   ON b.id = p.booking_id
  LEFT JOIN users u ON u.id = p.payee_user_id
  LEFT JOIN LATERAL (
    SELECT DISTINCT ON (x.booking_id) x.*
      FROM operational_assignments x
     WHERE x.booking_id = b.id
     ORDER BY x.booking_id, x.updated_at DESC
  ) a ON TRUE
 WHERE p.status = 'pending'
 ORDER BY b.service_date DESC;

-- Quem executou sem chave PIX informada (o admin não consegue pagar):
SELECT b.booking_code, b.service_date, a.driver_name, a.driver_phone
  FROM operational_assignments a
  JOIN bookings b ON b.id = a.booking_id
 WHERE a.driver_name IS NOT NULL AND coalesce(a.driver_pix_key, '') = ''
 ORDER BY b.service_date DESC LIMIT 50;
*/
