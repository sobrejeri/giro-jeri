# Giro Jeri — Bubble No-Code Blueprint

**Platform:** Jericoacoara Tourism & Transfer Management  
**Repository:** `/home/user/giro-jeri`  
**Last Updated:** May 8, 2026  
**Purpose:** Technical inventory for Bubble.io recreation

---

## 1. Visão Geral

### Platform Mission
Giro Jeri is a tourism and transportation coordination platform for Jericoacoara, CE, Brazil. It connects three user audiences in a two-sided marketplace:

- **Turista (Tourist):** Browse, book, and pay for tours and transfers. Track reservations in real-time.
- **Operador (Driver Cooperative):** Accept bookings, manage vehicle availability, quote custom routes, track earnings.
- **Admin:** Manage catalog (tours/transfers/vehicles/pricing), financial ledger, seasons/holidays, users, operational dashboard.

### User Flows

**Turista:**
1. Browse tours/transfers by location (GPS or region picker)
2. Select service → pick vehicles/dates/times
3. System calculates price (base + high season ± coupon)
4. Book & pay (Mercado Pago webhook)
5. Receive booking code, track status → review post-service

**Operador:**
1. Accept auto-dispatch bookings (system-assigned)
2. Quote custom transfer routes (Maps origin→destination)
3. Turista accepts/rejects quote within 2h
4. If accepted, turista pays, booking created, driver assigned
5. Execute service, mark operational status, receive commission

**Admin:**
1. Manage catalog: tours, transfers, vehicles, pricing rules
2. Set high-season rules (e.g., July–Jan +10%)
3. Create/manage coupons, pricing overrides
4. View financial dashboard: revenue, fees, commissions
5. Manage user roles and platform settings
6. Operational kanban: dispatch, assign, track

### Architecture (Text Diagram)

```
┌─────────────────────────────────────────────────────────────┐
│                   3 Vite/React SPAs                         │
├─────────────────────┬──────────────────┬────────────────────┤
│  turista (5173)     │  operador      │  admin (5175)      │
│  - Browse           │  (5174)           │  - Catalog CRUD    │
│  - Book             │  - Quote mgmt     │  - Pricing         │
│  - Pay              │  - Dispatch       │  - Financial       │
│  - Track            │  - Earnings       │  - Users           │
└──────────┬──────────┴──────────┬────────┴────────────┬───────┘
           │                     │                    │
           └─────────────────────┼────────────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Express.js API (3001)  │
                    │   - Auth (Supabase)      │
                    │   - Bookings CRUD        │
                    │   - Pricing Engine       │
                    │   - Payments (webhook)   │
                    │   - Geo filtering        │
                    └────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────▼──────────┐  ┌────────▼────────┐  ┌────────▼──────┐
    │ Supabase Auth  │  │  PostgreSQL DB  │  │ Storage       │
    │ - JWT tokens   │  │  - All tables   │  │ - Avatars     │
    │ - User mgmt    │  │  - Views        │  │ - Images      │
    │ - Session      │  │  - Triggers     │  │               │
    └────────────────┘  │  - RLS policies │  └───────────────┘
                        │  - 30 tables    │
                        └─────────────────┘

External APIs:
- Mercado Pago (payment webhook) ← payments/webhook
- Google Maps (Places, Geocoding) ← frontend autocomplete + Nominatim reverse geocode
- OpenStreetMap Nominatim (reverse geocode) ← RegionContext
- Render (API hosting)
- GitHub Pages (frontend deploy)
```

---

## 2. Banco de Dados (Supabase / PostgreSQL)

### 2.1 Enumerated Types (Custom Postgres Types)

| Type | Values |
|------|--------|
| `user_type` | 'tourist', 'agency', 'operator', 'admin', 'finance', 'affiliate' |
| `vehicle_type` | 'buggy', 'quadricycle', 'jardineira', 'hilux_4x4', 'hilux_sw4', 'utv_2', 'utv_4', 'van', 'boat', 'minibus', 'other' |
| `service_type` | 'tour', 'transfer' |
| `booking_mode` | 'private', 'shared' |
| `status_commercial` | 'draft', 'awaiting_payment', 'paid', 'payment_failed', 'cancelled', 'refunded' |
| `status_operational` | 'new', 'awaiting_dispatch', 'confirmed', 'assigned', 'en_route', 'in_progress', 'completed', 'occurrence', 'cancelled' |
| `source_channel` | 'app', 'web', 'whatsapp', 'agency_link', 'affiliate_link', 'admin_manual' |
| `payment_model` | 'full', 'deposit', 'pre_auth', 'remaining_balance' |
| `payment_method` | 'pix', 'credit_card', 'debit_card', 'manual_link' |
| `payment_status` | 'pending', 'approved', 'failed', 'expired', 'refunded', 'partially_refunded' |
| `quote_status` | 'pending_quote', 'quoted', 'accepted', 'paid', 'expired', 'rejected', 'cancelled' |
| `additional_type` | 'percentage', 'fixed' |
| `applies_to` | 'all', 'tours', 'transfers', 'selected_services' |
| `discount_type` | 'fixed', 'percentage' |
| `transfer_pricing_mode` | 'fixed_route', 'by_vehicle', 'by_distance', 'manual_quote' |
| `ledger_direction` | 'inflow', 'outflow' |
| `financial_status` | 'pending', 'scheduled', 'credited', 'paid', 'cancelled' |
| `payout_status` | 'pending', 'ready', 'paid', 'cancelled' |
| `send_status` | 'queued', 'sent', 'delivered', 'failed', 'opened' |
| `notification_channel` | 'whatsapp', 'email', 'push', 'sms', 'internal' |
| `document_type` | 'cpf', 'passport', 'rg', 'cnh', 'other' |
| `gender_type` | 'male', 'female', 'non_binary', 'prefer_not_to_say' |
| `assignment_status` | 'pending', 'assigned', 'confirmed', 'in_service', 'completed', 'issue_reported' |
| `commission_model` | 'percentage', 'fixed', 'hybrid' |
| `operator_role_type` | 'driver', 'guide', 'dispatcher', 'coordinator' |

### 2.2 Tables

#### **USERS** (30 cols)
**Purpose:** All users: tourists, operators, admins, agencies, affiliates  
**Location:** `/supabase/migrations/001_schema_completo.sql` lines 156–178

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | |
| auth_id | UUID | UNIQUE, REFERENCES auth.users(id) ON DELETE SET NULL | Link to Supabase Auth |
| full_name | VARCHAR(200) | NOT NULL | |
| email | VARCHAR(255) | UNIQUE | |
| phone | VARCHAR(30) | UNIQUE | |
| user_type | user_type | NOT NULL, DEFAULT 'tourist' | See enum |
| profile_photo_url | TEXT | | Avatar from storage |
| document_number | VARCHAR(30) | | CPF, passport, etc. |
| document_type | document_type | | cpf, passport, rg, cnh, other |
| birth_date | DATE | | |
| nationality | VARCHAR(100) | DEFAULT 'BR' | ISO 3166-1 alpha-2 |
| gender | gender_type | | Optional: male, female, non_binary, prefer_not_to_say |
| emergency_contact_name | VARCHAR(200) | | |
| emergency_contact_phone | VARCHAR(30) | | |
| preferred_region_id | UUID | FK → regions(id) | Turista's home region |
| language | VARCHAR(10) | DEFAULT 'pt-BR' | |
| is_active | BOOLEAN | DEFAULT TRUE | For account suspension |
| email_verified | BOOLEAN | DEFAULT FALSE | |
| phone_verified | BOOLEAN | DEFAULT FALSE | |
| last_login_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Auto-updated by trigger |

**Indexes:**
- `idx_users_email`, `idx_users_phone`, `idx_users_user_type`, `idx_users_is_active`, `idx_users_nationality`

**RLS:** `users_own_data` — users see/edit only their own row

---

#### **REGIONS** (11 cols)
**Purpose:** Geographic zones where platform operates (Jericoacoara, Fortaleza, etc.)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL | "Jericoacoara" |
| slug | VARCHAR(100) | UNIQUE NOT NULL | "jericoacoara" |
| description | TEXT | | |
| city | VARCHAR(100) | | "Jijoca de Jericoacoara" |
| state | VARCHAR(50) | | "Ceará" |
| country | VARCHAR(50) | DEFAULT 'Brasil' | |
| timezone | VARCHAR(50) | DEFAULT 'America/Fortaleza' | |
| currency | VARCHAR(10) | DEFAULT 'BRL' | |
| center_latitude | DECIMAL(10,7) | | Region centroid for geo-filtering |
| center_longitude | DECIMAL(10,7) | | |
| cover_image_url | TEXT | | |
| service_radius_km | DECIMAL(8,2) | | Default 100 km (migration 007) |
| is_active | BOOLEAN | DEFAULT TRUE | |
| sort_order | INT | DEFAULT 0 | Display order on home |
| created_at / updated_at | TIMESTAMPTZ | | |

**RLS:** `public_regions` — all authenticated users can read active regions

---

#### **AGENCIES** (11 cols)
**Purpose:** Corporate partners; earn commission on bookings they refer

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| owner_user_id | UUID | FK → users(id) | Agency account manager |
| region_id | UUID | FK → regions(id) | |
| name | VARCHAR(150) | NOT NULL | |
| slug | VARCHAR(150) | UNIQUE | |
| legal_name | VARCHAR(200) | | For invoicing |
| tax_document | VARCHAR(30) | | CNPJ |
| contact_phone | VARCHAR(30) | | |
| contact_email | VARCHAR(255) | | |
| logo_url | TEXT | | |
| commission_default_percent | DECIMAL(5,2) | DEFAULT 0 | % of booking total |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at / updated_at | TIMESTAMPTZ | | |

---

#### **CATEGORIES** (9 cols)
**Purpose:** Tour types: "Aventura", "Lagoa", "Sunset", "Família", "Passeio de Barco", etc.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL | "Aventura" |
| slug | VARCHAR(100) | UNIQUE NOT NULL | "aventura" |
| description | TEXT | | |
| icon | VARCHAR(100) | | "Zap", "Sun", "Waves", "Anchor" |
| color | VARCHAR(20) | | "#FF6A00" |
| category_type | VARCHAR(50) | | "tour", "transfer", "mode" |
| is_active | BOOLEAN | DEFAULT TRUE | |
| sort_order | INT | DEFAULT 0 | |
| created_at / updated_at | TIMESTAMPTZ | | |

**RLS:** `public_categories` — all can read

---

