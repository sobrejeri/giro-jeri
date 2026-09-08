# MAPA DO FLUXO DE PAGAMENTO — Turiva/Giro Jeri (branch `claude/giro-jeri-platform-GFBFR`)

Base: `/home/user/giro-jeri`. Todas as linhas conferidas no HEAD `7f5d534`.

---

## 0. Vocabulário e estados válidos

| Coluna | Enum | Onde |
|---|---|---|
| `payments.status` | `pending, approved, failed, expired, refunded, partially_refunded` | `supabase/migrations/001_schema_completo.sql:57` |
| `bookings.payment_status` | mesmo enum acima | `001:575` |
| `bookings.status_commercial` | `draft, awaiting_acceptance, awaiting_payment, paid, payment_failed, cancelled, refunded` | `001:32` + `035_status_awaiting_acceptance.sql:20` |

**`'expired'` NÃO existe em `status_commercial`.** Nenhuma migration o adiciona (`grep "'expired'" supabase/migrations` só acha `payment_status`, `transfer_quotes.status` e `booking_legs.status_leg`). Isso torna o caminho de expiração da §3 um no-op silencioso — detalhado lá.

Dois fluxos de cartão, decididos pelo SERVIDOR em `payments.js:337` (`cartaoNoCheckoutPro`) e espelhados no app em `CheckoutPayment.jsx:284`. Padrão = `checkout_pro`; só um `'bricks'` explícito em `system_settings.payment_card_flow` volta ao Brick.

---

## 1. Caminhos que CRIAM UMA COBRANÇA no gateway

Todos partem de `POST /api/payments/intent` (`payments.js:878`), exceto o gateway de teste.

| # | Caminho | Chamada ao MP | Chave de idempotência no MP |
|---|---|---|---|
| **C1** | Cartão · Checkout Pro (padrão) | `criarPreferenciaCheckoutPro` — `payments.js:1263` → `mercadoPago.js:581` (POST `checkout/preferences`) | **NENHUMA.** `fetch` direto, sem `X-Idempotency-Key` (`mercadoPago.js:639`) |
| **C2** | Cartão · Bricks | `createCardPayment` — `payments.js:1385` → `mercadoPago.js:296` | `idempotencyKey = payment_attempt_id` (`mercadoPago.js:414`); ausente ⇒ `throw` em `mercadoPago.js:325` |
| **C3** | PIX (1 recebedor) | `createPixPayment` — `payments.js:1498` → `mercadoPago.js:61` | **NENHUMA** (`client.create({ body })`, `mercadoPago.js:94`) |
| **C4** | PIX split N-recebedores (motor de pernas) | `createPixPaymentSplit` — `payments.js:1489` → `mercadoPago.js:243` | **NENHUMA** |
| **C5** | Gateway `test` | `payments/test.js` — `payments.js:1075` | n/a |
| **C6** | Manual (sem gateway) | nenhuma; `effectiveGateway='manual'` — `payments.js:1539` | n/a |

Observações factuais:

- **C1 não é uma cobrança, é um LINK.** A cobrança nasce na página do MP; o id dela só chega por webhook (`payments.js:2477`), polling (`:2274`) ou conciliação (`paymentReconcile.js:77`).
- C1 é o único caminho onde **duas requisições simultâneas produzem dois caminhos de pagamento** — não existe UNIQUE de banco protegendo, apenas a leitura em `payments.js:1160` e a janela de reuso de 20 min em `:1212`. Foi o incidente #1.
- O app **não envia `payment_attempt_id` no Checkout Pro** (`CheckoutPayment.jsx:456-465`), então a linha criada em `:1239` tem `payment_attempt_id = NULL` e o UNIQUE parcial da 088 não a alcança.
- Bloqueios prévios: grupo multi-operador → 422 (`:1104`); cartão com split multi → 422 (`:1115`); `checkout_pro` pedido com a config em `bricks` → 409 (`:1146`).

### Linhas em `payments` (o registro, não a cobrança)

