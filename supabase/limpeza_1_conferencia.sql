-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPEZA — PARTE 1 de 2: CONFERÊNCIA
--
-- SÓ LÊ. Não apaga, não altera, não cria nada. Rode este primeiro e confira os
-- números; a parte 2 é que executa.
--
-- Mostra exatamente quem sai e o que vai junto. O catálogo (passeios, rotas,
-- veículos, preços), os feriados, as temporadas e as regiões NÃO entram na
-- limpeza — nem aqui nem na parte 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Quem será apagado ────────────────────────────────────────────────────
-- Todo usuário que NÃO é admin. Confira se a lista bate com o que você espera:
-- se aparecer alguém que deve ficar, PARE e me avise antes de rodar a parte 2.
SELECT 'VAI SER APAGADO' AS atencao,
       full_name, user_type,
       coalesce(email, document_number, phone, '—') AS identificacao,
       is_active,
       created_at::date AS cadastro
  FROM users
 WHERE user_type <> 'admin'
 ORDER BY user_type, full_name;

-- ── 2. Quem FICA ────────────────────────────────────────────────────────────
SELECT 'PERMANECE' AS ok, full_name, user_type,
       coalesce(email, document_number, '—') AS identificacao
  FROM users
 WHERE user_type = 'admin'
 ORDER BY full_name;

-- ── 3. O que vai junto ──────────────────────────────────────────────────────
-- Reservas dos usuários alvo, como cliente OU como operador, e tudo que está
-- pendurado nelas.
WITH alvo AS (
  SELECT id FROM users WHERE user_type <> 'admin'
),
reservas AS (
  SELECT id FROM bookings
   WHERE user_id IN (SELECT id FROM alvo) OR operator_id IN (SELECT id FROM alvo)
)
SELECT 'reservas'                AS registro, count(*) AS quantidade FROM reservas
UNION ALL SELECT 'pagamentos',              count(*) FROM payments               WHERE booking_id IN (SELECT id FROM reservas)
UNION ALL SELECT 'comissões',               count(*) FROM commissions            WHERE booking_id IN (SELECT id FROM reservas)
UNION ALL SELECT 'despachos (ordens de serviço)', count(*) FROM operational_assignments WHERE booking_id IN (SELECT id FROM reservas)
UNION ALL SELECT 'avaliações',              count(*) FROM reviews                WHERE booking_id IN (SELECT id FROM reservas)
UNION ALL SELECT 'lançamentos financeiros', count(*) FROM financial_ledger       WHERE booking_id IN (SELECT id FROM reservas)
UNION ALL SELECT 'cotações de rota',        count(*) FROM transfer_quotes        WHERE user_id  IN (SELECT id FROM alvo)
UNION ALL SELECT 'cupons resgatados',       count(*) FROM coupon_redemptions     WHERE user_id  IN (SELECT id FROM alvo)
 ORDER BY 2 DESC;

-- ── 4. Dinheiro que passou por essas reservas ───────────────────────────────
-- ATENÇÃO: apagar o registro NÃO estorna nada no Mercado Pago. Se aparecer
-- pagamento aprovado aqui, confira no painel do MP se precisa estornar ANTES —
-- depois de apagar, você perde o vínculo entre a cobrança e a reserva.
SELECT p.status,
       count(*)                      AS pagamentos,
       coalesce(sum(p.amount), 0)    AS total
  FROM payments p
 WHERE p.booking_id IN (
   SELECT b.id FROM bookings b
    WHERE b.user_id     IN (SELECT id FROM users WHERE user_type <> 'admin')
       OR b.operator_id IN (SELECT id FROM users WHERE user_type <> 'admin')
 )
 GROUP BY p.status
 ORDER BY 3 DESC;

-- ── 5. Repasses pendentes (se a 080 já foi aplicada) ────────────────────────
-- Sai como erro "relation does not exist" se a tabela ainda não existir —
-- é inofensivo, só ignore essa parte.
SELECT 'repasses' AS registro, status, count(*) AS quantidade, sum(amount) AS total
  FROM booking_payouts
 WHERE booking_id IN (
   SELECT b.id FROM bookings b
    WHERE b.user_id     IN (SELECT id FROM users WHERE user_type <> 'admin')
       OR b.operator_id IN (SELECT id FROM users WHERE user_type <> 'admin')
 )
 GROUP BY status;