#### **TOURS** (26 cols)
**Purpose:** Experiences: buggy rides, lagoon tours, sunset, boat trips

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK NOT NULL | Which region this tour operates in |
| category_id | UUID | FK | "Buggy", "Sunset", etc. |
| name | VARCHAR(200) | NOT NULL | "Passeio de Buggy Completo" |
| slug | VARCHAR(200) | UNIQUE NOT NULL | |
| short_description | TEXT | | Tagline (1-2 sentences) |
| full_description | TEXT | | Complete details, itinerary |
| duration_hours | DECIMAL(5,2) | | e.g., 8.00 |
| meeting_instructions | TEXT | | Where/when to meet |
| includes_text | TEXT | | "Guia, água mineral, paradas para banho" |
| excludes_text | TEXT | | What's not included |
| cancellation_policy_text | TEXT | | "Gratuito até 24h antes" |
| is_private_enabled | BOOLEAN | DEFAULT TRUE | Can book whole vehicle |
| is_shared_enabled | BOOLEAN | DEFAULT FALSE | Can book per-person seats |
| shared_price_per_person | DECIMAL(10,2) | | Required if shared_enabled=TRUE |
| min_people | INT | DEFAULT 1 | Minimum group size |
| max_people | INT | | Maximum capacity |
| cover_image_url | TEXT | | Main display image |
| gallery_urls | TEXT[] | | Array of additional photos |
| highlight_badge | VARCHAR(50) | | "Mais Vendido", "Imperdível" |
| is_featured | BOOLEAN | DEFAULT FALSE | Show on homepage |
| tags | TEXT[] | | ["adventure", "family", "sunset"] |
| difficulty_level | VARCHAR(30) | | "Fácil", "Moderado", "Difícil" |
| rating_average | DECIMAL(3,2) | DEFAULT 0 | Denormalized: avg of reviews |
| rating_count | INT | DEFAULT 0 | Total review count |
| is_active | BOOLEAN | DEFAULT TRUE | |
| display_order | INT | DEFAULT 0 | Sort position |
| latitude | DECIMAL(10,7) | | Optional: tour-specific geo center (migration 008) |
| longitude | DECIMAL(10,7) | | |
| service_radius_km | DECIMAL(8,2) | | Optional override of region radius |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_tours_region`, `idx_tours_slug`, `idx_tours_is_featured`

**RLS:** `public_tours` — all can read if is_active=TRUE

---

#### **TOUR_SCHEDULES** (8 cols)
**Purpose:** Recurring departure times for each tour (e.g., "08:00 Mon–Sun")

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| tour_id | UUID | FK NOT NULL | Which tour |
| region_id | UUID | FK | Denormalized |
| schedule_name | VARCHAR(100) | NOT NULL | "Manhã", "Tarde" |
| departure_time | TIME | NOT NULL | "08:00" |
| estimated_return_time | TIME | | "16:00" |
| active_weekdays | INT[] | DEFAULT [0..6] | 0=Sun, 1=Mon, ..., 6=Sat |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at / updated_at | TIMESTAMPTZ | | |

---

#### **TRANSFERS** (11 cols)
**Purpose:** Point-to-point transport: airport runs, inter-city shuttles

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK NOT NULL | |
| name | VARCHAR(200) | NOT NULL | "Transfer Jericoacoara" |
| slug | VARCHAR(200) | UNIQUE NOT NULL | |
| origin_label | VARCHAR(200) | | e.g., "Jericoacoara" |
| destination_label | VARCHAR(200) | | e.g., "Fortaleza Airport" |
| short_description | TEXT | | |
| full_description | TEXT | | |
| base_price | DECIMAL(10,2) | DEFAULT 0 | Starting price |
| pricing_mode | transfer_pricing_mode | DEFAULT 'fixed_route' | fixed_route, by_vehicle, by_distance, manual_quote |
| baggage_rules_text | TEXT | | Luggage limits |
| cancellation_policy_text | TEXT | | |
| estimated_duration_minutes | INT | | |
| is_private_only | BOOLEAN | DEFAULT TRUE | No shared mode |
| is_active | BOOLEAN | DEFAULT TRUE | |
| display_order | INT | DEFAULT 0 | |
| latitude | DECIMAL(10,7) | | Optional (migration 008) |
| longitude | DECIMAL(10,7) | | |
| service_radius_km | DECIMAL(8,2) | | |
| created_at / updated_at | TIMESTAMPTZ | | |

**RLS:** `public_transfers` — all can read if active

---

#### **TRANSFER_ROUTES** (12 cols)
**Purpose:** Fixed-price legs: Jericoacoara → Fortaleza (R$ 800), etc.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| transfer_id | UUID | FK NOT NULL | Parent transfer service |
| origin_name | VARCHAR(200) | NOT NULL | "Jericoacoara" |
| destination_name | VARCHAR(200) | NOT NULL | "Fortaleza" |
| origin_latitude | DECIMAL(10,7) | | Geo coordinates |
| origin_longitude | DECIMAL(10,7) | | |
| destination_latitude | DECIMAL(10,7) | | |
| destination_longitude | DECIMAL(10,7) | | |
| origin_place_id | VARCHAR(300) | | Google Place ID |
| origin_place_name | VARCHAR(300) | | Google-formatted name |
| destination_place_id | VARCHAR(300) | | |
| destination_place_name | VARCHAR(300) | | |
| default_price | DECIMAL(10,2) | NOT NULL | Base cost |
| extra_stop_price | DECIMAL(10,2) | DEFAULT 0 | Per additional stop |
| night_fee | DECIMAL(10,2) | DEFAULT 0 | Late-night surcharge |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at / updated_at | TIMESTAMPTZ | | |

---

#### **VEHICLES** (14 cols)
**Purpose:** Buggy, Hilux 4x4, boat, etc. — shared resources allocated to bookings

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK NOT NULL | |
| name | VARCHAR(150) | NOT NULL | "Buggy Familiar (4 pax)" |
| slug | VARCHAR(150) | | "buggy-4" |
| vehicle_type | vehicle_type | NOT NULL | buggy, quadricycle, boat, etc. |
| category | VARCHAR(100) | | Alternate grouping |
| description | TEXT | | |
| seat_capacity | INT | NOT NULL, CHECK > 0 | Total seats |
| luggage_capacity | INT | DEFAULT 0 | Cargo spots |
| image_url | TEXT | | Photo |
| is_private_allowed | BOOLEAN | DEFAULT TRUE | Can be booked alone |
| is_shared_allowed | BOOLEAN | DEFAULT FALSE | Can be shared w/ others |
| is_transfer_allowed | BOOLEAN | DEFAULT TRUE | Available for transfers |
| is_tour_allowed | BOOLEAN | DEFAULT TRUE | Available for tours |
| is_active | BOOLEAN | DEFAULT TRUE | |
| display_order | INT | DEFAULT 0 | |
| latitude | DECIMAL(10,7) | | Optional: specific vehicle location |
| longitude | DECIMAL(10,7) | | |
| service_radius_km | DECIMAL(8,2) | | |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_vehicles_region`

**RLS:** `public_vehicles` — all can read if active

---

