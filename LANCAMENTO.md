# 🚀 Guia de Lançamento — Giro Jeri

Passo a passo do que falta para colocar a plataforma no ar.
O código já está pronto — os itens abaixo são configurações externas que só o dono da conta pode fazer.

---

## 1. Banco de dados (Supabase) — OBRIGATÓRIO

Abra o **SQL Editor** do Supabase e execute o **conteúdo** de cada arquivo abaixo, nesta ordem
(todos são idempotentes — pode rodar de novo sem medo se não lembrar quais já rodou):

| Ordem | Arquivo | O que cria |
|-------|---------|-----------|
| 1 | `supabase/migrations/016_feed_posts.sql` | Tabela do feed de eventos |
| 2 | `supabase/migrations/017_establishments_and_promos.sql` | Tabela de estabelecimentos + promoções |
| 3 | `supabase/migrations/018_establishments_seed.sql` | Os 90 estabelecimentos do guia |
| 4 | `supabase/migrations/019_engagement.sql` | Curtidas, comentários e avaliações |
| 5 | `supabase/migrations/020_catalogo_real_jericoacoara.sql` | Catálogo real: passeios, transfers e preços (requer a 005 já aplicada) |
| 6 | `supabase/migrations/021_nupay_payments.sql` | NuPay como opção de pagamento + configurações |
| 7 | `supabase/migrations/022_nupay_official_credentials.sql` | Compatibilidade com a configuração NuPay anterior |
| 8 | `supabase/migrations/023_nupay_sessions_hardening.sql` | Sessões NuPay, idempotência e finalização atômica |

> ⚠️ Cole o **conteúdo do arquivo** (o SQL), não o nome do arquivo.

---

## 2. Pagamentos reais (Mercado Pago) — OBRIGATÓRIO

1. Acesse [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) → **Suas integrações** → crie uma aplicação.
2. Copie o **Access Token de PRODUÇÃO** (começa com `APP_USR-`).
3. No painel do **Render** → serviço `giro-jeri-api` → **Environment**, adicione:
   - `MERCADO_PAGO_ACCESS_TOKEN` = o token copiado
4. Ainda no Mercado Pago, em **Webhooks**, configure:
   - URL: `https://giro-jeri-api.onrender.com/api/payments/webhook` *(confirme a URL do seu serviço no Render)*
   - Evento: **Pagamentos**
   - Copie a **Assinatura secreta** e adicione no Render: `MERCADO_PAGO_WEBHOOK_SECRET`
5. No **painel admin** do Giro Jeri → **Configurações** → mude o gateway de `manual`/`test` para `mercado_pago`.
6. Faça uma reserva de teste com valor baixo (ex.: R$ 1,00) e pague o PIX de verdade para validar.

---

## 3. E-mail de confirmação (Resend) — OBRIGATÓRIO

1. Crie conta grátis em [resend.com](https://resend.com) (3.000 e-mails/mês grátis).
2. Gere uma **API Key** e adicione no Render: `RESEND_API_KEY`.
3. Pronto — o e-mail de confirmação de reserva já está programado e dispara sozinho quando o pagamento é aprovado.
4. *(Depois, opcional)*: verifique seu domínio no Resend e troque `EMAIL_FROM` no Render para `Giro Jeri <noreply@seudominio.com.br>` — sai do remetente genérico.

> Sem a chave, o app funciona normalmente — só não envia e-mails.

---

## 3.1. NuPay / Nubank — OPCIONAL

A integração usa **Sessões NuPay** e começa oculta e desabilitada. Não existe
aprovação mock em runtime. Consulte o roteiro completo em `docs/NUPAY.md`.

Para usar NuPay real:

1. Solicite no onboarding o contrato de **Sessões NuPay**.
2. Configure no secret manager do Render:
   - `API_PUBLIC_URL`
   - `NUPAY_ENV=sandbox`
   - `NUPAY_APP_KEY`
   - `NUPAY_APP_TOKEN`
   - `NUPAY_ENABLED=false`
3. Cadastre as URLs HTTPS de retorno e callbacks indicadas em `docs/NUPAY.md`.
4. Execute o roteiro completo de sandbox: aprovação, recusa, expiração,
   cancelamento, concorrência de callbacks e estorno.
5. Depois da homologação, altere `NUPAY_ENABLED=true` no Render e habilite NuPay
   em **Configurações → Pagamentos** no painel admin.

> App Key e App Token nunca devem ser gravados no banco ou no painel admin.

---

## 4. Estabelecimentos próximos (Geoapify) — OPCIONAL

1. Crie conta grátis em [myprojects.geoapify.com](https://myprojects.geoapify.com) (3.000 consultas/dia grátis).
2. Copie a API Key e adicione no Render: `GEOAPIFY_API_KEY`.
3. A aba "Descubra a Vila" passa a mostrar também lugares do OpenStreetMap perto do turista.

---

## 5. Fotos dos estabelecimentos — RECOMENDADO

No **painel admin** → **Estabelecimentos** → edite cada um e clique em **Enviar foto**.
Dica: comece pelos marcados como **Destaque** e pelos mais conhecidos (são os mais vistos).

---

## 6. Domínio próprio — RECOMENDADO (pode lançar sem)

1. Registre um domínio (ex.: `girojeri.com.br` no Registro.br, ~R$ 40/ano).
2. No GitHub → repositório → **Settings → Pages → Custom domain** → informe o domínio e siga as instruções de DNS.
3. Depois atualize no Render: `TURISTA_URL`, `COOP_URL` e `ADMIN_URL` com o novo domínio (senão o CORS bloqueia).

---

## 7. Teste final ponta a ponta — OBRIGATÓRIO

Faça este roteiro completo **em produção** antes de divulgar:

- [ ] Criar uma conta nova (e-mail real)
- [ ] Fazer login e completar o perfil (foto + capa)
- [ ] Abrir um passeio, escolher data/veículo e reservar
- [ ] Pagar o PIX real (valor baixo)
- [ ] Conferir: status muda para **confirmada** + e-mail de confirmação chega
- [ ] Ver a reserva em **Minhas Reservas**
- [ ] No painel cooperativa: a reserva aparece para despacho
- [ ] Na aba **Descubra a Vila**: curtir um post, comentar e avaliar um estabelecimento
- [ ] Testar "Esqueci minha senha"
- [ ] Abrir `/termos` e `/privacidade`

---

## Resumo das variáveis no Render

| Variável | Status | Onde conseguir |
|----------|--------|----------------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ já configurada | — |
| `MERCADO_PAGO_ACCESS_TOKEN` | ⬜ adicionar | mercadopago.com.br/developers |
| `MERCADO_PAGO_WEBHOOK_SECRET` | ⬜ adicionar | MP → Webhooks → Assinatura secreta |
| `RESEND_API_KEY` | ⬜ adicionar | resend.com |
| `EMAIL_FROM` | ⬜ opcional | após verificar domínio no Resend |
| `GEOAPIFY_API_KEY` | ⬜ opcional | myprojects.geoapify.com |

---

## Observação jurídica

As páginas de **Termos de Uso** e **Política de Privacidade** (`/termos` e `/privacidade`) foram
escritas como ponto de partida realista para a operação (intermediação, cancelamento 24h/72h,
LGPD). **Recomendo validar com um advogado** antes de escalar a operação — principalmente as
regras de cancelamento/reembolso, que precisam bater com o combinado com as cooperativas.
