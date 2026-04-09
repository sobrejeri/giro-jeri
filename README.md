# Giro Jeri 🏄

Plataforma digital de reservas para passeios e transfers em Jericoacoara e outras regiões litorâneas do Brasil.

---

## Estrutura do projeto

```
giro-jeri/
├── packages/
│   └── api/                    # Backend Node.js + Express
│       ├── src/
│       │   ├── index.js        # Entry point
│       │   ├── supabase.js     # Cliente Supabase (service role)
│       │   ├── middleware/
│       │   │   ├── auth.js     # JWT + validação de roles
│       │   │   └── errorHandler.js
│       │   ├── routes/
│       │   │   ├── auth.js         # Registro, login, perfil
│       │   │   ├── tours.js        # Passeios, veículos, cálculo
│       │   │   ├── transfers.js    # Transfers + cotações
│       │   │   ├── bookings.js     # Reservas
│       │   │   ├── payments.js     # Pagamentos + webhook
│       │   │   ├── regions.js      # Regiões
│       │   │   └── admin.js        # Dashboard admin + operação
│       │   └── services/
│       │       └── priceEngine.js  # Motor de preços
│       ├── .env.example
│       └── package.json
└── supabase/
    └── migrations/
        ├── 001_schema_completo.sql     # Schema base (30 tabelas)
        └── 002_locations_and_quotes.sql # Localização + cotações
```

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 18+ + Express |
| Banco de dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth (JWT) |
| Pagamentos | Mercado Pago |
| Localização | Google Maps Platform |
| Deploy API | Railway ou Render |

---

## Configuração inicial

### 1. Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Conta no [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
- Chave da [Google Maps Platform](https://console.cloud.google.com) com Places API habilitada

### 2. Banco de dados

1. Crie um projeto no Supabase
2. Vá em **SQL Editor**
3. Execute os arquivos de migration em ordem:
   ```
   supabase/migrations/001_schema_completo.sql
   supabase/migrations/002_locations_and_quotes.sql
   ```

### 3. Variáveis de ambiente

```bash
cp packages/api/.env.example packages/api/.env
```

Edite `packages/api/.env` com suas credenciais:

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key

PORT=3001
NODE_ENV=development

TURISTA_URL=http://localhost:5173
COOP_URL=http://localhost:5174
ADMIN_URL=http://localhost:5175

GOOGLE_MAPS_API_KEY=sua_chave_google_maps
MERCADO_PAGO_ACCESS_TOKEN=seu_token_mp
MERCADO_PAGO_WEBHOOK_SECRET=seu_webhook_secret
```

### 4. Instalar e rodar

```bash
npm install
npm run dev
```

A API sobe em `http://localhost:3001`.

Teste: `http://localhost:3001/health`

---

## Criar usuário admin

Depois de criar o projeto no Supabase:

1. Vá em **Authentication → Users → Add user**
2. Crie um usuário com email e senha
3. No **SQL Editor**, execute:

```sql
UPDATE users SET user_type = 'admin' WHERE email = 'seu@email.com';
```

---

## Principais endpoints

### Públicos
```
GET  /api/regions
GET  /api/tours?region_id=...
GET  /api/tours/:id
GET  /api/transfers?region_id=...
GET  /api/transfers/routes
```

### Autenticados
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me

POST /api/tours/:id/calculate         # Calcula preço antes de reservar
POST /api/tours/:id/suggest-vehicles  # Sugestão inteligente de veículos

POST /api/transfers/calculate         # Preço de rota tabelada
POST /api/transfers/quotes            # Solicitar cotação (rota livre)
POST /api/transfers/quotes/:id/accept # Aceitar cotação
POST /api/transfers/quotes/:id/reject # Recusar cotação

POST /api/bookings                    # Criar reserva
GET  /api/bookings                    # Listar reservas
GET  /api/bookings/:id                # Detalhe da reserva
POST /api/bookings/:id/cancel         # Cancelar

POST /api/payments/intent             # Criar intenção de pagamento
POST /api/payments/webhook            # Webhook do gateway
```

### Operação
```
GET  /api/admin/operational           # Painel kanban
POST /api/admin/operational/:id/assign  # Atribuir motorista/guia
GET  /api/transfers/quotes/pending    # Cotações aguardando preço
PATCH /api/transfers/quotes/:id/quote # Definir preço da cotação
PATCH /api/bookings/:id/status        # Atualizar status operacional
```

### Admin
```
GET  /api/admin/stats
GET  /api/admin/users
GET  /api/admin/financial
GET  /api/admin/settings
PUT  /api/admin/settings/:key
GET  /api/admin/audit-logs
```

---

## Motor de preços

O backend é a **única fonte de verdade** para cálculos. O frontend nunca define preços.

### Passeio privativo
```
Subtotal = Σ (preço do veículo × quantidade)
Temporada = subtotal × 10%  (julho a janeiro)
Total = subtotal + temporada - desconto_cupom
```

### Passeio compartilhado
```
Subtotal = preço_por_pessoa × quantidade_de_pessoas
Temporada = subtotal × 10%  (julho a janeiro)
Total = subtotal + temporada - desconto_cupom
```

### Transfer rota tabelada
```
Subtotal = preço_fixo_da_rota
Temporada = subtotal × 10%  (julho a janeiro)
Total = subtotal + temporada - desconto_cupom
```

### Transfer cotação livre
```
Preço definido manualmente pela cooperativa após solicitação.
Fluxo: solicitar → cooperativa cota → cliente aceita/recusa → pagar
```

---

## Regras de negócio importantes

| Regra | Valor | Configurável |
|-------|-------|-------------|
| Alta temporada | Julho a janeiro (+10%) | `high_season_rules` |
| Antecedência mínima transfer | 4 horas | `transfer_min_advance_hours` |
| Prazo para aceitar cotação | 2 horas | `quote_expiry_hours` |
| Cancelamento gratuito passeio | até 24h antes | `cancellation_tour_hours` |
| Cancelamento gratuito transfer | até 72h antes | `cancellation_transfer_days` |
| Taxa da plataforma | 7% | `platform_fee_percent` |

---

## Perfis de usuário

| Perfil | Acesso |
|--------|--------|
| `tourist` | App turista — reservas, pagamentos |
| `operator` | Dashboard cooperativa — operação, despacho |
| `agency` | Visão de reservas e comissões |
| `admin` | Acesso total |
| `finance` | Módulo financeiro |

---

## Roadmap

### MVP (atual)
- [x] Schema completo do banco de dados
- [x] API com motor de preços
- [x] Fluxo de cotação de transfer
- [x] Localização via Google Maps
- [x] Webhook de pagamento
- [ ] App do turista (React mobile-first)
- [ ] Dashboard da cooperativa
- [ ] Dashboard administrativo
- [ ] Integração Mercado Pago
- [ ] Notificações WhatsApp

### Fase 2
- [ ] Programa de afiliados
- [ ] Cupons inteligentes
- [ ] Multi-região completo
- [ ] CRM e remarketing
- [ ] App mobile nativo