#### **VEHICLE_PRICING_RULES** (9 cols)
**Purpose:** THE PRICING ENGINE — per-vehicle costs by service/date/season

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| vehicle_id | UUID | FK NOT NULL | |
| region_id | UUID | FK | |
| service_type | service_type | NOT NULL | 'tour' or 'transfer' |
| service_id | UUID | | NULL = applies to all tours/transfers; specific UUID = this tour/transfer only |
| pricing_mode | pricing_mode | DEFAULT 'per_vehicle' | per_vehicle, fixed, override |
| base_price | DECIMAL(10,2) | NOT NULL, CHECK ≥ 0 | e.g., Buggy: R$ 800 |
| high_season_price | DECIMAL(10,2) | | Alternate price July–Jan |
| is_active | BOOLEAN | DEFAULT TRUE | |
| valid_from | DATE | | Season start |
| valid_until | DATE | | Season end |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_vpr_vehicle`, `idx_vpr_service`

**Key Logic (from priceEngine.js):**
- For a booking, find all rules where vehicle_id matches & (service_id = booking.service_id OR service_id IS NULL)
- Order by: service_id DESC (specific rules first), then NULLs (generic fallback)
- Sum all vehicle prices × quantity
- If in high_season period: apply +percentage_value (e.g., +10% July–Jan)
- Apply coupon discount (max_discount_amount respected)
- Final total = base + season_addition - discount

---

#### **HIGH_SEASON_RULES** (8 cols)
**Purpose:** Pricing modifiers for busy periods (July–Jan = +10% for Jericoacoara)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK | |
| name | VARCHAR(150) | NOT NULL | "Alta temporada 2026-2027" |
| start_date | DATE | NOT NULL | "2026-07-01" |
| end_date | DATE | NOT NULL | "2027-01-31" |
| additional_type | additional_type | DEFAULT 'percentage' | percentage or fixed |
| additional_value | DECIMAL(7,4) | NOT NULL | 10.00 = +10% |
| applies_to | applies_to | DEFAULT 'all' | all, tours, transfers, selected_services |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at / updated_at | TIMESTAMPTZ | | |

**Check:** `end_date >= start_date`

---

#### **HOLIDAYS** (9 cols)
**Purpose:** Christmas, carnival, etc. — can affect pricing & availability

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK | |
| name | VARCHAR(150) | NOT NULL | "Natal" |
| holiday_date | DATE | NOT NULL | "2026-12-25" |
| affects_pricing | BOOLEAN | DEFAULT FALSE | If TRUE, apply % or fixed |
| additional_type | additional_type | | percentage, fixed |
| additional_value | DECIMAL(7,4) | | |
| affects_availability | BOOLEAN | DEFAULT FALSE | Block all bookings? |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at / updated_at | TIMESTAMPTZ | | |

---

#### **COUPONS** (13 cols)
**Purpose:** Promotional codes: "VERÃO2026" = 15% off, "NOIVOS" = R$50 fixed

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| code | VARCHAR(50) | UNIQUE NOT NULL | "VERÃO2026" |
| title | VARCHAR(150) | NOT NULL | "Promoção de Verão" |
| description | TEXT | | Internal/marketing notes |
| discount_type | discount_type | DEFAULT 'percentage' | fixed or percentage |
| discount_value | DECIMAL(10,2) | NOT NULL, CHECK > 0 | 15.00 or 50.00 |
| min_order_amount | DECIMAL(10,2) | DEFAULT 0 | Minimum booking value |
| max_discount_amount | DECIMAL(10,2) | | Caps applied discount |
| valid_from | TIMESTAMPTZ | | Activation date/time |
| valid_until | TIMESTAMPTZ | | Expiration date/time |
| usage_limit_total | INT | | Global max uses |
| usage_limit_per_user | INT | DEFAULT 1 | Per-person max uses |
| applicable_service_type | service_type | | NULL = both tours & transfers |
| applicable_region_id | UUID | FK | NULL = all regions |
| is_active | BOOLEAN | DEFAULT TRUE | |
| created_at / updated_at | TIMESTAMPTZ | | |

**Index:** `idx_coupons_code`

**Validation in priceEngine.js:**
- Check date range (valid_from ≤ now ≤ valid_until)
- Check service type (if specified)
- Check region (if specified)
- Check min order amount
- Count total usage; check usage_limit_total
- Count per-user usage; check usage_limit_per_user
- Calculate discount: percentage × subtotal OR fixed value
- Apply max_discount_amount cap
- Never discount > subtotal itself

---

#### **COUPON_REDEMPTIONS** (5 cols)
**Purpose:** Audit log of every coupon use (idempotent)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| coupon_id | UUID | FK NOT NULL | |
| user_id | UUID | FK NOT NULL | Who used it |
| booking_id | UUID | FK | Associated booking |
| discount_applied_amount | DECIMAL(10,2) | NOT NULL | Final $ off (after caps) |
| redeemed_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

#### **SERVICES_AVAILABILITY** (10 cols)
**Purpose:** Track capacity per tour/transfer/date/time; block dates

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK | |
| service_type | service_type | NOT NULL | tour or transfer |
| service_id | UUID | NOT NULL | Which tour/transfer |
| schedule_id | UUID | FK → tour_schedules(id) | Relates to recurring schedule |
| avail_date | DATE | NOT NULL | "2026-05-15" |
| avail_time | TIME | | "08:00" for specific departure |
| total_capacity | INT | NOT NULL | Max seats available |
| used_capacity | INT | DEFAULT 0, CHECK ≤ total | Booked seats (shared mode only) |
| is_blocked | BOOLEAN | DEFAULT FALSE | Holiday/maintenance block |
| block_reason | TEXT | | "Manutenção", "Cancelhamento" |
| created_at / updated_at | TIMESTAMPTZ | | |

**Unique:** (service_type, service_id, avail_date, avail_time)

**Trigger:** `update_availability_on_booking` — when shared booking is paid/cancelled, adjust used_capacity

---

#### **BOOKINGS** (34 cols) — THE CENTRAL TABLE
**Purpose:** Every reservation, immutable financial record per payment

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_code | VARCHAR(20) | UNIQUE NOT NULL, DEFAULT generate_booking_code() | "GJ-2026-000042" |
| user_id | UUID | FK NOT NULL | Turista |
| region_id | UUID | FK NOT NULL | |
| service_type | service_type | NOT NULL | tour or transfer |
| service_id | UUID | NOT NULL | tour_id or transfer_id |
| route_id | UUID | FK → transfer_routes(id) | For tabbed transfer |
| schedule_id | UUID | FK → tour_schedules(id) | For recurring tour |
| booking_mode | booking_mode | NOT NULL | private or shared |
| status_commercial | status_commercial | DEFAULT 'draft' | Draft → awaiting_payment → paid → completed/cancelled |
| status_operational | status_operational | DEFAULT 'new' | new → awaiting_dispatch → confirmed → assigned → en_route → completed |
| booking_date | DATE | DEFAULT TODAY() | When booked |
| service_date | DATE | NOT NULL | When service happens |
| service_time | TIME | NOT NULL | Departure time |
| people_count | INT | NOT NULL, CHECK > 0 | Group size |
| origin_text | VARCHAR(300) | | "Hotel Jeri Paradise" |
| destination_text | VARCHAR(300) | | |
| pickup_address_text | VARCHAR(300) | | Full address for driver |
| pickup_place_id | VARCHAR(300) | | Google Place ID |
| pickup_place_name | VARCHAR(300) | | "Hotel Jeri Paradise, Jericoacoara, CE" |
| pickup_latitude | DECIMAL(10,7) | | Exact coordinates |
| pickup_longitude | DECIMAL(10,7) | | |
| destination_place_id | VARCHAR(300) | | (transfers especially) |
| destination_place_name | VARCHAR(300) | | |
| destination_latitude | DECIMAL(10,7) | | |
| destination_longitude | DECIMAL(10,7) | | |
| special_notes | TEXT | | "Allergic to seafood", "late arrivals accepted" |
| subtotal_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | Sum of vehicles/per-person × qty |
| season_additional_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | High-season % or fixed |
| discount_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | Coupon applied |
| total_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | subtotal + season - discount |
| payment_status | payment_status | DEFAULT 'pending' | Mirrors payments.status |
| payment_model | payment_model | DEFAULT 'full' | full, deposit, pre_auth, remaining_balance |
| source_channel | source_channel | DEFAULT 'app' | app, web, whatsapp, agency_link, admin_manual |
| coupon_id | UUID | FK → coupons(id) | |
| agency_id | UUID | FK → agencies(id) | If booked via agency |
| affiliate_id | UUID | | Future: affiliate referral |
| cancel_reason | TEXT | | Why cancelled |
| cancelled_at | TIMESTAMPTZ | | |
| completed_at | TIMESTAMPTZ | | |
| created_at / updated_at | TIMESTAMPTZ | | |

**Constraints:**
- shared mode only valid when service_type = 'tour'

**Indexes:** `idx_bookings_code`, `idx_bookings_user`, `idx_bookings_service_date`, `idx_bookings_status_commercial`, `idx_bookings_region`, etc.

**Triggers:**
- `trg_bookings_audit` — logs status_commercial, status_operational, total_amount changes
- `trg_booking_availability` — updates services_availability.used_capacity on shared booking paid/cancelled

**RLS:** `users_own_bookings` — users see only their bookings

---

#### **BOOKING_ITEMS** (8 cols)
**Purpose:** Snapshot of the service (tour/transfer name, price) at booking time

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK NOT NULL | |
| service_type | service_type | NOT NULL | tour or transfer |
| service_id | UUID | NOT NULL | tour_id or transfer_id |
| title_snapshot | VARCHAR(300) | NOT NULL | "Passeio de Buggy Completo" at time of booking |
| description_snapshot | TEXT | | |
| quantity | INT | NOT NULL, DEFAULT 1 | people_count or 1 |
| unit_price | DECIMAL(10,2) | NOT NULL | price / people_count |
| total_price | DECIMAL(10,2) | NOT NULL | subtotal_amount |
| metadata_json | JSONB | | Extra data (e.g., selected vehicles) |
| created_at | TIMESTAMPTZ | | |

**RLS:** `users_own_booking_items` — users see only items in their bookings

---

#### **BOOKING_VEHICLES** (7 cols)
**Purpose:** Which vehicles the turista picked for private tour (snapshot)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK NOT NULL | |
| vehicle_id | UUID | FK NOT NULL | |
| vehicle_name_snapshot | VARCHAR(200) | NOT NULL | "Buggy Familiar (4 pax)" frozen at booking |
| vehicle_capacity_snapshot | INT | NOT NULL | 4 |
| quantity | INT | NOT NULL, DEFAULT 1, CHECK > 0 | How many of this vehicle |
| unit_price | DECIMAL(10,2) | NOT NULL | Price per unit |
| total_price | DECIMAL(10,2) | NOT NULL | unit_price × quantity |
| created_at | TIMESTAMPTZ | | |

**RLS:** `users_own_booking_vehicles`

---

#### **PAYMENTS** (14 cols)
**Purpose:** Payment transactions (Mercado Pago integration)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK NOT NULL | |
| gateway_name | VARCHAR(50) | | "mercado_pago" |
| gateway_transaction_id | VARCHAR(200) | UNIQUE | Mercado Pago payment ID |
| payment_method | payment_method | | pix, credit_card, debit_card, manual_link |
| payment_type | payment_type | DEFAULT 'full' | full, deposit, pre_auth, remaining_balance |
| amount_gross | DECIMAL(10,2) | NOT NULL | Total paid by customer |
| gateway_fee_amount | DECIMAL(10,2) | DEFAULT 0 | Mercado Pago fee |
| amount_net | DECIMAL(10,2) | GENERATED ALWAYS AS (gross - fee) | What Giro keeps before commission |
| currency | VARCHAR(10) | DEFAULT 'BRL' | |
| status | payment_status | DEFAULT 'pending' | pending, approved, failed, expired, refunded, partially_refunded |
| paid_at | TIMESTAMPTZ | | When approved |
| expires_at | TIMESTAMPTZ | | Pre-auth expiration |
| expected_credit_date | DATE | | When $ hits account |
| credited_at | TIMESTAMPTZ | | When actually received |
| receipt_url | TEXT | | Link to Mercado Pago receipt |
| raw_response_json | JSONB | | Full gateway response |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_payments_booking`, `idx_payments_status`, `idx_payments_gateway_txn`

**Flow:**
1. POST /api/payments/intent → create Mercado Pago session → return clientToken
2. Frontend redirects to Mercado Pago payment page
3. User pays → MP webhook calls POST /api/payments/webhook
4. Webhook validates, updates payment.status = 'approved', booking.status_commercial = 'paid'
5. Creates financial_ledger entries (gross, fee, net) & commission record

---

#### **PAYMENT_EVENTS** (6 cols)
**Purpose:** Idempotent webhook log (prevents processing same MP event twice)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| payment_id | UUID | FK NOT NULL | |
| event_name | VARCHAR(100) | NOT NULL | "payment.updated", etc. |
| event_payload_json | JSONB | | Raw MP webhook body |
| received_at | TIMESTAMPTZ | DEFAULT NOW() | |
| processed_at | TIMESTAMPTZ | | When processed |
| processing_status | VARCHAR(30) | DEFAULT 'pending' | pending, completed, failed |
| created_at | TIMESTAMPTZ | | |

**Unique:** (payment_id, event_name, received_at)

---

#### **FINANCIAL_LEDGER** (13 cols) — THE ACCOUNTING JOURNAL
**Purpose:** Every flow of money in/out: bookings, fees, commissions, payouts

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK | Related booking (if any) |
| payment_id | UUID | FK | Related payment |
| region_id | UUID | FK | |
| agency_id | UUID | FK | If agency revenue |
| created_by_user_id | UUID | FK | Admin who created manual entry |
| entry_type | VARCHAR(50) | NOT NULL | booking_gross, gateway_fee, booking_net, commission_platform, commission_agency, payout_operator, manual_expense, manual_income, refund |
| category | VARCHAR(100) | | Grouping |
| description | TEXT | NOT NULL | "Receita bruta — reserva GJ-2026-000042" |
| amount | DECIMAL(10,2) | NOT NULL, CHECK ≥ 0 | Always positive; direction shows inflow/outflow |
| direction | ledger_direction | NOT NULL | inflow (revenue) or outflow (expense) |
| financial_status | financial_status | DEFAULT 'pending' | pending (not yet received), scheduled, credited, paid |
| due_date | DATE | | When due (e.g., commission payout date) |
| expected_credit_date | DATE | | When $ expected in bank (from MP) |
| effective_date | DATE | | When transaction actually settled |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_ledger_booking`, `idx_ledger_status`, `idx_ledger_region`, `idx_ledger_effective_date`

**Typical Entries per Booking:**
1. booking_gross, inflow, R$1000 → what customer paid
2. gateway_fee, outflow, R$35 (3.5%) → Mercado Pago fee
3. booking_net, inflow, R$965 → what Giro receives
4. commission_platform, outflow, R$70 (7% of gross) → Giro's take
5. commission_agency, outflow, R$50 (if via agency) → Agency cut
6. payout_operator, outflow, TBD → Driver/operator earnings

---

#### **COMMISSIONS** (10 cols)
**Purpose:** Per-booking commission split: who gets what from revenue

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK NOT NULL | |
| agency_id | UUID | FK | If agency involved |
| affiliate_id | UUID | | Future: influencer referrals |
| commission_model | commission_model | DEFAULT 'percentage' | percentage, fixed, hybrid |
| commission_percent | DECIMAL(5,2) | DEFAULT 0 | % of booking gross |
| commission_amount | DECIMAL(10,2) | DEFAULT 0 | Calculated $ amount |
| platform_amount | DECIMAL(10,2) | DEFAULT 0 | Giro keeps this |
| operator_amount | DECIMAL(10,2) | DEFAULT 0 | Driver/operator earns |
| payout_status | payout_status | DEFAULT 'pending' | pending → ready → paid |
| payout_due_date | DATE | | When driver gets paid |
| payout_paid_at | TIMESTAMPTZ | | When actually sent |
| created_at / updated_at | TIMESTAMPTZ | | |

**Split Example:**
- Booking gross: R$1000
- Platform takes 7% (commission): R$70
- Agency gets X%, driver gets Y%, Giro keeps Z%

---

#### **OPERATIONAL_ASSIGNMENTS** (13 cols)
**Purpose:** Despacho (dispatch): which operator/driver assigned to booking

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK NOT NULL | |
| assigned_operator_user_id | UUID | FK | Dispatcher or coordinator |
| assigned_driver_user_id | UUID | FK | Driver (motorista) |
| assigned_guide_user_id | UUID | FK | Guide (guia) |
| supplier_name | VARCHAR(200) | | 3rd-party supplier if subcontracted |
| real_vehicle_text | VARCHAR(200) | | Actual vehicle (may differ from booking_vehicles) |
| dispatch_notes | TEXT | | Instructions to driver |
| confirmation_notes | TEXT | | Driver's response/acknowledgment |
| started_at | TIMESTAMPTZ | | When driver began service |
| boarded_at | TIMESTAMPTZ | | When passengers got in |
| completed_at | TIMESTAMPTZ | | When service finished |
| assignment_status | assignment_status | DEFAULT 'pending' | pending → assigned → confirmed → in_service → completed |
| created_at / updated_at | TIMESTAMPTZ | | |

---

#### **NOTIFICATIONS** (11 cols)
**Purpose:** Audit log of all messages sent (WhatsApp, email, push, SMS, internal)

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK | Recipient |
| booking_id | UUID | FK | Related booking |
| channel | notification_channel | NOT NULL | whatsapp, email, push, sms, internal |
| template_key | VARCHAR(100) | | booking_confirmation, reminder_24h, etc. |
| title | VARCHAR(300) | | |
| message_body | TEXT | NOT NULL | |
| destination | VARCHAR(300) | | Phone, email, or device ID |
| send_status | send_status | DEFAULT 'queued' | queued, sent, delivered, failed, opened |
| scheduled_for | TIMESTAMPTZ | | For scheduled sends |
| sent_at | TIMESTAMPTZ | | When actually sent |
| provider_response | JSONB | | Response from WhatsApp/email provider |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_notifications_user`, `idx_notifications_booking`, `idx_notifications_status`

