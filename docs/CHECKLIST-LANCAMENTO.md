# Checklist de lançamento — Giro Jeri / Turiva

Meta: **plataforma operacional até o início de agosto/2026.**
Este é o mapa único do que falta testar, corrigir e decidir — atualize o
status aqui a cada rodada (os agentes também leem este arquivo).

Legenda: ✅ pronto e validado · 🟡 pronto, falta validar em produção ·
🔴 pendente/bloqueador · ⚪ opcional (pode lançar sem)

---

## 0. BLOQUEADORES DE INFRA (fazer primeiro — sem isso nada anda)

| # | Item | Status | Ação |
|---|------|--------|------|
| 0.1 | **Migrations 055 e 056 no Supabase** (afiliados + chave PIX) | 🔴 | Colar os 2 arquivos no SQL Editor. Sem isso: ativar afiliado e salvar PIX falham |
| 0.2 | **Migrations 049–054 conferidas** (advance/grupo/exclusivo/dedup/RLS/partner) | 🟡 | Rodar `SELECT` de verificação no fim de cada arquivo; qualquer erro = rodar o arquivo |
| 0.3 | **Motor de pernas OFF** (decisão: reserva inteira, 1 coop) | 🟡 | Confirmar `booking_legs_engine_enabled = 'false'` em system_settings + limpar pernas de teste |
| 0.4 | **Rotacionar SUPABASE_SERVICE_ROLE_KEY** (exposta em chat) | 🔴 | Supabase → Settings → API → rotate; atualizar no Render (variável do serviço, não do env-group) e conferir no log `role=service_role` |
| 0.5 | Deploy Render acompanha GFBFR | ✅ | Guard de boot valida a chave; /health checa Supabase |
| 0.6 | **Ativação por código no WhatsApp** (cadastro) | 🟡 | Código pronto (12/07). Ligar: `SIGNUP_REQUIRE_VERIFICATION=true` no Render **+ migration 023 aplicada** (phone_e164/OTP) **+ envio de WhatsApp funcionando** (testar 1 cadastro real). Sem a env, cadastro segue direto como hoje |

## 1. DINHEIRO (o coração — validar com R$ 1,00 real)

| # | Item | Status | Como testar |
|---|------|--------|-------------|
| 1.1 | PIX reserva única (solicitar → aceitar → pagar) | 🟡 | Passeio de R$ 1: turista solicita, coop aceita, pagar PIX real, conferir `paid` + notificações + ledger |
| 1.2 | Cartão reserva única | 🟡 | Mesmo fluxo com cartão |
| 1.3 | Split para conta MP do operador | 🔴 | Coop com MP conectado: conferir se o valor cai na conta DELA (application_fee) e não na plataforma |
| 1.4 | **Pagamento único de grupo (carrinho)** — Fatia B | 🔴 | Backend pronto e NÃO deployado no fluxo do front ("Pagar tudo" não existe ainda). Decidir: lançar com pagamento por reserva (funciona hoje) e grupo depois? |
| 1.5 | Expiração de PIX + repagamento | 🟡 | Deixar PIX vencer e pagar de novo |
| 1.6 | Reembolso/cancelamento pós-pagamento | 🔴 | Não há fluxo de estorno na plataforma — definir processo manual p/ agosto |
| 1.7 | Cupom aplicado de verdade no valor pago | 🟡 | Reserva com cupom % e com cupom fixo; conferir desconto no MP e `coupon_redemptions` |
| 1.8 | Comissão de afiliado nasce ao pagar | 🟡 | Reserva indicada paga → comissão pendente no admin + notificação |

## 2. ADMIN (auditoria 12/07 — correções aplicadas)

| # | Item | Status | Nota |
|---|------|--------|------|
| 2.1 | Todas as 16 páginas abrem sem crash | ✅ | Testado no navegador com dados vazios (12/07) |
| 2.1b | **Turista (14 págs) e Operador (9 págs) sem crash** | ✅ | Varredura 12/07, logado e deslogado; chamadas × rotas dos 3 apps conferidas |
| 2.2 | Todas as chamadas têm rota na API | ✅ | Cruzamento cliente×servidor 12/07; `getTour` morto removido |
| 2.3 | **Stories: escrita estava SEM auth** | ✅ | Corrigido 12/07 — criar/editar/apagar destaque agora exige admin |
| 2.4 | Usuários: criar coop (CNPJ), liberar frota, reset senha | 🟡 | Testar em produção com usuário real |
| 2.5 | Catálogo: criar/editar passeio c/ foto, cutoff, antecedência, exclusivo | 🟡 | Conferir que o app do turista reflete cada campo |
| 2.6 | Preços: regra veículo×passeio (dedup 052) | 🟡 | Tentar criar regra duplicada — deve bloquear |
| 2.7 | Cupons: criar e usar no app | 🟡 | Fluxo inteiro com cupom % e fixo |
| 2.8 | Afiliados: taxa, pendências, chave PIX, marcar pago | 🟡 | Depende de 0.1 |
| 2.9 | Temporada/feriados refletem no preço | 🟡 | Alta temporada colore calendário e soma no total |
| 2.10 | Reservas: modo admin (banner roxo), reserva manual | 🟡 | |
| 2.11 | Financeiro: gráfico diário, ledger | 🟡 | Conferir após pagamentos reais (1.1) |
| 2.12 | Feed/Stories/Estabelecimentos: publicar, editar, apagar | 🟡 | |

