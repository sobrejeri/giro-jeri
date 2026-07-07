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
| **Coop-fantasma** | Um `user_type='operator'` real, com CNPJ e conta Mercado Pago próprios, operado pelo admin. Hub de coleta/repasse dos combos e executor de última instância. |

## 3. Regras de negócio (confirmadas com o cliente)

- **R1/R2 — prazo ancorado no passeio.** A perna expira em
  `service_datetime − 15min` (não relógio fixo). Fica aberta a coops e ao admin
  até esse limite. Alerta ao admin ao se aproximar (parametrizável,
  `leg_cutoff_alert_minutes`, default 120min). No cutoff sem fechar → o pedido
  não confirma.
- **R3 — pay-after-all.** Mantém o fluxo atual "aceite → depois pagamento". Só
  cobra quando **todas** as pernas estão `accepted`. Combo incompleto nunca vira
  cobrança (tudo-ou-nada barato, sem pré-autorização).
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

### Dinheiro (split)
- **Pedido de 1 coop** → pagamento **direto na conta da coop** (fluxo marketplace
  atual, `sellerAccessToken` + `application_fee`). Sem fantasma.
- **Pedido multi-coop (2+)** → pagamento **coleta na conta da coop-fantasma**
  (uma conta, um pagamento) e ela **repassa por perna** às coops reais — **mesmo
  quando as duas pernas são aceitas por coops reais**, porque o Mercado Pago não
  divide um pagamento único entre contas distintas. A parte de perna executada
  pela própria fantasma fica com ela.

> **Por que a coop-fantasma:** legitima a custódia. Em vez de "a plataforma
> segura dinheiro de terceiros" (risco fiscal), é uma prestadora registrada, com
> CNPJ dedicado, que recebe e subcontrata as coops. Encaixa no modelo existente:
> é só um operador com CNPJ (migration 010), dados bancários (009) e conexão MP
> marketplace (036); o admin agir "como ela" é o modo elevado da Etapa 1.

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
- `getSplitContext` **bifurcado**: pedido de 1 coop = direto à coop; multi-coop =
  coleta na fantasma + repasse por perna no ledger.
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

**IN (Etapa 2):** `booking_legs` + agregado tudo-ou-nada; explosão a partir do
"Monte sua combinação"; feed/aceite por perna; status por perna no cliente;
Central de combos; alerta de cutoff; coleta/repasse via coop-fantasma
(registro contábil por perna); job de cutoff.

**OUT (Etapa 3/4):** execução automática do repasse (fantasma → coops); realocação
automática de perna; reembolso parcial por perna; auto-dispatch/ranking de coop;
combos multi-serviço (tour + transfer no mesmo pedido); dashboards de ocupação.

## 10. Riscos / pendências

- **Fiscal/contábil da coop-fantasma** — a receita inclui valores de passagem;
  o CNPJ dedicado é o que torna correto. **Validação do cliente com a
  contabilidade.**
- **Execução do repasse** multi-coop fica como obrigação no ledger até a Etapa 3.
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
   `getSplitContext` bifurcado; `/financial` por operador; job de cutoff.
3. Frontend: cliente (status por perna) + coop (feed leg-shaped + Central com
   countdown); i18n pt/en/es.
4. Ligar a flag `booking_legs_engine_enabled` só quando aceite/cancelamento/cutoff
   estiverem provados em staging.