---

#### **AUTOMATION_JOBS** (8 cols)
**Purpose:** Cron queue: reminders, expirations, status updates

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| related_entity_type | VARCHAR(100) | NOT NULL | bookings, transfer_quotes, etc. |
| related_entity_id | UUID | NOT NULL | ID of the booking/quote |
| job_type | VARCHAR(100) | NOT NULL | booking_confirmation, pre_trip_reminder_24h, pre_trip_reminder_2h, post_trip_review_request, abandon_cart_reminder, expire_quote, etc. |
| payload_json | JSONB | | Job-specific data |
| run_at | TIMESTAMPTZ | NOT NULL | When to execute |
| job_status | job_status | DEFAULT 'pending' | pending, processing, completed, failed, cancelled |
| attempts_count | INT | DEFAULT 0 | Retry counter |
| last_error | TEXT | | Error message if failed |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_jobs_run_at`

**Example Jobs:**
- Job: booking_confirmation, run_at: booking.created_at, sends notification
- Job: pre_trip_reminder_24h, run_at: booking.service_date - 24h
- Job: expire_quote, run_at: transfer_quote.expires_at (for quotes)

---

#### **REVIEWS** (8 cols)
**Purpose:** 1–5 star ratings & comments post-service

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK NOT NULL | |
| user_id | UUID | FK NOT NULL | Turista reviewer |
| service_type | service_type | NOT NULL | tour or transfer |
| service_id | UUID | NOT NULL | Which service being reviewed |
| rating | SMALLINT | NOT NULL, CHECK BETWEEN 1 AND 5 | 1–5 stars |
| comment_text | TEXT | | Optional feedback |
| is_public | BOOLEAN | DEFAULT TRUE | Show in listings? |
| created_at / updated_at | TIMESTAMPTZ | | |

**Unique:** (booking_id) — one review per booking

**RLS:** `users_own_reviews`

---

#### **AUDIT_LOGS** (8 cols)
**Purpose:** Compliance & security: all admin actions & critical changes

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK | Admin who made change |
| entity_type | VARCHAR(100) | NOT NULL | bookings, users, tours, pricing_rules, etc. |
| entity_id | UUID | | ID of changed entity |
| action_type | audit_action_type | NOT NULL | create, update, cancel, refund, status_change, login, manual_override, delete |
| old_values_json | JSONB | | State before |
| new_values_json | JSONB | | State after |
| ip_address | INET | | Admin's IP |
| user_agent | TEXT | | Browser/client info |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_audit_entity`, `idx_audit_user`, `idx_audit_date`

---

#### **SYSTEM_SETTINGS** (6 cols)
**Purpose:** Global config: currency, timezone, cancellation windows, commission %

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| setting_key | VARCHAR(100) | UNIQUE NOT NULL | default_currency, whatsapp_support_number, platform_fee_percent, transfer_min_advance_hours, quote_expiry_hours, etc. |
| setting_value | TEXT | | "BRL", "7", "4", "+5588999999999" |
| value_type | VARCHAR(20) | DEFAULT 'string' | string, number, boolean, json |
| description | TEXT | | What this setting does |
| updated_by_user_id | UUID | FK | Admin who last changed it |
| created_at / updated_at | TIMESTAMPTZ | | |

**Key Settings:**
- `default_currency`: "BRL"
- `default_timezone`: "America/Fortaleza"
- `whatsapp_support_number`: "+5588999999999"
- `cancellation_tour_hours`: "24" — free cancel until 24h before
- `cancellation_transfer_days`: "3"
- `platform_fee_percent`: "7" — Giro's commission
- `gateway_fee_percent`: "3.5" — Mercado Pago
- `max_people_per_booking`: "50"
- `transfer_min_advance_hours`: "4" — must book 4h ahead
- `quote_expiry_hours`: "2" — turista has 2h to accept quote
- `transfer_max_luggage`: "10"
- `maintenance_mode`: "false"

---

#### **BANNERS** (10 cols)
**Purpose:** Homepage/campaign marketing images

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| region_id | UUID | FK | |
| title | VARCHAR(200) | NOT NULL | |
| subtitle | VARCHAR(300) | | |
| image_url | TEXT | NOT NULL | |
| cta_label | VARCHAR(100) | | "Book Now", "Learn More" |
| cta_link | TEXT | | Target URL |
| start_at | TIMESTAMPTZ | | Campaign start |
| end_at | TIMESTAMPTZ | | Campaign end |
| is_active | BOOLEAN | DEFAULT TRUE | |
| sort_order | INT | DEFAULT 0 | Display order |
| created_at / updated_at | TIMESTAMPTZ | | |

---

#### **USER_ADDRESSES** (11 cols)
**Purpose:** Frequent pickups/drop-offs: home, hotel, airport, etc.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK NOT NULL | |
| label | VARCHAR(100) | NOT NULL | "Home", "Hotel Jeri", "Airport" |
| address_line | TEXT | NOT NULL | Full street address |
| reference_point | TEXT | | "Next to supermarket" |
| neighborhood | VARCHAR(100) | | |
| city | VARCHAR(100) | | |
| state | VARCHAR(50) | | |
| zip_code | VARCHAR(20) | | |
| latitude | DECIMAL(10,7) | | |
| longitude | DECIMAL(10,7) | | |
| is_default | BOOLEAN | DEFAULT FALSE | Pre-fill on booking |
| created_at / updated_at | TIMESTAMPTZ | | |

**RLS:** `users_own_addresses`

---

#### **TRANSFER_QUOTES** (25 cols)
**Purpose:** Request → quote → accept/reject flow for custom routes

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK NOT NULL | Turista requesting |
| region_id | UUID | FK NOT NULL | |
| origin_place_id | VARCHAR(300) | | Google Place ID |
| origin_place_name | VARCHAR(300) | NOT NULL | "Jericoacoara" |
| origin_latitude | DECIMAL(10,7) | | |
| origin_longitude | DECIMAL(10,7) | | |
| origin_address_text | TEXT | | |
| destination_place_id | VARCHAR(300) | | |
| destination_place_name | VARCHAR(300) | NOT NULL | "Fortaleza International Airport" |
| destination_latitude | DECIMAL(10,7) | | |
| destination_longitude | DECIMAL(10,7) | | |
| destination_address_text | TEXT | | |
| service_date | DATE | NOT NULL | When needed |
| service_time | TIME | NOT NULL | "14:30" |
| people_count | INT | NOT NULL, CHECK > 0 | |
| luggage_count | INT | DEFAULT 0, CHECK ≤ 20 | |
| special_notes | TEXT | | "Need car seat for child" |
| source_channel | source_channel | DEFAULT 'app' | |
| status | quote_status | DEFAULT 'pending_quote' | Workflow: pending_quote → quoted → accepted → paid OR rejected/expired/cancelled |
| quoted_price | DECIMAL(10,2) | | Operador's offer |
| quoted_by_user_id | UUID | FK | Which operator quoted |
| quoted_at | TIMESTAMPTZ | | |
| quote_notes | TEXT | | "Needs extra stop: Preá" |
| expires_at | TIMESTAMPTZ | | quoted_at + 2h (configurable) |
| client_responded_at | TIMESTAMPTZ | | |
| rejection_reason | TEXT | | If rejected |
| booking_id | UUID | FK → bookings(id) | Once paid, creates booking |
| created_at / updated_at | TIMESTAMPTZ | | |

**Indexes:** `idx_quotes_user`, `idx_quotes_status`, `idx_quotes_service_date`, `idx_quotes_expires`

**Constraints:** service_date ≥ CURRENT_DATE

**Triggers:**
- `trg_quotes_audit` — logs status and price changes
- `expire_pending_quotes()` — batch function to mark expired quotes

**RLS:** `users_own_quotes` — users see only their quotes

**Workflow:**
1. POST /api/transfers/quotes → creates quote in `pending_quote` status
2. Notifies operador (internal notification)
3. Operador PATCH /api/transfers/quotes/:id/quote → sets quoted_price, status = `quoted`, expires_at = now + 2h
4. If turista accepts (POST /api/transfers/quotes/:id/accept): status = `accepted`
5. Turista pays → booking created → status = `paid`
6. Or turista rejects (POST /api/transfers/quotes/:id/reject): status = `rejected`
7. Or timeout expires: status = `expired` (via expire_pending_quotes job)

---

#### **OPERATOR_SERVICE_PREFERENCES** (5 cols)
**Purpose:** Which tours/transfers/vehicles each driver/operator wants to work with

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| operator_id | UUID | FK NOT NULL | User (must be user_type = 'operator') |
| entity_type | VARCHAR(20) | NOT NULL, CHECK IN ('tour', 'vehicle', 'transfer') | What type |
| entity_id | UUID | NOT NULL | ID of tour/vehicle/transfer |
| is_active | BOOLEAN | DEFAULT TRUE | Opt-out if needed |
| notes | TEXT | | "Don't assign after 6pm", "Prefer buggy only" |
| created_at / updated_at | TIMESTAMPTZ | | |

**Unique:** (operator_id, entity_type, entity_id)

**Model:** Opt-in — only assignments matching these preferences are allowed

---

### 2.3 Views (Denormalized Queries)

#### **v_quotes_dashboard**
Used by operador to see pending quotes (migration 002, lines 304–338)

Columns:
- id, status, client_name, client_phone
- origin_place_name, destination_place_name, service_date, service_time
- people_count, luggage_count, quoted_price, expires_at
- special_notes, quote_notes, created_at
- is_urgent (flag if service within 6h)
- hours_to_expire (decimal hours remaining for client decision)

**Where:** status NOT IN ('paid', 'cancelled')

---

#### **v_booking_maps_links**
Used by operational dashboard to get clickable Maps links (migration 002, lines 345–384)

Columns:
- id, booking_code, service_type, service_date, service_time
- pickup_place_name, pickup_latitude, pickup_longitude
- destination_place_name, destination_latitude, destination_longitude
- maps_route_url (Google Maps full route link)
- maps_pickup_url (Google Maps pickup location link)

**Where:** status_operational NOT IN ('completed', 'cancelled')

---

### 2.4 Stored Functions & Triggers

#### Functions

