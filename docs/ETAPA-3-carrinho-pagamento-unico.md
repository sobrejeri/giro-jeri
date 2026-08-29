# Etapa 3 — Carrinho universal: N reservas, 1 pagamento

**Decisão (usuário):** manter **N reservas** (uma por serviço, cada uma com sua
data/hora/origem) e um **único pagamento** que quita todas. Sem criar um
conceito novo de "pedido"; as reservas são **agrupadas por um `order_group_id`**.

O split de pagamento já construído para o **motor de pernas** (disbursements do
Mercado Pago, `allocateCents`, contabilidade por perna idempotente) é
**reaproveitado** — o pagamento único apenas soma as pernas aceitas de **todas**
as reservas do grupo e reparte entre os operadores envolvidas.

---

## 1. Modelo de dados (mínimo)

Migration nova (**reservar nº 049**), aditiva e idempotente:

- `bookings.order_group_id UUID` — NULL = reserva avulsa (comportamento atual).
  Reservas criadas juntas pelo carrinho compartilham o mesmo `order_group_id`.
  Índice: `(order_group_id) WHERE order_group_id IS NOT NULL`.
- `payments.order_group_id UUID` — um pagamento passa a poder mirar **um grupo**
  (carrinho) em vez de um único `booking_id`. `booking_id` continua para o
  fluxo avulso/legado.
- (Opcional) view `v_order_group_totals` para o front ler o agregado do grupo
  (total aceito, nº de serviços, prazo do grupo) numa query só.

Não há tabela `orders`: o grupo é só a chave compartilhada. Simples e reversível.

---

## 2. Fluxo ponta a ponta

### Com o motor de pernas LIGADO
1. **Solicitar tudo** → uma chamada cria as **N reservas** de uma vez, todas com
   o **mesmo `order_group_id`**. Cada reserva explode em pernas (motor) e vai a
   `awaiting_acceptance`.
2. **Operadores aceitam** as pernas de cada serviço (individual, como hoje).
3. **Notificação ao cliente** (nível do grupo): "X de Y veículos aceitos no seu
   pedido — pague o que foi aceito ou aguarde". Prazo do grupo = **o MENOR**
   `service_datetime − 15min` entre as reservas (a mais próxima manda).
4. **Pagar tudo** → checkout do grupo:
   - Cancela as pernas ainda pendentes de todas as reservas do grupo (parcial),
     ou o cliente aguarda o combo fechar.
   - Soma as pernas **aceitas** de todas as reservas → **total combinado**.
   - Monta **1 pagamento** com `disbursements` agregando por operador
     (a mesma coop em serviços diferentes recebe uma fatia só).
5. **Aprovado (webhook)** → marca **todas** as reservas do grupo como `paid`,
   cancela pendentes remanescentes, lança a contabilidade por perna de todas
   (idempotente). Uma notificação de confirmação para o grupo.

### Com o motor de pernas DESLIGADO
- As N reservas vão direto a `awaiting_payment` (sem pernas/coop pré-atribuída).
- O pagamento do grupo apenas **soma os totais** das reservas num pagamento só,
  **sem split** (não há coop definida antes do pagamento). Aprovado → todas
  `paid` e caem na fila de despacho. É o "carrinho universal" básico, já útil.

---

## 3. Impacto por camada

### Banco (migration 049)
- `order_group_id` em `bookings` e `payments` (+ índices).
- Função `accepted_legs_by_group(group_id)` (opcional) espelhando
  `getAcceptedLegRecipients`, mas sobre o conjunto de reservas do grupo.

### API (`packages/api`)
- **`POST /payments/cart-request`** (novo): recebe o array de itens do carrinho,
  cria as N reservas **atomicamente** com um `order_group_id` compartilhado,
  retorna `{ order_group_id, bookings: [{id, booking_code, ...}] }`.
  (Reusa a lógica atual de `/payments/request` por item, num laço + grupo.)
- **`POST /payments/group/:groupId/checkout-accepted`** (novo): versão de grupo
  do `checkout-accepted` — cancela pendentes de todas as reservas, recalcula o
  total combinado, avança todas para `awaiting_payment`.