| Origem | Modo de escrita | Trava |
|---|---|---|
| Reserva da tentativa (só C2) | `INSERT` — `paymentFlow.js:82` | UNIQUE parcial `payments_payment_attempt_id_key` (088) |
| Checkout Pro | `inserirPagamento` sem tentativa — `payments.js:1239` | nenhuma (sem `gateway_transaction_id`, sem attempt) |
| PIX/cartão/test/manual | `inserirPagamento(row, tentativaReservadaId)` — `payments.js:1592` | `UPDATE` na tentativa, ou `upsert onConflict:'gateway_transaction_id'` (`:787`), ou `INSERT` puro (`:788`) |
| `manual-confirm` | `INSERT` — `payments.js:2636` | nenhuma |
| Reserva manual do admin | `INSERT` já `approved` — `admin.js:2589` | nenhuma |

`inserirPagamento` (`:767`) remove colunas inexistentes (PGRST204/42703) e repete, exceto as de `CAMPOS_ESSENCIAIS` (`:811`).

---

## 2. Caminhos que MUDAM `payments.status`

**→ `pending` (nascimento)**
- `paymentFlow.js:78` (tentativa Bricks)
- `payments.js:1249` (Checkout Pro)
- `payments.js:1548` — `statusInicialDoPagamento(cardPaymentStatus)`: `approved`⇒`pending`, `rejected`⇒`failed`, resto passa direto (`paymentFlow.js:175`)
- `payments.js:2639` (manual-confirm), `admin.js:2589` (`approved` se `isPaid`)

**→ `approved`** — **um único ponto**: `reivindicarAprovacao` (`paymentFlow.js:38`), `UPDATE ... .eq(id).neq('status','approved')`, embrulhado em `payments.js:710` e chamado de `onPaymentApproved:2765` e `onGroupPaymentApproved:2963`. Nenhum outro lugar escreve `'approved'` (exceto o INSERT do admin acima).

**→ `failed`**
- `payments.js:755` — `reconciliarTentativa`, quando o MP diz `rejected/cancelled` numa tentativa já cobrada. **Sem guarda `.neq('status','approved')`.**
- `payments.js:2567` — webhook com `mpStatus ∈ {rejected, cancelled}`. Sem guarda.
- `paymentReconcile.js:133` — conciliação, mesmo desfecho. Sem guarda.

**→ `expired`** — `payments.js:2251`, dentro de `GET /:id/status`, quando `status='pending'` e `expires_at < now`. `expires_at` vem de `:1050` (+30 min) ou do `date_of_expiration` do PIX (`:1523`). **A linha do Checkout Pro nasce sem `expires_at` (`:1239-1255`) ⇒ nunca expira.**

**Colunas de controle (não são status, mas decidem tudo)**
- `ledger_created` — claim atômico `.eq('ledger_created', false)` em `payments.js:2819` e `:2996`; devolvido em `:2848` / `:3035` se o INSERT do razão falhar.
- `status_detail = 'mp_call_failed'` — `payments.js:724` (`comChamadaMarcada`), só onde `gateway_transaction_id IS NULL`. É o que libera o retry imediato em `paymentFlow.js:105`.
- `gateway_transaction_id` (ligação da cobrança à linha) — **quatro escritores**, todos com `.is('gateway_transaction_id', null)`:
  `payments.js:1182` (pré-checagem do Checkout Pro), `payments.js:2280` (polling), `payments.js:2497` (webhook), `paymentReconcile.js:81` (conciliação).
  Todos tratam "0 linhas atualizadas" como *não decida nada* (`:1184`, `:2290`, `:2504`, `paymentReconcile.js:92`).
- `raw_response_json` do Checkout Pro (`preference_id` + `redirect_url`) — `payments.js:1287`. É o que faz o reuso de `:1213` funcionar.

---

## 3. Caminhos que MUDAM `bookings.status_commercial` / `payment_status`

### → `paid` / `approved`
| Local | Guarda de estado |
|---|---|
| `payments.js:2788-2790` (`onPaymentApproved`, reserva única) | **NENHUMA** — `.eq('id', payment.booking_id)` e nada mais. Promove `cancelled`/`refunded`/`expired` a `paid`. |
| `payments.js:2978-2981` (`onGroupPaymentApproved`) | filtra a lista em `:2974` para `['awaiting_payment','paid']` |

Assimetria real entre os dois caminhos.