| Function | Purpose | Returns | Notes |
|----------|---------|---------|-------|
| `set_updated_at()` | Trigger function: updates `updated_at` to NOW() | TRIGGER | Used by all table triggers |
| `generate_booking_code()` | Generates GJ-YYYY-NNNNNN | TEXT | Sequence-based |
| `is_high_season(region_id, date)` | Checks if date falls in high_season_rules | BOOLEAN | |
| `calculate_season_addition(region_id, date, subtotal)` | Returns $ or % addition for season | DECIMAL(10,2) | Called by priceEngine.js |
| `validate_vehicle_capacity(booking_id)` | Checks booking_vehicles total ≥ people_count | BOOLEAN | |
| `audit_booking_changes()` | Logs booking status/amount changes | TRIGGER | AFTER UPDATE on bookings |
| `update_availability_on_booking()` | Adjusts services_availability.used_capacity | TRIGGER | AFTER UPDATE on bookings (shared mode only) |
| `expire_pending_quotes()` | Sets expired quotes status = 'expired' | INT | Batch job |
| `validate_transfer_advance(date, time)` | Checks ≥ 4h in future | BOOLEAN | From 002 migration |
| `haversine_km(lat1, lon1, lat2, lon2)` | Distance between coords in km | DECIMAL | From 008 migration |
| `audit_quote_changes()` | Logs transfer_quote status changes | TRIGGER | |
| `create_updated_at_trigger(tbl)` | Macro to add updated_at trigger | void | |

---

#### Triggers

| Table | Trigger | Function | Timing |
|-------|---------|----------|--------|
| users | trg_users_updated | set_updated_at | BEFORE UPDATE |
| regions | trg_regions_updated | set_updated_at | BEFORE UPDATE |
| tours | trg_tours_updated | set_updated_at | BEFORE UPDATE |
| transfers | trg_transfers_updated | set_updated_at | BEFORE UPDATE |
| vehicles | trg_vehicles_updated | set_updated_at | BEFORE UPDATE |
| bookings | trg_bookings_updated | set_updated_at | BEFORE UPDATE |
| bookings | trg_bookings_audit | audit_booking_changes | AFTER UPDATE |
| bookings | trg_booking_availability | update_availability_on_booking | AFTER UPDATE |
| transfer_quotes | trg_quotes_updated | set_updated_at | BEFORE UPDATE |
| transfer_quotes | trg_quotes_audit | audit_quote_changes | AFTER UPDATE |

---

### 2.5 Storage Buckets

**Bucket: `avatars`** (public read, restricted write)
- Path format: `{user_id}.{ext}` (e.g., `550e8400-e29b-41d4-a716-446655440000.png`)
- Allowed MIME types: image/jpeg, image/png, image/webp
- Max file size: 2 MB
- Public URL: `https://{project}.supabase.co/storage/v1/object/public/avatars/{path}`
- Used in: Auth.js POST /me/photo endpoint

---

### 2.6 Row-Level Security (RLS) Policies

| Table | Policy | Condition | Notes |
|-------|--------|-----------|-------|
| users | users_own_data | auth.uid() = auth_id | Users see/edit own profile |
| bookings | users_own_bookings | user_id matches auth user | |
| booking_items | users_own_booking_items | booking in auth user's list | SELECT |
| booking_vehicles | users_own_booking_vehicles | booking in auth user's list | SELECT |
| payments | users_own_payments | booking in auth user's list | SELECT |
| notifications | users_own_notifications | user_id matches auth user | All ops |
| reviews | users_own_reviews | user_id matches auth user | |
| user_addresses | users_own_addresses | user_id matches auth user | |
| coupon_redemptions | users_own_redemptions | user_id matches auth user | SELECT |
| transfer_quotes | users_own_quotes | user_id matches auth user | All ops |
| regions | public_regions | is_active = TRUE | SELECT (no auth needed) |
| tours | public_tours | is_active = TRUE | SELECT |
| transfers | public_transfers | is_active = TRUE | SELECT |
| vehicles | public_vehicles | is_active = TRUE | SELECT |
| categories | public_categories | is_active = TRUE | SELECT |
| tour_schedules | public_schedules | is_active = TRUE | SELECT |
| transfer_routes | public_routes | is_active = TRUE | SELECT |
| banners | public_banners | is_active = TRUE | SELECT |

**Note:** Admin/operator tables (admin.js routes) use API-level authentication via `requireAdmin` / `requireOperator` middleware, not RLS.

---

## 3. API REST (packages/api)

### 3.1 Authentication Model

**Supabase Auth (JWT) Flow:**
1. POST `/api/auth/register` → creates user in `auth.users` + row in `users` table
2. POST `/api/auth/login` → Supabase Auth validates password → returns access_token + refresh_token
3. All subsequent requests: `Authorization: Bearer {access_token}`
4. Middleware `authenticate()` calls `supabase.auth.getUser(token)` → loads user profile from `users` table
5. POST `/api/auth/refresh` → refresh_token → new access_token
6. POST `/api/auth/logout` → invalidates session

**Middleware:**
- `authenticate` — Required JWT; loads `req.user`
- `requireAdmin` — user_type = 'admin'
- `requireOperator` — user_type IN ('operator', 'admin')
- `requireRole(...roles)` — Generic role checker

---

### 3.2 All Routes (Comprehensive List)

#### **AUTH** (`/api/auth`)

| Method | Path | Auth? | Role | Request Body | Response | Purpose |
|--------|------|-------|------|--------------|----------|---------|
| POST | /register | No | - | {full_name, email?, phone?, password} | {message, token, refresh_token, user} | New account |
| POST | /login | No | - | {email?, phone?, password} | {token, refresh_token, user} | Sign in |
| GET | /me | Yes | Any | - | {user} | Current user profile |
| POST | /refresh | No | - | {refresh_token} | {token, refresh_token, user} | Get new token |
| PATCH | /me | Yes | Any | {full_name?, phone?, birth_date?, document_type?, document_number?, nationality?, gender?, emergency_contact_*?, language?, profile_photo_url?} | {user} | Update profile |
| POST | /me/photo | Yes | Any | {photo_data: "data:image/...;base64,..."} | {url} | Upload avatar to storage |
| POST | /logout | Yes | Any | - | {message} | Sign out |

---

#### **TOURS** (`/api/tours`)

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | / | No | - | region_id?, category_id?, mode (private/shared)?, featured?, search?, lat?, lon?, radius? | [{id, name, slug, ...}] | List tours (filterable, with geo) |
| GET | /:id | No | - | - | {id, name, ..., tour_schedules, region, category} | Tour details |
| GET | /:id/vehicles | No | - | - | [{id, name, vehicle_type, seat_capacity, base_price, ...}] | Available vehicles for tour |
| POST | /:id/suggest-vehicles | No | - | {region_id, people_count} | {suggestions: [{vehicle, capacity, price, ...}]} | AI-suggest vehicles for group |
| POST | /:id/calculate | No | - | {region_id, mode, service_date, people_count?, vehicles?, coupon_code?} | {subtotalAmount, seasonAdditional, discountAmount, totalAmount, breakdown} | Calc price before book |
| POST | / | Yes | admin | {name, slug, ..., category_id, region_id, ...} | {created tour} | Create tour (admin) |
| PUT | /:id | Yes | admin | {name?, short_description?, is_shared_enabled?, shared_price_per_person?, ...} | {updated tour} | Update tour (admin) |

---

#### **TRANSFERS** (`/api/transfers`)

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | / | No | - | region_id?, lat?, lon?, radius? | [{id, name, slug, ..., transfer_routes: [{...}]}] | List transfers |
| GET | /routes | No | - | transfer_id? | [{id, origin_name, destination_name, default_price, ...}] | Tabbed routes |
| POST | /calculate | No | - | {region_id, route_id, service_date, service_time, coupon_code?} | {subtotalAmount, seasonAdditional, ...} | Calc tabbed transfer price |
| POST | /quotes | Yes | tourist | {region_id, origin_place_id?, origin_place_name, origin_lat?, origin_lon?, destination_place_id?, destination_place_name, destination_lat?, destination_lon?, service_date, service_time, people_count, luggage_count?, special_notes?} | {id, status: "pending_quote", ...} | Request custom route quote |
| GET | /quotes | Yes | tourist | - | [{id, status, origin_place_name, destination_place_name, quoted_price, expires_at, ...}] | User's quotes |
| GET | /quotes/pending | Yes | operator | - | {view from v_quotes_dashboard: status, client_name, is_urgent, hours_to_expire, ...} | Operador sees pending quotes |
| PATCH | /quotes/:id/quote | Yes | operator | {quoted_price, quote_notes?} | {updated quote: status: "quoted", expires_at, ...} | Operador submits price |
| POST | /quotes/:id/accept | Yes | tourist | - | {status: "accepted"} | Turista accepts quote |
| POST | /quotes/:id/reject | Yes | tourist | {rejection_reason?} | {status: "rejected"} | Turista rejects quote |
| POST | / | Yes | admin | {region_id, name, slug, ...} | {created transfer} | Create transfer |
| PUT | /:id | Yes | admin | {name?, pricing_mode?, ...} | {updated transfer} | Update transfer |
| DELETE | /:id | Yes | admin | - | 204 No Content | Soft-delete (is_active=false) |

---

#### **BOOKINGS** (`/api/bookings`)

| Method | Path | Auth? | Role | Request Body | Response | Purpose |
|--------|------|-------|------|--------------|----------|---------|
| POST | / | Yes | tourist | {region_id, service_type, service_id, route_id?, schedule_id?, booking_mode, service_date, service_time, people_count, pickup_place_id?, pickup_place_name?, pickup_lat?, pickup_lon?, destination_place_id?, destination_place_name?, destination_lat?, destination_lon?, origin_text?, destination_text?, special_notes?, coupon_code?, payment_model?, source_channel?, vehicles? (for private), quote_id? (for quote)} | {id, booking_code, status_commercial, status_operational, total_amount, ...} | Create reservation |
| GET | / | Yes | tourist | - | [{id, booking_code, service_type, service_date, status_commercial, status_operational, ...}] | User's bookings |
| GET | /:id | Yes | tourist | - | {id, booking_code, ..., booking_items, booking_vehicles, operational_assignments, reviews} | Booking details |
| POST | /:id/cancel | Yes | tourist | {reason?} | {status_commercial: "cancelled", cancelled_at} | Cancel booking |

---

#### **PAYMENTS** (`/api/payments`)

| Method | Path | Auth? | Role | Request Body | Response | Purpose |
|--------|------|-------|------|--------------|----------|---------|
| POST | /intent | Yes | tourist | {booking_id, payment_method?} | {clientToken, preferenceUrl} | Create Mercado Pago session |
| POST | /webhook | No | - | (raw Mercado Pago event) | {message: "OK"} | Process MP webhook (idempotent) |

**Webhook Logic (payments/webhook → processPaymentEvent):**
- Event received from Mercado Pago
- Log to payment_events (idempotency check)
- If status = 'approved':
  - Update payment.status = 'approved', paid_at = now
  - Update booking.status_commercial = 'paid', status_operational = 'awaiting_dispatch'
  - Insert 3 ledger entries: booking_gross (inflow), gateway_fee (outflow), booking_net (inflow)
  - Insert commission record (platform takes 7% from gross)
  - Create notification(s)

---

#### **REGIONS** (`/api/regions`)

| Method | Path | Auth? | Role | Query | Response | Purpose |
|--------|------|-------|------|-------|----------|---------|
| GET | / | No | - | - | [{id, name, slug, center_lat, center_lon, service_radius_km, is_active}] | All regions |

---

#### **ADMIN** (`/api/admin`)

##### **Dashboard & Stats**

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /stats | Yes | admin | - | {reservas_hoje, pendencias, cancelamentos, valor_bruto_hoje, valor_liquido_hoje, valor_bruto_mes} | Daily/monthly KPIs |
| GET | /financial | Yes | admin | period (day/week/month/year)?, region_id? | {bruto, taxas, liquido, nao_creditado, comissoes_plataforma, repasses, margem_percent} | Revenue breakdown |
| GET | /financial-daily | Yes | admin | date? | {daily entries aggregated} | Daily ledger view |
| GET | /operational | Yes | operator | date?, service_type? | {date, total, columns: {new: [...], awaiting_dispatch: [...], ..., completed: [...]}} | Kanban board |
| POST | /operational/:id/assign | Yes | operator | {assigned_driver_user_id, assigned_guide_user_id?, real_vehicle_text, dispatch_notes?} | {upserted assignment} | Dispatch booking |