- **`POST /payments/intent`** (estender): aceitar `order_group_id` no lugar de
  `existing_booking_id`. Quando vier grupo:
  - `getAcceptedLegRecipients` roda sobre **todas** as reservas do grupo e
    **agrega por operador**;
  - `allocateCents` particiona o total combinado (centavos exatos);
  - `createPixPaymentSplit` recebe todos os `disbursements`.
- **Webhook `onPaymentApproved`** (estender): se `payment.order_group_id`,
  itera as reservas do grupo (paid + cancel pendentes + `recordLegAccounting`
  por reserva, tudo idempotente).
- **Auto-cancel (migration 048)**: continua por reserva. Adicionar: se o
  pagamento do grupo não acontecer até o **menor** `service−15min`, a varredura
  cancela as reservas ainda não pagas do grupo (já faz isso por reserva; só
  garantir a notificação no nível do grupo).

### Frontend (`packages/turista/CartPage`)
- "Solicitar tudo" → chama `cart-request` (1 chamada, N reservas, 1 grupo) em
  vez do laço `requestBooking` por item.
- Um botão **"Pagar tudo · R$ X"** (total combinado dos aceitos) → checkout do
  grupo → tela de pagamento única.
- Mostrar, por item, o estado (aguardando aceite / aceito / a pagar) e o
  **prazo do grupo** (contagem regressiva ancorada na reserva mais próxima).
- Suporte a **parcial**: se parte dos serviços foi aceita e parte não, "pagar o
  aceito" cancela o restante (com aviso claro de quais serviços saem).

---

## 4. Reaproveitamento (o que NÃO muda)
- `allocateCents`, `buildDisbursements`, `createPixPaymentSplit` — usados como
  estão; só chegam mais recebedores.
- Índices únicos de idempotência por perna (migration 046) — já cobrem os
  lançamentos de todas as reservas do grupo.
- `ensurePaymentDeadlineAndNotify` / `cancel_overdue_leg_bookings` (048) —
  continuam por reserva; a camada de grupo só orquestra a notificação e o
  disparo do pagamento único.

---

## 5. Casos de borda
- **Serviços com horários diferentes:** prazo do grupo = o mais cedo.
- **Aceite misto** (um serviço aceito, outro sem coop): o cliente paga o
  subconjunto aceito; os sem coop são cancelados no checkout do grupo.
- **Uma coop em vários serviços:** os disbursements agregam por `operator_id` →
  uma fatia só por coop.
- **Flag OFF:** pagamento único sem split (soma os totais). Sem regressão.
- **Falha parcial ao criar as N reservas:** `cart-request` deve ser atômico
  (ou tudo, ou nada) para não deixar grupo meia-boca.
- **Cartão em grupo multi-coop:** mantém a restrição atual (cartão só single;
  multi-coop = PIX split) até validar cartão split no MP.

---

## 6. Plano de implementação (fases)
1. **Migration 049** — `order_group_id` em bookings/payments + índices.
2. **API — criação** — `POST /payments/cart-request` (N reservas + grupo).
3. **Frontend** — "Solicitar tudo" usa o `cart-request`; carrinho mostra grupo.
4. **API — pagamento do grupo** — `intent` aceitando `order_group_id`, agregando
   recebedores; `checkout-accepted` de grupo; webhook marcando todas paid.
5. **Frontend — pagar tudo** — botão único + prazo do grupo + parcial.
6. **Auto-cancel/notificação de grupo** — orquestração no nível do grupo.
7. **Testes** (com passeio de R$1,00): 1 serviço → grupo de 2 serviços 1 coop →
   grupo 2 serviços 2 coops (split) → parcial → auto-cancel.

---

## 7. Riscos / decisões em aberto
- **Atomicidade do `cart-request`** (transação para as N reservas).
- **Split de cartão multi-coop** ainda não validado (mantém PIX-only p/ multi).
- **UX do parcial em grupo** (deixar claro o que será cancelado ao pagar só o
  aceito) — a mesma lógica do R3 por reserva, agora somada.
- Validar o **split real do MP** (conta marketplace) antes de expor multi-coop.
