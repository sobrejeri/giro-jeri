# REPASSES — Fila de liberação, liberação manual e conciliação

Branch de produção: `claude/giro-jeri-platform-GFBFR`. Base: `/home/user/giro-jeri`.
Relatório de entrega da reorganização da aba **Repasses** (Partes 1–5).

Este documento descreve o que foi implementado, o que cada gateway permite/não
permite neste modelo e as limitações honestas. É a referência da feature — não
um passo a passo de código.

---

## 0. Modelo de dinheiro em vigor

A plataforma **recebe 100%** de cada venda (migration `079`) e **paga o operador
por fora** (PIX/banco), registrando a baixa na aba Repasses **depois** que o
serviço é concluído. O split no ato (dividir a cobrança automaticamente entre
plataforma e operador) está **desligado** por decisão de negócio (migration
`090`, flag `payment_split_single_operator='false'`), para não depender de saldo
e transferência de gateway.

> **Liberar um repasse NÃO transfere dinheiro pelo gateway.** Registra que a
> plataforma fez (ou vai fazer) um pagamento **manual** por fora. Fingir uma
> transferência que não existe seria mentir para a conferência.

Split direto **histórico** (reservas antigas, quando o split estava ligado)
continua reconhecido: quando um pagamento tem `split_operator_id` = operador da
reserva, aquele operador **já recebeu na conta dele** e o repasse não é gerado
nem pode ser liberado de novo (migration `087`, `services/payouts.js`).

---

## 1. Estados de uma reserva na fila (`montarLinhaFila`)

Regra única em `packages/api/src/services/payoutQueue.js` — usada pela fila, pelos
indicadores e pela liberação, para não haver duas cópias da mesma decisão.

| Situação | Quando | Elegível p/ liberar |
|---|---|:---:|
| `pronto_para_liberar` | concluída **com** `completed_at`, cliente pagou, comissão **pendente**, sem split ao operador | ✅ |
| `bloqueado` | reserva `cancelled` / `refunded` / `disputed` | ❌ |
| `conciliacao` | concluída **sem** `completed_at`, **ou** sem repasse calculado | ❌ |
| `repassado_gateway` | operador já recebeu por split no ato (histórico) | ❌ |
| `aguardando_pagamento` | concluída, mas sem pagamento aprovado do cliente | ❌ |
| `pago` | comissão já baixada | ❌ |
| `cancelado` | comissão cancelada | ❌ |

Ordenação da fila: por **`completed_at` crescente** (conclusão mais antiga
primeiro), com desempate estável por `id`. Datas guardadas em **UTC** e exibidas
em **America/Fortaleza**. Concluídas **sem** `completed_at` saem da fila ordenada
e vão para a visão de conciliação (`?conciliacao=1`) — não se inventa uma data.

---

