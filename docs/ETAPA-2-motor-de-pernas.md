# Etapa 2 — Motor de Pernas / Pedido Dividido (design)

> Documento de design acordado pela mesa-redonda (PO, Arquiteto, DBA, Tech Lead).
> **Estado: desenho aprovado, implementação pendente.** Nada aqui está ligado em
> produção — a migration `042` existe mas nasce **desativada por flag**
> (`system_settings.booking_legs_engine_enabled = 'false'`).

## 1. Visão

Uma reserva com vários veículos vira um **pedido** com várias **pernas** (modelo
carrinho multi-seller). Cada perna é roteável a **uma** cooperativa de forma
independente; o pedido é a unidade **tudo-ou-nada** (dono do cliente, do total e
do pagamento).

- **Cada cooperativa** vê cada perna como uma solicitação isolada (não vê as
  irmãs nem o total).
- **O cliente** vê **uma** solicitação com o status de confirmação por perna.
- **O admin** é a rede de segurança: opera na SPA da cooperativa em **modo
  elevado** (Etapa 1), com uma "Central de combos incompletos".

## 2. Conceitos

| Termo | O que é |
|---|---|
| **Pedido** | `bookings` (existente). Unidade tudo-ou-nada; dono de total/cliente/pagamento. |
| **Perna** | `booking_legs` (nova). 1 linha = 1 veículo do pedido; roteável e unidade de split. |
| **Coop-fantasma** | Um `user_type='operator'` real, com CNPJ e conta Mercado Pago próprios, operado pelo admin. **Executor de última instância** da perna órfã — entra no split como qualquer coop, sem custódia de dinheiro de terceiros. |

## 3. Regras de negócio (confirmadas com o cliente)

- **R1/R2 — prazo ancorado no passeio.** A perna expira em
  `service_datetime − 15min` (não relógio fixo). Fica aberta a coops e ao admin
  até esse limite. Alerta ao admin ao se aproximar (parametrizável,
  `leg_cutoff_alert_minutes`, default 120min). No cutoff sem fechar → o pedido
  não confirma.
- **R3 — checkout controlado pelo cliente (carrinho com total dinâmico).** O
  cliente monta o carrinho e envia a solicitação; o pagamento fica **bloqueado** e
  o total vai **somando conforme cada perna é aceita**. Com ≥1 perna aceita, o
  cliente escolhe: **(a) pagar só o aceito agora** → cobra as pernas aceitas e
  **cancela automaticamente** as pendentes; ou **(b) esperar** → mais pernas
  somam ao total e ele paga o conjunto maior depois. **Nunca há reembolso** — só
  se cobra o que já está aceito. O cancelamento das pernas pendentes ao pagar é
  **atômico** (uma coop não pode aceitar a perna que está sendo cancelada).
  - Caso "mesmo grupo em 2 veículos": pagar parcial pode deixar parte do grupo
    sem transporte → a tela **avisa explicitamente** qual perna será cancelada.
    É escolha informada do cliente.
- **R4 — cancelamento pós-aceite é manual.** Coop que cancela devolve a perna à
  fila/Central; a realocação é feita pelo admin (automática = Etapa 3). Se o
  pedido já estava pago, alerta prioritário.
- **R5 — 1 veículo = 1 perna**, mesmo motor (inclusive pedido de 1 veículo).
- **R6 — horário limite de solicitação** (`booking_cutoff_time`): **já
  implementado** (fora do motor de pernas). Passeio/transfer não aceita reserva
  no mesmo dia após o horário; admin define por serviço no Catálogo.

## 4. Roteamento e dinheiro (a decisão do split)

### Roteamento (quem vê / aceita)
- **1 veículo** → direto às coops que operam aquele veículo; a que aceitar,
  executa.
- **Multi-veículo** → cada perna vai à pool de coops do seu veículo.
- **Perna órfã perto do cutoff** → cai na **coop-fantasma** (admin) com **alerta
  de prioridade**; o admin fecha (a fantasma executa ou realoca).

### Dinheiro (split via split NATIVO do Mercado Pago)
Como o pagamento só ocorre **depois** de todas as pernas aceitas (R3), na hora de
cobrar **todos os recebedores já são conhecidos** — então usa-se o **split nativo
do Mercado Pago** (múltiplos recebedores num único pagamento, `application_fee`
no Checkout Bricks). Cada cooperativa recebe **direto na própria conta MP** a
fatia da(s) perna(s) que executou; a plataforma retém a comissão.

- **Ninguém recebe dinheiro de passagem.** O valor não transita por uma conta
  coletora — vai direto a cada coop. Evita o problema fiscal de custódia/pass-through.
- **Pedido de 1 coop** → split nativo com 1 recebedor (a coop) + comissão da
  plataforma. É o fluxo marketplace atual.