### → `payment_failed` / `failed`
| Local | Guarda |
|---|---|
| `payments.js:2571-2574` (webhook) | `.in('status_commercial', ['awaiting_payment','payment_failed'])` |
| `paymentReconcile.js:134-139` (conciliação) | mesma guarda |

Esta é a correção do incidente #2. **Efeito colateral que segue vivo:** `POST /intent` com `existing_booking_id` exige `status_commercial === 'awaiting_payment'` (`payments.js:977`) — uma reserva rebaixada a `payment_failed` recebe 409. Mas o app mapeia `payment_failed → waiting_payment` (`BookingDetail.jsx:38`) e continua exibindo "Pagar agora" (`BookingDetail.jsx:412`). Botão que sempre falha.

### → `expired` (código morto na prática)
`payments.js:2255-2258` (grupo, com guarda `.eq('status_commercial','awaiting_payment')`) e `:2260` (reserva única, sem guarda). Ambos gravam `status_commercial: 'expired'`, **valor ausente do enum** ⇒ o UPDATE volta com erro `22P02`, **o retorno não é lido** e a reserva fica intocada. `payments.status` já virou `'expired'` na linha anterior (`:2251`). Resultado observável: pagamento expirado + reserva ainda `awaiting_payment`.

### → `awaiting_payment`
- `payments.js:1032` (`/intent` criando reserva inline), `:1825` (`/request` com `partner_slug`), `:1992` (`/cart-request` com partner)
- `payments.js:2152` (`/booking/:id/checkout-accepted`) — guarda `.eq('status_commercial','awaiting_acceptance')`
- `operator.js:557` (todas as pernas aceitas), `:934`/`:943` (aceite de grupo), `:1018`/`:1032` (aceite individual) — guardas `.is('operator_id', null).eq('status_commercial','awaiting_acceptance')`
- `transfers.js:653` (cotação aceita), `bookings.js:167` (POST /api/bookings legado), `admin.js:2580` (reserva manual)

### → `awaiting_acceptance`
`payments.js:1828` (`/request`), `:1995` (`/cart-request`).

### → `cancelled`
- `bookings.js:485` — `POST /bookings/:id/cancel`. Bloqueia só `cancelled`/`completed` (`:475`); **uma reserva `paid` pode ser cancelada**, e nada em `payments` muda.
- `operator.js:583` — limpeza de `awaiting_acceptance` sem operador com data passada
- `transfers.js:732`
- RPC `cancel_overdue_leg_bookings` (`048_leg_service_anchored_autocancel.sql:23`), disparada por `sweepExpiredLegBookings` (`legFlow.js:79`) em `bookings.js:277`, `bookings.js:326` e `payments.js:2101`

### Triggers de banco que reagem a essas mudanças
- `trg_bookings_pay_after_all_legs` (`042:289`, função `:272`; `booking_all_legs_accepted` corrigida em `043:35`) — `RAISE EXCEPTION` ao entrar em `awaiting_payment`/`paid` com perna não aceita. **Dispara também na aprovação** (`payments.js:2790`), e ali o erro não é lido.
- `trg_booking_availability` (`001:1316`, função `:1281`) — soma/devolve `used_capacity` em compartilhado ao entrar/sair de `paid`.
- `trg_bookings_audit` (`001:1272`).

---

## 4. Efeitos de uma aprovação — `onPaymentApproved` (`payments.js:2753`)

Ordem exata, com o que protege cada passo:

1. `payment.order_group_id` presente ⇒ desvia para `onGroupPaymentApproved` (`:2757` / `:2958`).
2. `primeiraAprovacao = reivindicarAprovacao(payment.id)` (`:2765`) — claim atômico.
3. Recarrega a reserva COMPLETA do banco (`:2782`) — nunca confia no join de quem chamou.
4. `bookings → paid/approved` (`:2790`), `status_operational='awaiting_dispatch'` só se não houver operador (`:2789`).
5. `transfer_quotes → paid` se a reserva veio de cotação (`:2796`, guarda `.eq('status','accepted')`).
6. **Razão**: claim `ledger_created` (`:2817`) → INSERT de `booking_gross`/`gateway_fee`/`booking_net` + `orderCommissionRows` (`:2837`); falhou ⇒ devolve a marca (`:2848`).
7. **Repasses**: `gerarRepasses(booking, payment.amount_gross ?? booking.total_amount)` (`:2879`) — FORA do gate do razão, idempotente por `UNIQUE(booking_id,kind)` + `upsert ignoreDuplicates` (`payouts.js:295`). Pula a comissão quando houve split no ato (`payouts.js:272-289`, lendo `payments.split_operator_id`).
8. **Contabilidade por perna**: `recordLegAccounting` (`:2888`) — upsert por `leg_id,entry_type` e `leg_id` (`:2704`, `:2710`).
9. **Comissão de afiliado**: `recordAffiliateCommission` (`:2893`) — idempotente por 23505 engolido (`:3086`).
10. **Só se `primeiraAprovacao`**: e-mail (`:2898`) e notificações app/WhatsApp (`:2902` → `notifyBookingPaid:2908`).

`onGroupPaymentApproved` (`:2958`) espelha isso por reserva, com o filtro de estado em `:2974` e o rateio de taxa em `:3015-3030`.

### Quem chama `onPaymentApproved` (9 pontos)
`payments.js:749` (reconciliarTentativa) · `:1187` (pré-checagem do Checkout Pro) · `:1620` (cartão aprovado no mesmo request) · `:2245` (gateway test no polling) · `:2302` (polling, ligação por external_reference) · `:2325` (polling, consulta direta) · `:2565` (webhook) · `:2615` (`/simulate`) · `:2644` (`/manual-confirm`) · **+** `bookings.js:285` e `:337` e `admin.js:608`, injetado como `aoAprovar` na conciliação.

---

## 5. Quem roda concorrentemente com quem

**Atores e suas cadências:**

| Ator | Gatilho | Frequência |
|---|---|---|
| `POST /intent` | toque no botão | sob demanda; reentrada travada só no app (`CheckoutPayment.jsx:97` no Brick, `:452` no Checkout Pro) |
| Webhook `POST /webhook` | MP | sem autenticação de sessão; reentregas normais; **múltiplas entregas do mesmo evento podem chegar em paralelo** |
| Polling `GET /:id/status` | app | 4 s (`CheckoutProcessando.jsx:243`, `:345`, `:491`) |
| Conciliação lazy | `GET /bookings` e `GET /bookings/:id` | throttle de 30 s **por processo** (`paymentReconcile.js:159-172`); `BookingDetail.jsx:146` refaz o GET a cada 8 s |
| Conciliação em lote | `POST /admin/payments/reconcile` (`admin.js:600`) | manual, até 100 linhas |
| `sweepExpiredLegBookings` | mesmos GETs + `checkout-accepted` | a cada chamada |
| Aceite do operador | `operator.js:557/934/1018` | sob demanda |
| Cancelamento do cliente | `bookings.js:458` | sob demanda |

**Pares que colidem de verdade:**

1. **Webhook × polling × conciliação** sobre o mesmo `payment` — o caso clássico. Protegido por `reivindicarAprovacao` + `ledger_created` + idempotências de repasse/comissão.
2. **Webhook × polling × conciliação × pré-checagem do Checkout Pro** disputando a **ligação** `gateway_transaction_id` (4 escritores da §2). Protegido pelo `.is(null)` + `UNIQUE` de `001:646`; o perdedor devolve `pending`.
3. **Duas entregas do MESMO evento de webhook** — `registrarEventoWebhook` (`paymentFlow.js:129`) é INSERT puro lendo o 23505; `'processed'` só é gravado no fim (`payments.js:2580`), então uma queda no meio permite reprocessar (`paymentFlow.js:151`).
4. **`/intent` × `/intent`** (toque duplo, retry de rede): Bricks protegido pelo UNIQUE de `payment_attempt_id` (`paymentFlow.js:82-118`, com os modos `existente`/`em_voo`/`assumida`); **Checkout Pro não tem trava de banco** entre a leitura (`:1160`) e o insert (`:1239`).
5. **`/intent` × aceite do operador**: `/intent` lê `status_commercial` em `:977` e cobra depois; o aceite reescreve a reserva em paralelo (`operator.js:1018`). Não há bloqueio de linha entre a leitura e a cobrança.
6. **`/intent` × `checkout-accepted`**: `:2152` reescreve `total_amount` enquanto `/intent` já pode ter lido o valor antigo em `:990`.
7. **Aprovação × cancelamento**: `bookings.js:485` grava `cancelled` sem olhar `payments`; `onPaymentApproved:2790` grava `paid` sem olhar `status_commercial`. Os dois podem se atropelar nos dois sentidos.
8. **Conciliação × conciliação entre instâncias do Render**: o throttle é um `Map` em memória (`paymentReconcile.js:160`) — não atravessa processos.
9. **`recordLegAccounting` × `gerarRepasses`** rodando duas vezes: ambos idempotentes por índice único (046 / 080).