##### **User Management**

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /users | Yes | admin | user_type?, is_active?, search?, page?, limit? | {data: [...], total, page, limit} | List users (paginated) |
| PATCH | /users/:id | Yes | admin | {user_type?, is_active?, phone?, email?} | {updated user} | Edit user (audit logged) |

##### **Catalog Management** (via `/api/catalog`)

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /categories | Yes | operator | - | [{id, name, slug, icon, color}] | All categories |
| GET | /tours | Yes | operator | - | [{..., category}] | All tours (for admin edit) |
| POST | /tours | Yes | admin | {name, short_description, duration_hours?, max_people?, is_private_enabled, is_shared_enabled, shared_price_per_person?, cover_image_url?, category_id?} | {created tour} | Create tour |
| PUT | /tours/:id | Yes | admin | {name?, short_description?, duration_hours?, max_people?, is_private_enabled?, is_shared_enabled?, shared_price_per_person?, cover_image_url?, category_id?, is_active?, display_order?, latitude?, longitude?, service_radius_km?} | {updated tour} | Update tour |
| DELETE | /tours/:id | Yes | admin | - | 204 | Soft-delete tour |
| GET | /transfers | Yes | operator | - | [{id, name, is_active}] | All transfers |
| POST | /transfers | Yes | admin | {region_id, name, slug, pricing_mode, ...} | {created transfer} | Create transfer |
| PUT | /transfers/:id | Yes | admin | {...} | {updated transfer} | Update transfer |
| DELETE | /transfers/:id | Yes | admin | - | 204 | Soft-delete transfer |
| GET | /transfer-routes | Yes | operator | transfer_id? | [{..., transfer: {id, name}}] | Routes (optionally filtered) |
| POST | /transfer-routes | Yes | admin | {transfer_id, origin_name, destination_name, default_price, extra_stop_price?, night_fee?, origin_lat?, origin_lon?, destination_lat?, destination_lon?} | {created route} | Create route |
| PUT | /transfer-routes/:id | Yes | admin | {...} | {updated route} | Update route |
| DELETE | /transfer-routes/:id | Yes | admin | - | 204 | Soft-delete route |

##### **Pricing & Seasons**

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /pricing-rules | Yes | admin | - | [{vehicle_id, service_type, service_id, base_price, high_season_price, is_active}] | All pricing rules |
| POST | /pricing-rules | Yes | admin | {vehicle_id, region_id?, service_type, service_id?, pricing_mode, base_price, high_season_price?, valid_from?, valid_until?} | {created rule} | Create pricing rule |
| PUT | /pricing-rules/:id | Yes | admin | {...} | {updated rule} | Update pricing rule |
| DELETE | /pricing-rules/:id | Yes | admin | - | 204 | Delete rule |
| GET | /seasons | Yes | admin | - | [{region_id, name, start_date, end_date, additional_type, additional_value, applies_to, is_active}] | All high-season rules |
| POST | /seasons | Yes | admin | {region_id, name, start_date, end_date, additional_type, additional_value, applies_to?, is_active?} | {created rule} | Create season |
| PUT | /seasons/:id | Yes | admin | {...} | {updated rule} | Update season |
| DELETE | /seasons/:id | Yes | admin | - | 204 | Delete season |

##### **Coupons**

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /coupons | Yes | admin | - | [{code, title, discount_type, discount_value, valid_from, valid_until, usage_limit_total, usage_limit_per_user}] | All coupons |
| POST | /coupons | Yes | admin | {code, title, description?, discount_type, discount_value, min_order_amount?, max_discount_amount?, valid_from?, valid_until?, usage_limit_total?, usage_limit_per_user?, applicable_service_type?, applicable_region_id?} | {created coupon} | Create coupon |
| PUT | /coupons/:id | Yes | admin | {...} | {updated coupon} | Update coupon |
| DELETE | /coupons/:id | Yes | admin | - | 204 | Delete coupon |

##### **Settings & Audit**

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /settings | Yes | admin | - | [{setting_key, setting_value, value_type, description}] | All system settings |
| PUT | /settings/:key | Yes | admin | {setting_value} | {updated setting} | Update setting |
| GET | /audit-logs | Yes | admin | entity_type?, action_type?, page?, limit? | [{user_id, entity_type, entity_id, action_type, old_values_json, new_values_json, created_at}] | Audit trail |

---

#### **CATALOG** (`/api/catalog`) — DEPRECATED (merged into /admin)

Now part of admin routes. See above.

---

#### **VEHICLES** (`/api/vehicles`)

| Method | Path | Auth? | Role | Query | Response | Purpose |
|--------|------|-------|------|-------|----------|---------|
| GET | / | No | - | region_id? | [{id, name, vehicle_type, seat_capacity, luggage_capacity, image_url, is_active}] | List vehicles |

---

#### **OPERATOR** (`/api/operator`)

| Method | Path | Auth? | Role | Query/Body | Response | Purpose |
|--------|------|-------|------|-----------|----------|---------|
| GET | /preferences | Yes | operator | - | [{operator_id, entity_type, entity_id, is_active, notes}] | Operator's service preferences |
| PUT | /preferences/:type/:entityId | Yes | operator | {is_active?, notes?} | {upserted preference} | Save preference (tour/vehicle/transfer) |

---

### 3.3 Price Calculation Logic (priceEngine.js)

**Location:** `/packages/api/src/services/priceEngine.js`

**Price Calculation Pipeline:**

```
Function: calculatePrivateTour({regionId, tourId, serviceDate, vehicles, couponCode, userId})
  1. Validate: vehicles.length > 0
  2. For each vehicle in vehicles:
     - Query vehicle_pricing_rules (service_id = tourId OR NULL, ordered by specificity)
     - Sum: base_price × quantity
     → subtotal
  3. seasonAddition = calculate_season_addition(regionId, serviceDate, subtotal)
     - Find high_season_rule where serviceDate ∈ [start_date, end_date]
     - If found: additional = percentage × subtotal OR fixed amount
     - If not: additional = 0
     → seasonAdditional
  4. subtotalWithSeason = subtotal + seasonAdditional
  5. coupon = applyCoupon(code, userId, regionId, 'tour', subtotalWithSeason)
     - Validate coupon: active, date range, min_order, usage limits
     - Calculate discount: percentage × subtotalWithSeason OR fixed amount
     - Apply max_discount_amount cap
     - Cap discount ≤ subtotalWithSeason
     → discount, couponId
  6. total = MAX(0, subtotalWithSeason - discount)
  7. Return: {subtotalAmount, seasonAdditional, discountAmount, totalAmount, vehicleDetails, breakdown}

Function: calculateSharedTour({regionId, tourId, serviceDate, peopleCount, couponCode, userId})
  1. Fetch tour: is_shared_enabled, shared_price_per_person
  2. subtotal = shared_price_per_person × peopleCount
  3. Same season, coupon logic as above
  4. Return: {pricePerPerson, peopleCount, subtotalAmount, seasonAdditional, ...}

Function: calculateTabbedTransfer({regionId, routeId, serviceDate, serviceTime, couponCode, userId})
  1. validateTransferAdvance(serviceDate, serviceTime)
     - Get setting: transfer_min_advance_hours (default 4)
     - Now + 4h ≤ serviceDate/serviceTime → throw if false
  2. Fetch transfer_route: default_price, extra_stop_price, night_fee
  3. subtotal = default_price
  4. Season, coupon, etc.
  5. Return: {subtotalAmount, ...}

Function: applyCoupon(code, userId, regionId, serviceType, subtotal)
  - Query coupon by code (case-insensitive)
  - Check: is_active, valid_from ≤ now ≤ valid_until
  - Check: applicable_service_type (NULL or matching)
  - Check: applicable_region_id (NULL or matching)
  - Check: subtotal ≥ min_order_amount
  - Count coupon_redemptions:
    - WHERE coupon_id = c.id → usage_limit_total
    - WHERE coupon_id = c.id AND user_id = u.id → usage_limit_per_user
  - Calculate:
    - If discount_type = 'percentage': discount = subtotal × (discount_value / 100)
    - If discount_type = 'fixed': discount = discount_value
  - Apply caps:
    - discount = MIN(discount, max_discount_amount)
    - discount = MIN(discount, subtotal)
  - Return: {discount, couponId}

Function: getSeasonAddition(regionId, serviceDate, subtotal)
  - Query high_season_rules WHERE region_id = r AND is_active AND serviceDate ∈ [start_date, end_date]
  - If found:
    - If additional_type = 'percentage': return subtotal × (additional_value / 100)
    - If additional_type = 'fixed': return additional_value
  - Else: return 0
```

**All calculations rounded to 2 decimals (cents).**

---

### 3.4 Geo Filtering (services/geo.js)

**Function:** `filterByRadius(data, lat, lon, radius)`

For each service in data:
- If no lat/lon on service: use region's center_lat/center_lon
- Calculate distance = haversine_km(user_lat, user_lon, service_lat, service_lon)
- radius_km = service.service_radius_km OR region.service_radius_km OR 100 (default)
- Include if distance ≤ radius_km

**Used by:**
- GET /api/tours (optional: ?lat=X&lon=Y&radius=Z)
- GET /api/transfers (optional: ?lat=X&lon=Y&radius=Z)

---

## 4. Frontend Turista (packages/turista)

### Main User Flow

```
Home → Region Picker (GPS or select) → Browse Tours/Transfers
  ↓
Tour/Transfer Detail → Pick date, time, people, location
  ↓
Price Preview (calculated by backend) → Checkout
  ↓
Payment (Mercado Pago) → Booking Code
  ↓
Bookings List → Track status (new → awaiting_dispatch → confirmed → en_route → completed)
  ↓
Review post-service
```

### Pages & Components

| Page/Component | Location | Purpose |
|---|---|---|
| **Home** | `src/pages/Home.jsx` | Featured tours, banners, region intro |
| **Tours** | `src/pages/Tours.jsx` | List all tours, filtered by region/category/search |
| **TourDetail** | `src/pages/TourDetail.jsx` | Full itinerary, schedule, gallery, vehicle options, pricing calculator |
| **Transfers** | `src/pages/Transfers.jsx` | List/search transfers; or form to request custom quote |
| **TransferQuotes** | (implied) | Show user's pending/quoted/accepted transfer quotes, countdown timer |
| **Checkout** | (cart flow) | Selected tour + vehicles/date/time → Review price breakdown → Mercado Pago modal |
| **Bookings** | `src/pages/Bookings.jsx` | List user's reservations: past & upcoming |
| **BookingDetail** | `src/pages/BookingDetail.jsx` | Reservation status, booking code, vehicle/guide info, driver contact, maps link, cancel button, review form |
| **Login** | `src/pages/Login.jsx` | Email/phone + password |
| **Register** | `src/pages/Register.jsx` | Full name, contact, password, optional profile fields |
| **Profile** | `src/pages/Profile.jsx` | Edit name, birth date, document, nationality, gender, emergency contact, saved addresses |
| **Auth** | `src/pages/Auth.jsx` | Wrapper/router for login/register |

### State Management (Contexts)

| Context | Location | State Managed |
|---------|----------|---------------|
| **AuthContext** | `src/contexts/AuthContext.jsx` | token, user profile, login/logout, signup |
| **RegionContext** | `src/contexts/RegionContext.jsx` | selected region, GPS coords, regions list, geo-filtering |
| **BookingContext** | (if exists) | current draft booking, cart items |

### RegionContext Details