- **Pedido multi-coop** → split nativo com N recebedores (as coops que aceitaram),
  cada uma com a fatia da sua perna, + comissão da plataforma.
- **Pré-requisito:** cada coop tem conta MP conectada via OAuth (migration 036) —
  já faz parte do sistema.

> **Papel da coop-fantasma (reduzido):** é só um **operador executor** da perna
> órfã (rede de segurança). Quando o admin fecha uma perna sem coop, ela é
> atribuída à fantasma, que entra no split como qualquer recebedor e recebe **só
> a fatia daquela perna** — tributada apenas sobre o que de fato ganhou, sem
> custódia de valores de terceiros. É um `user_type='operator'` com CNPJ próprio
> (migration 010), conta MP (036) e dados bancários (009); o admin opera "como
> ela" no modo elevado da Etapa 1.

## 5. Máquina de estados

### Perna (`leg_status`)
```
                    ┌─────────────────────────┐
   criação          │   awaiting_acceptance   │◄─── R4: coop cancela (volta à fila)
 (explode veículos) │   (fila / Central)      │
        ──────────► └──────┬──────────┬───────┘
             coop/admin     │          │ cutoff (service−15) sem operator_id
             aceita atômico │          ▼
                            ▼      ┌──────────┐
                     ┌───────────┐ │ expired  │ (terminal)
                     │ accepted  │ └──────────┘
                     └─────┬─────┘
       pedido cancelado    ▼
                     ┌───────────┐
                     │ cancelled │ (terminal)
                     └───────────┘
```
Aceite é **atômico**: `UPDATE ... WHERE operator_id IS NULL AND
leg_status='awaiting_acceptance' AND (isAdmin OR cutoff_at > now())` — 0 linhas =
"perna já aceita".

### Status agregado do pedido (`bookings.status_commercial`, derivado por trigger)
- Qualquer perna `expired` no cutoff → `cancelled`.
- Todas `accepted` e não pago → `awaiting_payment` (destrava a cobrança — R3).
- Todas `accepted` e pago → `paid`.
- Mistura → `awaiting_acceptance` (combo incompleto).

## 6. Schema (migration `042`, proposta e testada; **desligada por flag**)

- **`booking_legs`**: `id`, `booking_id` FK, `vehicle_id` + snapshot
  (nome/tipo/capacidade), `pax_count`, `leg_price`, `operator_id` (nullable),
  `leg_status` (enum novo `booking_leg_status`:
  `awaiting_acceptance|accepted|expired|cancelled`), `acceptance_expires_at`
  (= `service_datetime − 15min`, materializado), `admin_notified_at`,
  `booking_vehicle_id` (FK p/ o snapshot comercial).
- **`bookings.service_datetime`**: coluna GERADA (`service_date + service_time`)
  — base do cutoff, indexável.
- **Contabilidade por perna**: `leg_id` (nullable) em `financial_ledger` e
  `commissions`, + `commissions.operator_id`. NULL = modelo legado por pedido.
- **Triggers**: `spawn_booking_legs_from_vehicle` (cria pernas a partir de
  `booking_vehicles.quantity`), `recompute_booking_from_legs` (deriva o agregado),
  `enforce_pay_after_all_legs` (bloqueia pagamento com perna pendente) — todos
  **inertes enquanto a flag estiver `false`**.
- **RLS** em `booking_legs` (padrão `auth_id = auth.uid()`): cliente vê pernas do
  próprio pedido; coop vê as suas + pendentes roteáveis (Model B, casamento de
  041); admin `FOR ALL`.
- **Backfill** seletivo: só pedidos não pagos ganham 1 perna por unidade de
  `booking_vehicles`; pagos/concluídos/cancelados intactos.

## 7. Contratos de API (a implementar — nada codado ainda)