## 2. Endpoints (todos `requireAdmin`)

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/admin/payouts/fila` | Fila paginada/ordenada no servidor. Read-only. |
| GET | `/api/admin/payouts/indicadores` | Cards da aba (cada reserva num balde só, sem valor duplicado). |
| POST | `/api/admin/payouts/liberar` | Libera 1 ou N repasses (revalidado, idempotente, auditado). |
| GET | `/api/admin/payouts/conciliacao` | Divergências entre recebido × devido/pago. Read-only, sem gateway. |
| GET · PUT · POST | `/api/admin/payouts` · `/:id` · `/pay-all` | Aba "Operadores" (legado — ver §6). |

### 2.1 Liberação — as três garantias

1. **Revalidação no servidor.** A rota **reconstrói** a linha da fila
   (`montarLinhaFila`) para cada `booking_id` recebido e só baixa o que está
   `elegivel_liberar` **agora** — não confia no estado que a tela enviou. Entre
   carregar a fila e clicar, a reserva pode ter sido cancelada/estornada ou o
   repasse já baixado por outro admin. O que não passa vira `ignorados` com o
   motivo.
2. **Idempotência.** A baixa é atômica: `UPDATE booking_payouts SET status='paid'
   … WHERE id IN (…) AND status='pending'` com `RETURNING`. Só as linhas que
   **realmente transitaram** voltam. Dois cliques (ou dois admins) concorrentes
   baixam **uma vez só**; o resto cai em "já liberado". Não paga em dobro.
3. **Auditoria.** Cada baixa grava em `audit_logs`: quem liberou, quando, quanto,
   para quem, gateway, `lote_id` do clique e `metodo='manual_externo'`. A falha
   do insert de auditoria é **conferida** (`auditoria_ok:false`), não engolida.

---

## 3. Conciliação (`conciliarReserva`)

Cruza o que a plataforma **recebeu** (pagamentos `approved`) com o que ela
**deve/pagou** (`booking_payouts`). **Só leitura, sem chamada a gateway** — no
modelo manual não há saldo nem transferência de gateway para conferir; a rota
confere o que está no banco. Janela limitada às reservas mais recentes (até 3000).

| Tipo | Gravidade | Significado |
|---|---|---|
| `pago_sem_recebimento` | risco de dinheiro | repasse pago, mas o cliente nunca teve pagamento aprovado |
| `pago_reserva_revertida` | risco de dinheiro | repasse pago numa reserva estornada/cancelada/contestada |
| `repasse_acima_do_recebido` | risco de dinheiro | soma dos repasses > valor recebido do cliente |
| `split_e_pendente` | risco de dinheiro | operador recebeu por split **e** há comissão pendente (liberar pagaria 2x) |
| `aprovado_sem_repasse` | operacional | concluída e paga, sem repasse calculado → rodar "Gerar repasses faltantes" |
| `concluido_sem_data` | operacional | concluída sem `completed_at` → rodar backfill (migration `091`) |

---

## 4. O que cada gateway permite — HONESTO

Esta conta **não** usa nenhuma capacidade de payout automático dos gateways. O
repasse é sempre manual. A tabela registra o que existe, para não presumir que
"dá para automatizar" quando não dá nesta configuração.

| Recurso | Mercado Pago | Pagar.me | Usado aqui? |
|---|---|---|---|
| Cobrança de cartão/PIX | ✅ | ✅ (cartão inline tokenizado) | ✅ |
| Split no ato (marketplace) | ✅ `application_fee` | ✅ regras de split | **Desligado** (090) |
| Transferência avulsa para terceiro (payout) | PIX/disbursements | Transfers API | ❌ não integrado |
| Saldo retido "até concluir o serviço" por reserva | ❌ não nativo | ❌ não nativo (antecipação/saque é **por recebedor**, não por reserva) | ❌ |

**Conclusões honestas:**
- **Não existe** um mecanismo nativo, em nenhum dos dois, de "segurar o valor
  desta reserva até o serviço acabar e então soltar". A retenção por conclusão é
  **lógica da plataforma** (a fila), não um recurso de gateway.
- Pagar.me **≠** Mercado Pago: antecipação/saque no Pagar.me é configuração **do
  recebedor**, não algo que se liga por cobrança. Nada disso foi alterado.
- A liberação da fila é **registro de pagamento manual**. Automatizar de verdade
  exigiria integrar a Transfers API (Pagar.me) ou disbursements (MP) e tratar
  saldo, KYC do recebedor e falhas de transferência — **fora do escopo** deste
  modelo e não implementado (nada de endpoint inventado).

---

## 5. Restrições e decisões deliberadas

- **Acesso:** todas as rotas de repasse são `requireAdmin`. Não há permissão
  financeira granular no sistema (o modelo é por `user_type`); "admin" é o papel
  mais restrito disponível para esta ação. Uma permissão financeira separada
  seria outra feature (coluna/tabela de permissão), não presumida aqui.
- **Nada de transferência real para testar.** A liberação nunca chama gateway.
- **Não se inventam valores nem datas:** `completed_at` vem da auditoria real
  (migration `091`); reservas sem esse registro ficam em conciliação.
- **Dados bancários:** a chave PIX é exibida para o admin poder pagar (com botão
  de copiar, como já era na aba Operadores) — é o destino do PIX manual, não
  dado de conta a mascarar.

---

## 6. Notas operacionais / dívidas conhecidas

1. **Migrations a aplicar no Supabase** para a fila funcionar em produção:
   `080` (tabela `booking_payouts`), `090` (desliga split), `091` (backfill de
   `completed_at` + índice). Sem elas os endpoints degradam com um aviso, não
   quebram.
2. **Auditoria de admin falhando em silêncio (achado).** Vários `audit_logs` do
   admin usam `action_type` que **não existe** no enum `audit_action_type`
   (ex.: `reconcile_payments`, `register_recipient`, `import_auth_user`,
   `reset_password`). Como o supabase-js devolve `{error}` sem lançar e esses
   trechos ignoram o erro, **essas auditorias nunca foram gravadas**. A liberação
   de repasse contorna isso usando `manual_override` (valor válido) + discriminador
   `evento='payout_release'` no JSON, e **confere** o erro do insert. Corrigir as
   demais (ou estender o enum com uma migration) é trabalho à parte.
3. **Aba "Operadores" (legado).** `pay-all` e `PUT /:id` **não** revalidam
   conclusão/pagamento antes de baixar. Continuam para o acerto por destinatário
   (um PIX cobrindo várias reservas), mas a fila (§2.1) é o caminho revalidado e
   auditado. Migrar a aba Operadores para o mesmo motor seria um passo seguinte.

---

## 7. Testes

`packages/api/test/repasseLiberacao.test.js` (20 casos):
- `montarLinhaFila`: elegibilidade em todos os estados (pronto, bloqueado por
  reversão, sem data, sem pagamento, split, comissão paga/cancelada, sem repasse).
- `conciliarReserva`: cada divergência + o não-falso-positivo do split sem comissão.
- Garantias da rota por leitura da fonte: idempotência (`WHERE status=pending`),
  revalidação (`montarLinhaFila`), auditoria com enum válido + discriminador, e
  conferência do erro de auditoria.