**Key Functions:**
- `detectGPS()` — requests browser geolocation
- `selectRegion(region)` — user picks region from picker
- `applyCoords(lat, lon)` — GPS coords → find region + reverse geocode
- `getServiceQuery()` — returns {lat, lon} or {region_id} for API filters

**GPS Integration:**
- Uses browser Geolocation API
- Reverse geocodes via OpenStreetMap Nominatim API
- Haversine distance calculation (client-side)
- Watches position in background (enableHighAccuracy, 60s max age)

### Key External Integrations

| Service | Used For | Notes |
|---------|----------|-------|
| **Google Places API** | Autocomplete pickup/destination in booking form | Frontend only; Nominatim reverse-geocode for display |
| **OpenStreetMap Nominatim** | Reverse geocode GPS → place name | Slower than Google but free & no API key |
| **Mercado Pago** | Payment processing | Embedded iframe or redirect; webhook to backend |

---

## 5. Frontend Operador (packages/operador)

### Main User Flow

```
Login (user_type = 'operator') → Dashboard
  ↓
**Accept/Auto-Dispatch Bookings:**
  Today's bookings → kanban board → status transition → mark started/completed
  ↓
**Quote Custom Transfers:**
  Pending quotes → review origin/destination/people/date → enter price → client accepts/rejects
  ↓
**Earnings:**
  Commission tracker → daily/monthly totals → payout status
  ↓
**Preferences:**
  Select which tours/vehicles/transfers you want to work with
```

### Pages & Components

| Page/Component | Purpose |
|---|---|
| **Dashboard** | Home: today's stats, pending quotes count, earnings summary |
| **Bookings/Dispatch** | Kanban board: columns by status (new → awaiting_dispatch → confirmed → assigned → en_route → in_progress → completed) |
| **BookingDetail** | Booking info: customer name/phone, pickup location (maps link), destination, vehicle, notes, contact & confirm buttons |
| **Quotes/Pending** | List pending quotes: origin/destination, people, date/time, urgency flag, countdown timer |
| **QuoteDetail** | Full quote form: customer, route, propose price, notes, submit |
| **Earnings** | Commission history, payout schedule, daily/monthly breakdown |
| **Preferences** | Checkboxes: which tours/vehicles/transfers to opt into |
| **Profile** | Driver details: name, phone, document, vehicle info |

---

## 6. Frontend Admin (packages/admin)

### Main User Flow

```
Login (user_type = 'admin') → Dashboard
  ↓
**Catalog Management:**
  Tours CRUD → edit name, price, vehicle rules
  Transfers CRUD → fixed routes
  Vehicles CRUD → specs, capacity, allowed uses
  ↓
**Pricing:**
  Vehicle pricing rules → per-service overrides
  High-season rules → July–Jan +10%
  Coupons → create/manage discount codes
  ↓
**Financial Dashboard:**
  Revenue: gross, net, commissions, payouts
  Daily/weekly/monthly breakdowns
  Ledger view: all entries (inflow/outflow, status)
  ↓
**Operational:**
  Kanban board → dispatch bookings to operators
  Assign drivers/guides
  Track real-time status
  ↓
**Users:**
  List users by type → suspend/activate
  Edit roles, contact
  ↓
**System Settings:**
  Global config: currency, timezone, cancellation window, commission %, API keys, etc.
  ↓
**Audit Log:**
  Who did what, when, to which entity
```

### Pages & Components

| Page/Component | Purpose |
|---|---|
| **Dashboard/Stats** | KPIs: reservations today, pending payments, value, margin % |
| **Tours** | List/create/edit/delete tours + schedules |
| **Transfers** | CRUD transfers & routes |
| **Vehicles** | CRUD vehicles |
| **PricingRules** | CRUD vehicle pricing by service |
| **Seasons** | High-season rules (date range + % increase) |
| **Holidays** | Special dates (pricing/availability impact) |
| **Coupons** | Create/manage discount codes |
| **Categories** | CRUD tour categories |
| **Operational** | Kanban board (by date): dispatch + assign |
| **Financial** | Revenue dashboard: gross/net, commissions, period analysis |
| **Users** | List users, filter by type/status, edit roles/suspend |
| **Settings** | Key-value pairs: currency, timezone, cancellation policy, commission %, thresholds |
| **AuditLog** | Searchable log of admin actions |
| **Regions** | (basic) List/create regions |

---

## 7. Regras de Negócio

### 7.1 Pricing Logic

**Base Price:**
- Tours (private): sum of vehicle base_prices × quantity
- Tours (shared): shared_price_per_person × people_count
- Transfers (tabbed): transfer_route.default_price
- Transfers (quoted): operador sets price manually

**High Season Addition:**
- Date range: July 1 – January 31 (annual rule)
- Type: Percentage (+10%) or fixed (R$ 200)
- Applied to: all services or tours-only (configurable)
- Calculation: addition = subtotal × (10 / 100) = subtotal + addition_amount

**Coupon Discount:**
- Type: Fixed (R$ 50 off) or Percentage (15% off)
- Constraints:
  - Min order amount (e.g., ≥ R$ 200)
  - Max discount cap (e.g., ≤ R$ 100 even if 15% is more)
  - Usage limit total (e.g., 100 uses globally)
  - Usage limit per user (e.g., 1 use per customer)
  - Date range (valid_from to valid_until)
  - Service type (tours only, transfers only, or both)
  - Region (specific region or all)
- Application: applied AFTER season addition
- Capping: never discount > subtotal

**Final Calculation:**
```
total = MAX(0, (subtotal + season_addition) - discount)
```

**Immutability:**
- Once payment.status = 'approved', booking.total_amount, subtotal_amount, season_additional_amount, discount_amount are frozen
- No price adjustments post-payment

---

### 7.2 Booking Lifecycle

#### Commercial Status

```
draft                    → awaiting_payment → paid → (completed OR refunded/cancelled)
└─ created but no payment link yet
                           └─ awaiting Mercado Pago approval
                                            └─ payment approved; ready for dispatch
                                                           └─ service complete (or customer refunded)
```

#### Operational Status

```
new → awaiting_dispatch → confirmed → assigned → en_route → in_progress → completed
                                                                                ├─ OR cancelled (customer)
                                                                                └─ OR occurrence (incident)
```

#### Transitions

| From | To | Trigger |
|------|----|---------
| draft | awaiting_payment | User clicks "Go to Payment" |
| awaiting_payment | paid | Payment webhook approves |
| awaiting_payment | payment_failed | Payment webhook fails/rejects |
| paid | awaiting_dispatch | (automatic on payment approval) |
| awaiting_dispatch | confirmed | Operator confirms availability |
| confirmed | assigned | Driver assigned |
| assigned | en_route | Driver indicates en route |
| en_route | in_progress | Service started (customer boarded) |
| in_progress | completed | Service finished |
| (any) | cancelled | Customer/admin cancel (with refund logic) |
| (any) | occurrence | Safety/incident reported |

**Constraint:** shared mode only valid for tours (constraint in DB)

---

### 7.3 Financial Ledger

**Every paid booking creates 3+ ledger entries:**

| Entry Type | Direction | Amount | Status | Notes |
|---|---|---|---|---|
| booking_gross | inflow | customer_total | pending (until credited) | What customer paid |
| gateway_fee | outflow | 3.5% of gross | pending | Mercado Pago's cut |
| booking_net | inflow | gross - fee | pending | What Giro receives |
| commission_platform | outflow | 7% of gross | pending | Giro's commission (split: platform + operator) |
| commission_agency | outflow | agency % (if applicable) | pending | Agency partner cut |
| payout_operator | outflow | TBD | ready/paid | Driver's earnings |
| refund | outflow | amount | (auto) | If customer cancels within 24h |

**Status Transitions:**
- pending → (no action)
- scheduled → (batch processing date)
- credited → (MP confirmed transfer)
- paid → (payout sent to bank account)
- cancelled → (refund processed)

**Margin Calculation:**
```
margin_percent = ((gross - fee - commissions) / gross) × 100
```

---

### 7.4 Commissions & Payouts

**Model:** Percentage-based

**Split (example):**
- Booking gross: R$ 1000
- Giro commission (7%): R$ 70
  - Giro platform keeps: R$ 40 (5.7%)
  - Driver/operator earns: R$ 30 (3%)
- Agency (if applicable): R$ X

**Payout Cycle:**
- Commission created with payout_status = 'pending' on payment approval
- After X days (configurable), status → 'ready'
- Batch payout to driver's bank account → 'paid'

**Driver View (Operador App):**
- Earnings dashboard: sum of commissions (pending + ready + paid)
- Payout schedule: next payout date, total amount

---

### 7.5 Transfer Quote Flow

**Timeline:**

```
T=0s          T=request           T=quote+2h              T=quote+3h
User submits  Operador         Client has 2h to decide Expires (auto)
              notified            
              ↓
              ~T=5min: Operador reviews & proposes price
              ↓
              T=request+2h: Client accepts or rejects
                ├─ Accept: status = 'accepted', awaits payment
                │           ↓
                │           User pays → booking created → status = 'paid'
                │           ↓
                │           Dispatch → completion
                ├─ Reject: status = 'rejected', turista can re-request
                └─ No response: status = 'expired' (auto-job at T=request+2h)
```

**4-Hour Minimum (Transfer):**
- Turista must request ≥ 4h before service_date/service_time
- Enforced in POST /api/transfers/quotes & POST /api/bookings

**Quote Expiry:**
- Operador submits price at T=0
- Client has `quote_expiry_hours` (default 2h) to respond
- Automation job runs every 15min: sets status = 'expired' if expires_at < now

---

### 7.6 Shared Booking Capacity Management

**Scenario:** Jardineira holds 16 people; multiple bookings on same date/time share it

**Database:**
- services_availability.avail_date, avail_time, total_capacity=16, used_capacity=0

**Workflow:**
1. Turista books shared tour on 2026-05-15 @ 08:00 for 3 people
2. Booking created with booking_mode = 'shared'
3. Trigger on booking payment: used_capacity += 3 → now 3/16
4. Another turista books same time for 5 people
5. Trigger: used_capacity += 5 → now 8/16
6. Remaining: 8 seats available
7. If someone cancels (4 people): trigger -= 4 → back to 4/16

**Validation:** POST /api/bookings checks remaining capacity before creating

---

## 8. Integrações Externas

| Service | Purpose | Used By | Endpoint/Auth |
|---------|---------|---------|---------------|
| **Supabase** | Auth, DB, Storage | API, Frontends | SUPABASE_URL, SUPABASE_KEY |
| **Mercado Pago** | Payment processing | API (payments/intent, webhook) | MERCADO_PAGO_ACCESS_TOKEN |
| **Google Maps API** | Places autocomplete | Turista (booking form) | VITE_GOOGLE_MAPS_API_KEY |
| **OpenStreetMap Nominatim** | Reverse geocoding | Turista (RegionContext) | Free, no auth; User-Agent required |
| **Render** | API hosting | CI/CD | render.com deploy trigger |
| **GitHub Pages** | Static frontend hosting | CI/CD | GitHub Actions |

### Supabase

**Services Used:**
- Auth (Postgres users + JWT tokens)
- PostgreSQL (30 tables + views + functions)
- Storage (avatars bucket)

**Environment Variables:**
- SUPABASE_URL=https://{project}.supabase.co
- SUPABASE_ANON_KEY={public key}
- SUPABASE_SERVICE_ROLE_KEY={secret key, backend only}

---

### Mercado Pago

**Flow:**
1. POST /api/payments/intent: create payment preference → returns clientToken
2. Frontend opens Mercado Pago iframe/redirect
3. User pays (Pix, credit card, etc.)
4. MP POSTs webhook to /api/payments/webhook
5. Backend processes: payment_events idempotence, ledger entries, commission