---

## 6. Travas de concorrência que EXISTEM, e onde

### No banco
| Trava | Arquivo | Protege |
|---|---|---|
| `payments.gateway_transaction_id UNIQUE` | `001:646` | uma transação do gateway = uma linha |
| `payments_payment_attempt_id_key` (UNIQUE parcial) | `088` | uma tentativa do checkout = uma cobrança (**só Bricks**) |
| `payment_events_gateway_event_id_key` (UNIQUE parcial) | `088` | reentrega de webhook |
| `payments.ledger_created` | `021` | receita lançada uma vez |
| `booking_payouts UNIQUE(booking_id,kind)` | `080` | repasse pago em dobro |
| `commissions UNIQUE(booking_id,affiliate_id)` | `055` | comissão de afiliado duplicada |
| `financial_ledger UNIQUE(leg_id,entry_type)` / `commissions UNIQUE(leg_id)` | `046` | contabilidade por perna |
| `trg_bookings_pay_after_all_legs` | `042:289` / `043:35` | pagar com perna não aceita |

### No código
| Trava | Local | Cobre |
|---|---|---|
| `reivindicarAprovacao` — `UPDATE ... .neq('status','approved')` | `paymentFlow.js:38` | efeitos de aprovação executados uma vez |
| `reservarTentativa` — INSERT + leitura do 23505, com `TENTATIVA_EM_VOO_MS = 90_000` e `MARCA_FALHA_MP` | `paymentFlow.js:21,26,68` | cobrança dupla no Bricks; retomada de tentativa órfã |
| `registrarEventoWebhook` — INSERT puro (não `upsert ignoreDuplicates`) | `paymentFlow.js:129` | evento repetido vs. repetido-não-concluído |
| Pré-checagem do Checkout Pro (`approved`/`pending` + busca por referência + reuso de 20 min) | `payments.js:1160-1228` | segundo checkout para a mesma reserva |
| `.is('gateway_transaction_id', null)` nas 4 ligações | `:1182`, `:2280`, `:2497`, `paymentReconcile.js:81` | aprovar a mesma cobrança duas vezes |
| Claim de `ledger_created` | `:2817`, `:2996` | receita dobrada |
| Guarda `.in(['awaiting_payment','payment_failed'])` no rebaixamento | `:2574`, `paymentReconcile.js:139` | incidente #2 |
| Conciliação: só `status='pending'`, só `'approved'` aprova, só leitura no MP, janela 7 d, teto 5/25 | `paymentReconcile.js:29,32,53,121` | estrago da varredura |
| Busca por referência não condena, só aprova | `paymentReconcile.js:110`, `payments.js:2305` | recusa antiga derrubar reserva paga |
| `enviandoRef` / `redirecionando` no app | `CheckoutPayment.jsx:97`, `:452` | toque duplo (só no cliente) |

---

## 7. Onde NÃO há trava (fatos verificáveis, para os caçadores)