- `POST /api/payments/request` — **mesmo contrato de entrada** (o "Monte sua
  combinação" não muda); internamente explode em pernas (R5) e notifica coops
  **por perna**.
- `GET /api/operator/bookings` — passa a ser **leg-shaped** (cada item = uma
  perna, expondo só o necessário à coop); filtro Model B fica trivial (1 perna =
  1 veículo). Admin não filtra.
- `POST /api/operator/legs/:legId/accept` — aceite atômico por perna; ao fechar o
  combo, dispara o pagamento (R3).
- `GET /api/operator/legs/central` + `POST .../assign` — Central de combos
  incompletos (countdown, aceitar/fechar/escolher coop como admin/fantasma).
- `GET /api/bookings/:id` — embute `legs[]` com status por perna + agregado
  (visão do cliente).
- `getSplitContext` passa a montar o **split nativo com N recebedores** (as coops
  que aceitaram cada perna, a fantasma inclusa quando executora) + comissão da
  plataforma. Como o pagamento só ocorre com o combo fechado, os recebedores já
  são todos conhecidos.
- `GET /api/operator/financial` — passa a somar por `operator_id`/`leg_id` (hoje
  soma por `booking_id`; com multi-coop vazaria receita entre coops).

## 8. Cutoff & expiração (infra)

- `cutoff_at` materializado por perna. A expiração hoje é **lazy** (no GET) — com
  cutoff ancorado no passeio isso é insuficiente (perna pode vencer de
  madrugada). Precisa de **job agendado leve** (cron 1–5 min) para: (1) alertar o
  admin ao entrar na janela; (2) expirar pernas no cutoff; (3) cancelar o pedido
  cujo combo não fechou. Lazy sweep fica como rede de segurança. **Dependência de
  infra nova** (node-cron no processo da API vs. Render cron).

## 9. Escopo

**Carrinho universal:** o carrinho aceita **qualquer serviço ao mesmo tempo** —
passeio privativo, passeio compartilhado, transfer de rota definida e transfer
personalizado (cotação) — porque cada item é aceito **separadamente**. A intenção
é o cliente fechar o **combo completo**. Cada item é uma "perna" generalizada:

| Tipo de item | Unidade | Roteamento / aceite | Preço |
|---|---|---|---|
| Passeio privativo | 1 veículo | pool de coops do veículo (Model B) | fixo (priceEngine) |
| Passeio compartilhado | vaga(s)/pessoa | coops que operam o passeio | fixo por pessoa |
| Transfer rota definida | 1 veículo | pool de coops do veículo | fixo (rota) |
| Transfer personalizado | trajeto | cotação: coop **propõe preço** → cliente aceita | definido no aceite |

> O transfer personalizado tem **dois passos** (coop propõe valor → cliente
> aceita o valor) e por isso soma ao total só quando o cliente aceita a cotação —
> encaixa no "total dinâmico" do R3. O compartilhado não tem veículo (roteia pelo
> passeio, não por `booking_vehicles`).

**IN (Etapa 2):** `booking_legs` + agregado; explosão a partir do carrinho;
feed/aceite por item; status por item no cliente; Central de combos; alerta de
cutoff; **checkout parcial** (paga o aceito / cancela o pendente, total dinâmico)
+ split nativo MP direto às coops no pagamento (registro contábil por perna); job
de cutoff. Carrinho **multi-serviço** (mistura os 4 tipos acima).

**Implementação em ondas** (a generalização não é toda de uma vez):
1. **Onda A** — itens **por veículo** (passeio privativo + transfer de rota), que
   a migration `042` já modela; carrinho, checkout parcial e split nativo.
2. **Onda B** — generaliza para **compartilhado** (por pessoa, sem veículo) e
   **transfer personalizado** (cotação, preço no aceite).

**OUT (Etapa 3/4):** realocação automática de perna; reembolso (não há — o
checkout parcial evita); auto-dispatch/ranking de coop; dashboards de ocupação.

## 10. Riscos / pendências

- **Fiscal/contábil da coop-fantasma** — com o split nativo, ela recebe **só a
  fatia das pernas que executou** (sem pass-through), então tributa apenas o que
  ganha. Ainda vale conectar a conta MP e ter o CNPJ dedicado. Sem custódia de
  valores de terceiros.
- **Split é automático no pagamento** (nativo MP) — não há repasse manual
  pendente; a divisão sai direto pra conta de cada coop na cobrança.
- **Janela "aceito mas não pago"** — entre o combo fechar e o cliente pagar, as
  coops estão comprometidas sem cobrança. Herda o comportamento atual
  (`awaiting_payment` + prazo); se não pagar, libera as pernas.
- **Infra de scheduler** — não há worker de cron hoje; decisão de infra.
- **`GET /operator/financial` por `booking_id`** vaza receita entre coops se não
  migrar para `operator_id`/`leg_id` — obrigatório junto com o motor.
- **`pax_count` por perna** é aproximação hoje; refinar a distribuição real de
  pessoas por veículo no checkout se a operação exigir (manifesto de embarque).
- **Migration `040` ausente** na sequência (039→041→042) — seguido `max(NNN)+1`.

## 11. Ordem de implementação sugerida

1. Ligar o schema (`042`) em staging + criar a coop-fantasma (operador + CNPJ +
   conta MP).
2. API: explosão em pernas na `request`; feed/aceite por perna; Central + assign;
   `getSplitContext` com split nativo N-recebedores; pagamento liberado só com
   combo fechado; `/financial` por operador; job de cutoff.
3. Frontend: cliente (status por perna) + coop (feed leg-shaped + Central com
   countdown); i18n pt/en/es.
4. Ligar a flag `booking_legs_engine_enabled` só quando aceite/cancelamento/cutoff
   estiverem provados em staging.