**Environment Variables:**
- MERCADO_PAGO_ACCESS_TOKEN={access token}

---

### Google Maps (Turista Only)

**Uses:**
- Places Autocomplete API (in booking form)
- No backend call; direct frontend integration

**Environment Variables:**
- VITE_GOOGLE_MAPS_API_KEY={public API key}

---

### OpenStreetMap Nominatim

**Uses:**
- Reverse geocoding (lat/lon → place name)
- Free, rate-limited

**Call from:** RegionContext.js → reverseGeocode()

```
GET https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=14
```

---

## 9. Variáveis de Ambiente

### Backend (packages/api/.env)

```bash
NODE_ENV=production

# Port
PORT=3001

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=...

# CORS Origins
TURISTA_URL=https://turista.giro-jeri.com
COOP_URL=https://operador.giro-jeri.com
ADMIN_URL=https://admin.giro-jeri.com

# Email/Notifications
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
```

### Turista Frontend (packages/turista/.env)

```bash
VITE_API_URL=https://api.giro-jeri.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
```

### Operador Frontend (packages/operador/.env)

```bash
VITE_API_URL=https://api.giro-jeri.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

### Admin Frontend (packages/admin/.env)

```bash
VITE_API_URL=https://api.giro-jeri.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

---

## 10. Bubble.io Migration Mapping

### What Maps Naturally to Bubble

| Concept | Bubble Equivalent | Complexity | Notes |
|---------|-------------------|-----------|-------|
| **USERS** (tourists, operators, admins) | `Thing: User` with `type` field | ✅ Native | Supabase Auth → Bubble User; user_type → field; email/phone → native |
| **REGIONS** | `Thing: Region` | ✅ Native | Center lat/lon stored; Bubble's geo plugin for distance calc |
| **TOURS** | `Thing: Tour` | ✅ Native | Relationships to Region, Category, Vehicles via pricing rules |
| **TRANSFERS** | `Thing: Transfer` | ✅ Native | Base service; transfer_routes as list |
| **VEHICLES** | `Thing: Vehicle` | ✅ Native | Standard CRUD |
| **BOOKINGS** | `Thing: Booking` | ✅ Native | Central table; status_commercial + status_operational as fields or option sets |
| **BOOKING_ITEMS** | `Thing: BookingItem` (child of Booking) | ✅ Native | Denormalized snapshot for audit |
| **BOOKING_VEHICLES** | List field on Booking or separate thing | ✅ Native | Store snapshot of selected vehicles |
| **PAYMENTS** | `Thing: Payment` (child of Booking) | ✅ Native | MP integration via plugin or webhook |
| **FINANCIAL_LEDGER** | `Thing: LedgerEntry` | ✅ Native | Repeating group to view all; filters for daily/monthly |
| **COMMISSIONS** | `Thing: Commission` (child of Booking) | ✅ Native | Calculated on payment; displayed in operador earnings |
| **HIGH_SEASON_RULES** | `Thing: SeasonRule` | ✅ Native | Admin form to create; date range, % increase stored |
| **COUPONS** | `Thing: Coupon` | ✅ Native | Code, discount %, date range, usage limits |
| **COUPON_REDEMPTIONS** | `Thing: CouponRedemption` | ✅ Native | Audit log; linked to booking |
| **REVIEWS** | `Thing: Review` (child of Booking) | ✅ Native | 1–5 rating + comment |
| **AUDIT_LOGS** | `Thing: AuditLog` | ✅ Native | Record who/what/when/before/after |
| **NOTIFICATIONS** | `Thing: Notification` | ⚠️ Hybrid | Store sent notifications; integrate external service (Twilio for SMS/WhatsApp) |
| **AUTOMATION_JOBS** | ⚠️ Backend job | ⚠️ Plugin | Bubble's workflows + scheduled backend or external cron (n8n, Make) |
| **TRANSFER_QUOTES** | `Thing: Quote` | ✅ Native | Status machine (pending_quote → quoted → accepted/rejected/expired) |
| **OPERATOR_SERVICE_PREFERENCES** | List of Many-to-Many links | ✅ Native | operator → [tours/vehicles/transfers] preferences |
| **SYSTEM_SETTINGS** | `Thing: Setting` (key-value) | ✅ Native | Admin-only page to edit; cached on frontend load |
| **BANNERS** | `Thing: Banner` | ✅ Native | Simple text + image + CTA link |
| **USER_ADDRESSES** | `Thing: UserAddress` (child of User) | ✅ Native | List of addresses; pre-fill in booking form |
| **TOUR_SCHEDULES** | List on Tour or separate `Thing: Schedule` | ✅ Native | Departure time, weekdays array (or repeating group) |
| **TRANSFER_ROUTES** | List on Transfer or separate `Thing: TransferRoute` | ✅ Native | Origin/destination pairs with prices |
| **VEHICLE_PRICING_RULES** | `Thing: PricingRule` | ✅ Native | Complex but expressible: vehicle + service + base_price + season_price |
| **SERVICES_AVAILABILITY** | `Thing: Availability` | ✅ Native | Date + time + total_capacity + used_capacity |
| **CATEGORIES** | `Thing: Category` | ✅ Native | Simple lookup |

### Backend Logic That Needs Translation

| Logic | Bubble Solution | Effort |
|-------|-----------------|--------|
| **Price Calculation** | Bubble workflows (multi-step logic) or external API call to keep | ⚠️ Moderate | Best: external microservice (keep as REST API) |
| **Coupon Validation** | Workflow with multiple conditions | ⚠️ Moderate | Doable; complex validation best in external function |
| **Geofencing (haversine)** | Bubble's GEO plugin (distance calculator) or external function | ✅ Native | Bubble GEO plugin handles distance |
| **Season Addition** | Workflow: compare date to high_season_rules, multiply/add | ✅ Native | Doable in workflows |
| **Payment Webhook** | Bubble's webhook receiver (POST /inbound) | ⚠️ Requires setup | Bubble can receive MP webhook; process in workflows |
| **Auto Expiry (Quotes)** | Scheduled backend workflow (Bubble's recurring workflow or Make/n8n) | ⚠️ Cron job | Bubble supports scheduled workflows; may need external trigger for reliability |
| **Capacity Tracking (shared tours)** | Booking workflow: decrement used_capacity on payment; increment on cancel | ✅ Native | Standard Bubble flow |
| **RLS Policies** | Bubble's privacy rules (constraints on Thing) | ✅ Native | Bubble enforces privacy rules; users see only own bookings, etc. |
| **Audit Logging** | Auto-create AuditLog entry on Thing changes | ✅ Native | Bubble's change log + custom AuditLog thing |
| **Notifications** | External service (Twilio, SendGrid) triggered by Bubble workflows | ⚠️ Plugins | Twilio/SendGrid plugins or Make/n8n integration |
| **Idempotent Webhook** | Bubble workflow checks for duplicate payment_event before processing | ✅ Native | Doable; check if payment already processed |

### Migration Strategy

**Keep as External API (Recommended):**
1. **Pricing Engine** — complexity of vehicle rules + season + coupon best isolated
2. **Payment Webhook Handler** — complex transaction logic & ledger creation
3. **Geofencing queries** — if heavy traffic, dedicated microservice better than Bubble workflows

**Migrate to Bubble:**
1. **UI & Forms** — all pages, auth, workflows
2. **Data modeling** — things, fields, relationships, privacy rules
3. **Simple workflows** — status transitions, notifications (via integrations), audit logging
4. **Scheduling** — via Bubble's scheduled workflows (with external backup like n8n for reliability)

**Hybrid Approach (Recommended for MVP):**
- Bubble for UI, data, user/role management
- Keep Express API for: price calculation, payment webhook, geofencing (can be phased out later)
- Use Bubble's REST API connector to call backend APIs
- Plan to migrate complex logic into Bubble workflows over time

---

### Bubble Plugins Likely Needed

| Plugin | Use Case |
|--------|----------|
| **Geo Distance Calculator** | Haversine distance for radius filtering |
| **Twilio** | SMS/WhatsApp notifications |
| **SendGrid** | Email notifications |
| **Stripe or Mercado Pago Connector** | Direct payment integration (if not webhook-only) |
| **Google Places** | Autocomplete in booking forms |
| **Date/Time Manager** | Complex date calculations (season ranges, scheduling) |
| **JSON handling** | Store complex metadata (JSONB equivalent) |
| **File Upload** | Avatar storage (Bubble native or AWS S3 connector) |

### Bubble Best Practices for This Project

1. **Privacy Rules:** Enforce at DB level
   - Users can read/write only own bookings
   - Operators read only assigned/pending quotes
   - Admins read all

2. **Repeating Groups:** Use for listing (bookings, users, financial ledger)
   - Pagination: build custom with offset/limit

3. **Multi-Step Forms:** Booking checkout
   - Page 1: service selection
   - Page 2: date/time/people
   - Page 3: location (Google Places autocomplete)
   - Page 4: review price
   - Page 5: payment redirect

4. **Workflows:**
   - On booking creation: save snapshot items
   - On payment approval (webhook): create ledger entries, commission, notification jobs
   - Scheduled (every 15min): expire old quotes
   - On user changes: log audit entry

5. **Database Optimization:**
   - Denormalize ratings (tour.rating_average) if queries are expensive
   - Cache system_settings in Bubble workflow or state

---

## Appendix: Tables & Routes Summary

### Database: 30 Tables

1. users
2. regions
3. agencies
4. categories
5. tours
6. tour_schedules
7. transfers
8. transfer_routes
9. vehicles
10. vehicle_pricing_rules
11. high_season_rules
12. holidays
13. coupons
14. coupon_redemptions
15. services_availability
16. bookings
17. booking_items
18. booking_vehicles
19. payments
20. payment_events
21. financial_ledger
22. commissions
23. operational_assignments
24. notifications
25. automation_jobs
26. reviews
27. audit_logs
28. system_settings
29. banners
30. user_addresses
31. transfer_quotes (migration 002)
32. operator_service_preferences (migration 006)

**Views:**
- v_quotes_dashboard
- v_booking_maps_links

---

### API: 70+ Endpoints

**Auth (7):** register, login, me, refresh, me (PATCH), me/photo, logout

**Tours (7):** GET /, GET /:id, GET /:id/vehicles, POST /:id/suggest-vehicles, POST /:id/calculate, POST /, PUT /:id

**Transfers (11):** GET /, GET /routes, POST /calculate, POST /quotes, GET /quotes, GET /quotes/pending, PATCH /quotes/:id/quote, POST /quotes/:id/accept, POST /quotes/:id/reject, POST /, PUT /:id, DELETE /:id

**Bookings (4):** POST /, GET /, GET /:id, POST /:id/cancel

**Payments (2):** POST /intent, POST /webhook

**Regions (1):** GET /

**Admin/Catalog (30+):** stats, financial, operational, users, categories, tours (CRUD), transfers (CRUD), transfer-routes (CRUD), pricing-rules (CRUD), seasons (CRUD), coupons (CRUD), settings, audit-logs

**Vehicles (1):** GET /

**Operator (2):** GET /preferences, PUT /preferences/:type/:entityId

---

### Key Workflows

**Turista:**
1. Browse (geo-filtered)
2. Book (calc price, pay, get code)
3. Track (status updates)
4. Review (post-service)

**Operador:**
1. Accept dispatch
2. Quote routes
3. Execute (mark status)
4. Earn (view commissions)

**Admin:**
1. Manage catalog
2. Set pricing/seasons
3. Create coupons
4. View financials
5. Dispatch & assign
6. Manage users

---

**END OF BUBBLE BLUEPRINT**