1. **`onPaymentApproved:2790` grava `paid` sem guarda de `status_commercial`** — o caminho de grupo tem a guarda (`:2974`), o de reserva única não. Direção oposta ao incidente #2.
2. **Checkout Pro sem `payment_attempt_id`** (`CheckoutPayment.jsx:456`) ⇒ o UNIQUE da 088 não cobre o fluxo padrão de cartão. Entre `:1160` (leitura) e `:1239` (insert) não há nada atômico.
3. **`status_commercial: 'expired'`** (`:2256`, `:2260`) é valor inválido no enum e o erro não é lido — pagamento expira, reserva não.
4. **`GET /:id/status` (`:2233`) não confere dono do pagamento.** Qualquer usuário autenticado, com um `payment_id`, dispara `onPaymentApproved` (`:2245`, `:2302`, `:2325`) ou a expiração (`:2251`) de pagamento alheio. `/simulate` (`:2607`) e `/checkout-key` (`:2198`) conferem; este não.
5. **`POST /manual-confirm` (`:2622`)** aceita `user_type === 'operator'` **sem verificar vínculo com a reserva**, e usa `.eq('booking_id', …).single()` (`:2632`) — com 2+ linhas de pagamento o `single()` erra, `payment` fica `null` e o código **cria uma linha nova** (`:2636`) para uma reserva que já tinha pagamento.
6. **`reconciliarTentativa:755` grava `failed` sem `.neq('status','approved')`** — pode rebaixar a linha (não a reserva) de um pagamento já aprovado por outro caminho.
7. **`upsert onConflict:'gateway_transaction_id'` (`:787`)** faz `ON CONFLICT DO UPDATE`: a mesma transação chegando de novo **sobrescreve `status`** da linha existente com o `initialPaymentStatus` calculado agora.
8. **Linha do Checkout Pro nasce sem `expires_at`** (`:1239-1255`) — nunca é varrida por expiração; fica `pending` indefinidamente até webhook/polling/conciliação.
9. **Eventos de webhook fora de `payment`/`payment.updated`** nunca recebem `processing_status='processed'` (o UPDATE está dentro do `if` de `:2521`, em `:2580`) — ficam `pending` para sempre e toda reentrega é tratada como `repetido_nao_concluido` (`paymentFlow.js:151`).
10. **Throttle da conciliação é in-process** (`paymentReconcile.js:160`) — duas instâncias no Render conciliam o mesmo cliente simultaneamente.
11. **PIX e a preferência do Checkout Pro vão ao MP sem `X-Idempotency-Key`** (`mercadoPago.js:94`, `:639`) — só o cartão Bricks tem (`:414`).
12. **`bookings.js:485` cancela reserva `paid`** sem tocar em `payments` nem em repasses/razão.

---

## 8. Split — onde é decidido (não altera percentual, só mapeia)

- `plataformaRecebeTudo` (`:341`, fail-closed para `true`) → com 079 ligada, o único split possível é o de operador único.
- `contextoSplitOperadorUnico` (`:410`): 4 condições (chave `payment_split_single_operator`, um único operador, todos os modais identificados via `modaisDasReservas:369`, nenhum executor fixo diferente). Percentual ponderado em `:439-448`; `application_fee` derivado do alvo líquido do operador em `:478-481`; recusa se ≤ 0 ou ≥ total (`:485`).
- `getSplitContext` (`:495`), `getSplitContextForBooking` (`:556`, pernas), `getSplitContextForGroup` (`:620`).
- Cartão Bricks: split é **anulado** se a chave pública que tokenizou não bater com a do operador (`:1336-1348`), e 409 no caso inverso (`:1322-1334`).
- Registro do split na linha: `split_operator_id` / `split_application_fee` (`:1251`, `:1586`) — é o que impede `gerarRepasses` de pagar de novo (`payouts.js:272-289`).
- Campo no gateway: `application_fee` (PIX e Bricks — `mercadoPago.js:91`, `:399`) vs. `marketplace_fee` (Checkout Pro — `mercadoPago.js:636`).

---

## 9. PIX — superfície de regressão (fluxo que JÁ funciona)

Toca PIX: `intent` §C3/C4 (`:1479-1531`), a linha em `:1592` (INSERT/upsert, sem `payment_attempt_id`), `expires_at` do MP (`:1523`), polling `:2318`, webhook `:2521`, conciliação `paymentReconcile.js:71` (ramo *com* `gateway_transaction_id`), taxa `TAXA_MP.pix = 0.0099` (`:189`) gravada em `gateway_fee_pct` (`:1582`).
Não toca PIX: tudo dentro de `if (isCard)` (`:1110-1478`), `reservarTentativa`, `reconciliarTentativa`, `cartaoNoCheckoutPro`, o ramo *sem* `gateway_transaction_id` da conciliação (`paymentReconcile.js:76-114`).