## 3. TURISTA (app principal)

| # | Item | Status | Nota |
|---|------|--------|------|
| 3.1 | Cadastro/login + ativação por código no WhatsApp | 🟡 | Ver 0.6; testar também recuperar senha |
| 3.2 | Home dinâmica por região | ✅ | |
| 3.3 | Passeios: pré-seleção → carrinho; tradicionais × exclusivos | 🟡 | |
| 3.4 | Transfers: rota definida → carrinho; personalizado → cotação | 🟡 | |
| 3.5 | Carrinho ML: Editar obrigatório, capacidade, antecedência, cupom | ✅ | Testado em navegador; validar no celular real |
| 3.6 | Solicitar tudo → N reservas em grupo | 🟡 | |
| 3.7 | Minhas Reservas: acompanhar, pagar após aceite | 🟡 | |
| 3.8 | Afiliado: ativar, link `/giro-jeri/a/CÓD`, painel, chave PIX | 🟡 | Depende de 0.1; link corrigido 12/07 (base path) |
| 3.9 | Link de operador `/c/slug` (venda direta) | 🟡 | |
| 3.10 | Telefone com DDI internacional (dropdown bandeira) | ✅ | Perfil + cadastro |
| 3.11 | i18n (pt/en/es) nas telas novas | ⚪ | Carrinho/afiliado estão só em pt — decidir se lança assim |
| 3.12 | PWA: instalar, ícone, offline básico | 🟡 | |

## 4. OPERADOR

| # | Item | Status | Nota |
|---|------|--------|------|
| 4.1 | Login por CNPJ + veículos liberados pelo admin | ✅ | Validado em produção (etapa 1) |
| 4.2 | Fila: só vê o que pode executar (passeio E transfer) | 🟡 | |
| 4.3 | Aceitar reserva inteira → cliente notificado → pagar | 🟡 | Fluxo-chave do lançamento |
| 4.4 | Conectar Mercado Pago (OAuth) + receber split | 🔴 | = 1.3 |
| 4.5 | Link de vendas próprio (Perfil) | 🟡 | |
| 4.6 | Cotação de translado personalizado (responder preço) | 🟡 | |

## 5. LIMPEZA / ROBUSTEZ (pré-lançamento)

| # | Item | Status |
|---|------|--------|
| 5.1 | Telas mortas: Register.jsx legado REMOVIDO 12/07; falta avaliar wizard antigo do carrinho | 🟡 |
| 5.2 | Varredura de auth nos routers: só público o que deve ser público | ✅ 12/07 |
| 5.3 | Rate-limit em rotas sensíveis — /affiliate/activate limitado 12/07 | ✅ |
| 5.4 | Notificações WhatsApp: templates aprovados e disparando | 🟡 |
| 5.5 | E-mails transacionais (confirmação) chegando (spam?) | 🟡 |
| 5.6 | Backup/retention do Supabase configurado | 🔴 |
| 5.7 | Domínio próprio (turiva.com.br) no Pages | ⚪ (necessário p/ tráfego pago) |

## 6. PÓS-LANÇAMENTO (agosto+, não bloqueia)

- Pagamento único do grupo ("Pagar tudo") — Fatia B já pronta no backend
- Motor de pernas ON (multi-coop por reserva) quando o split real estiver validado
- Tráfego pago: Pixel Meta + feed de catálogo + UTMs
- i18n completo das telas novas
- Estorno/reembolso pelo painel

---

## Roteiro sugerido das próximas sessões

1. **Infra** (30 min): itens 0.1–0.4 — você no Supabase/Render, com o agente conferindo.
2. **Rodada de R$ 1** (1 sessão): itens 1.1, 1.2, 1.3, 1.7, 1.8 de ponta a ponta
   com celular na mão; corrigir na hora o que travar.
3. **Rodada admin real** (1 sessão): 2.4–2.12 com dados reais criados na hora.
4. **Rodada turista+coop** (1 sessão): 3.x e 4.x cruzados (turista pede, coop aceita).
5. **Limpeza final** (meia sessão): 5.x e decisão dos ⚪.
