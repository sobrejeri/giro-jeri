import { Router }    from 'express'
import crypto        from 'node:crypto'
import { z }         from 'zod'
import { supabase }  from '../supabase.js'
import { authenticate } from '../middleware/auth.js'
import { sendBookingConfirmation } from '../services/email.js'
import { notifyOperatorsNewBooking, notifyClientPaymentConfirmed, notifyOperatorPaymentReceived } from '../services/whatsapp.js'
import { notifyUser, notifyOperatorsAndAdmin } from '../services/notify.js'
import { calculatePrivateTour, calculateSharedTour, getDateSurcharge, validateTransferAdvance, applyCoupon } from '../services/priceEngine.js'
import { isBookingLegsEngineEnabled } from '../services/featureFlags.js'
import { sweepExpiredLegBookings } from '../services/legFlow.js'

const intentSchema = z.object({
  service_type:        z.enum(['tour', 'transfer']).optional(),
  service_id:          z.string().uuid().optional(),
  service_date_iso:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)').optional(),
  total_price:         z.number({ coerce: true }).positive().min(1, 'Valor mínimo R$ 1,00').optional(),
  payment_method:      z.enum(['pix', 'credit_card', 'debit_card']).default('pix'),
  existing_booking_id: z.string().uuid().optional(),
  order_group_id:      z.string().uuid().optional(),   // carrinho universal: paga o grupo todo
  booking_mode:        z.enum(['private', 'shared']).optional(),
  service_date:        z.string().optional(),
  service_time:        z.string().optional(),
  people_count:        z.number({ coerce: true }).int().min(1).max(200).optional(),
  region_id:           z.string().uuid().optional(),
  vehicles:            z.array(z.object({
    vehicle_id: z.string().uuid(),
    qty:        z.number({ coerce: true }).int().min(1),
    unit_price: z.number({ coerce: true }).nonnegative().optional(),
  })).optional(),
  origin_text:      z.string().max(500).optional(),
  destination_text: z.string().max(500).optional(),
  service_name:     z.string().max(300).optional(),
  cover_image_url:  z.string().url().optional().nullable().or(z.literal('')),
  coupon_code:      z.string().max(50).optional(),
  // Campos de cartão (obrigatórios condicionalmente via .refine abaixo)
  card_token:         z.string().min(1).optional(),
  installments:       z.number({ coerce: true }).int().min(1).max(12).default(1),
  payment_method_id:  z.string().min(1).optional(),
  issuer_id:          z.string().optional(),
  // CPF/CNPJ do pagador. Aceita com ou sem máscara e salva apenas números.
  payer_doc: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v),
    z.string().regex(/^\d{11,14}$/).optional(),
  ),
}).refine(
  (d) => d.order_group_id || d.existing_booking_id || (d.service_id && d.service_date_iso && d.total_price),
  { message: 'Dados incompletos para criar reserva' },
).refine(
  (d) => !['credit_card', 'debit_card'].includes(d.payment_method) ||
          (d.card_token && d.payment_method_id && d.payer_doc),
  { message: 'Dados do cartão incompletos (card_token, payment_method_id, payer_doc)' },
)

// Solicitação de reserva (sem pagamento): subconjunto do intent, sem cartão.
const requestSchema = z.object({
  service_type:     z.enum(['tour', 'transfer']).optional(),
  service_id:       z.string().uuid(),
  service_date_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  total_price:      z.number({ coerce: true }).positive().min(1, 'Valor mínimo R$ 1,00'),
  booking_mode:     z.enum(['private', 'shared']).optional(),
  service_date:     z.string().optional(),
  service_time:     z.string().optional(),
  people_count:     z.number({ coerce: true }).int().min(1).max(200).optional(),
  region_id:        z.string().uuid().optional(),
  vehicles:         z.array(z.object({
    vehicle_id: z.string().uuid(),
    qty:        z.number({ coerce: true }).int().min(1),
    unit_price: z.number({ coerce: true }).nonnegative().optional(),
  })).optional(),
  origin_text:      z.string().max(500).optional(),
  destination_text: z.string().max(500).optional(),
  service_name:     z.string().max(300).optional(),
  cover_image_url:  z.string().url().optional().nullable().or(z.literal('')),
  coupon_code:      z.string().max(50).optional(),
  // Link direto de operador (/c/<slug>): o servidor resolve o slug e a
  // reserva nasce atribuída (sem fila, sem aceite). NUNCA aceitar operator_id
  // cru do cliente — só o slug, validado aqui.
  partner_slug:     z.string().max(80).optional(),
  // Programa de afiliados (/a/<código> ou código digitado): o servidor resolve
  // o código e grava bookings.affiliate_id — NUNCA aceita o id cru. A comissão
  // só nasce quando a reserva é paga (onPaymentApproved).
  affiliate_code:   z.string().max(24).optional(),
})

// Carrinho universal: array de itens, cada um no formato do requestSchema.
const cartRequestSchema = z.object({
  items: z.array(requestSchema).min(1, 'Carrinho vazio').max(20, 'Muitos itens no carrinho'),
  partner_slug: z.string().max(80).optional(),
  affiliate_code: z.string().max(24).optional(),
})

const router = Router()

// O app envia null em campos vazios vindos do banco (ex.: origin_text de um
// passeio). Os campos .optional() do Zod aceitam undefined, mas não null —
// então convertemos null → undefined no corpo antes de validar.
function nullToUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v === null ? undefined : v
  return out
}

// Insere as linhas de booking_vehicles com snapshot de nome/capacidade do
// veículo (colunas NOT NULL na tabela) e propaga erro em vez de engolir.
async function insertBookingVehicles(bookingId, vehicles) {
  const ids = vehicles.map((v) => v.vehicle_id)
  const { data: vehicleRows = [], error: vErr } = await supabase
    .from('vehicles')
    .select('id, name, seat_capacity')
    .in('id', ids)
  if (vErr) throw vErr
  const byId = new Map(vehicleRows.map((v) => [v.id, v]))

  const rows = vehicles.map((v) => {
    const vehicle = byId.get(v.vehicle_id)
    const quantity = v.qty || 1
    const unitPrice = v.unit_price || 0
    return {
      booking_id:                bookingId,
      vehicle_id:                v.vehicle_id,
      vehicle_name_snapshot:     vehicle?.name || 'Veículo',
      vehicle_capacity_snapshot: vehicle?.seat_capacity || 1,
      quantity,
      unit_price:                unitPrice,
      total_price:               unitPrice * quantity,
    }
  })
  const { error } = await supabase.from('booking_vehicles').insert(rows)
  if (error) throw error
}

async function getPaymentSettings() {
  const { data = [] } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .like('setting_key', 'payment_%')
  return Object.fromEntries(data.map((s) => [s.setting_key, s.setting_value]))
}

// Recalcula o valor autoritativo da reserva (alta temporada / feriado / cupom)
// a partir do serviço, data e veículos. O cliente nunca define o valor cobrado.
// Devolve { total, couponId, discountAmount } para a reserva gravar o cupom e
// registrar o uso (coupon_redemptions). Falha → total do cliente, sem cupom.
async function computeChargedTotal({ data, userId }) {
  const {
    service_type, service_id, booking_mode, service_date_iso,
    people_count, region_id, vehicles = [], coupon_code, total_price,
  } = data
  let chargedTotal      = Number(total_price)
  let couponId          = null
  let discountAmount    = 0
  // Itemização: subtotal (antes de data/cupom) e acréscimo de data (alta
  // temporada OU feriado). Guardados nas reservas p/ o Dashboard somar as taxas.
  let subtotal          = Number(total_price)
  let seasonAdditional  = 0
  try {
    if (service_type === 'tour' && service_id && region_id && service_date_iso) {
      let r = null
      if (booking_mode === 'shared') {
        r = await calculateSharedTour({
          regionId: region_id, tourId: service_id, serviceDate: service_date_iso,
          peopleCount: Number(people_count) || 1, couponCode: coupon_code, userId,
        })
      } else {
        const vlist = (vehicles || []).map((v) => ({ vehicleId: v.vehicle_id, quantity: v.qty || 1 }))
        if (vlist.length) {
          r = await calculatePrivateTour({
            regionId: region_id, tourId: service_id, serviceDate: service_date_iso,
            vehicles: vlist, couponCode: coupon_code, userId,
          })
        }
      }
      if (r && typeof r.totalAmount === 'number') {
        chargedTotal     = r.totalAmount
        couponId         = r.couponId || null
        discountAmount   = Number(r.discountAmount) || 0
        seasonAdditional = Number(r.seasonAdditional) || 0
        subtotal         = Number(r.subtotalAmount) || chargedTotal
      }
    } else if (service_type === 'transfer' && service_id && region_id && service_date_iso) {
      // Rota tabelada: recalcula a partir do preço da rota × veículos + acréscimo
      // de data. Cotações (translado personalizado) têm preço fechado pela
      // operador e não casam com nenhuma rota → mantém o total enviado.
      const { data: route } = await supabase
        .from('transfer_routes').select('id, default_price').eq('id', service_id).maybeSingle()
      if (route) {
        const vehicleCount = (vehicles || []).reduce((s, v) => s + (Number(v.qty) || 1), 0) || 1
        const baseSubtotal = Math.round(Number(route.default_price) * vehicleCount * 100) / 100
        const surcharge    = await getDateSurcharge(region_id, service_date_iso, baseSubtotal)
        subtotal           = baseSubtotal
        seasonAdditional   = surcharge
        chargedTotal       = Math.round((baseSubtotal + surcharge) * 100) / 100
        // Cupom em transfer tabelado (os calculate* de passeio já aplicam)
        if (coupon_code) {
          const c = await applyCoupon(coupon_code, userId, region_id, 'transfer', chargedTotal)
          couponId       = c.couponId || null
          discountAmount = Number(c.discount) || 0
          chargedTotal   = Math.round((chargedTotal - discountAmount) * 100) / 100
        }
      }
    }
  } catch (e) {
    console.error('[payments] recálculo de preço falhou, usando total do cliente:', e.message)
    chargedTotal     = Number(total_price)
    couponId         = null
    discountAmount   = 0
    subtotal         = Number(total_price)
    seasonAdditional = 0
  }
  return { total: chargedTotal, couponId, discountAmount, subtotal, seasonAdditional }
}

// Credenciais Mercado Pago do operador (com refresh automático se o token
// estiver expirando). Retorna { token, publicKey, platformPct } ou null quando
// o operador não conectou a conta dela.
export async function getOperatorMp(operatorId) {
  if (!operatorId) return null
  const { data: op } = await supabase
    .from('users')
    .select('mp_access_token, mp_refresh_token, mp_token_expires_at, mp_public_key, platform_split_pct')
    .eq('id', operatorId)
    .single()
  if (!op?.mp_access_token) return null

  let token     = op.mp_access_token
  let publicKey = op.mp_public_key
  const expMs   = op.mp_token_expires_at ? new Date(op.mp_token_expires_at).getTime() : 0
  if (expMs && expMs < Date.now() + 60 * 1000 && op.mp_refresh_token) {
    try {
      const { refreshOAuthToken } = await import('../services/mercadoPago.js')
      const tok = await refreshOAuthToken({ refreshToken: op.mp_refresh_token })
      token     = tok.access_token || token
      publicKey = tok.public_key   || publicKey
      await supabase.from('users').update({
        mp_access_token:     tok.access_token  || op.mp_access_token,
        mp_refresh_token:    tok.refresh_token || op.mp_refresh_token,
        mp_public_key:       tok.public_key    || op.mp_public_key,
        mp_token_expires_at: tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString() : null,
      }).eq('id', operatorId)
    } catch (e) {
      console.error('[split] refresh de token MP falhou:', e.message)
    }
  }
  return { token, publicKey, platformPct: op.platform_split_pct }
}

// Contexto de split de um pagamento: token do operador + comissão da
// plataforma (application_fee). Null quando não há split (cai na plataforma).
// Plataforma recebe 100%? (migration 079) Quando sim, NENHUM pagamento leva
// split: o valor inteiro cai na conta da plataforma e a comissão do operador e
// o pagamento do executor viram repasses manuais.
//
// Decisão do dono depois de descobrir que split multi-recebedor só funciona com
// PIX — e voo de R$ 7.600 precisa de cartão parcelado.
//
// Fail-CLOSED de propósito: erro ao ler a configuração assume `true`, ou seja,
// sem split. Errar para o lado de "o dinheiro fica com a plataforma" é
// recuperável com um repasse; errar para o outro manda dinheiro para a conta de
// terceiro e não tem volta.
export function plataformaRecebeTudo(cfg) {
  const v = cfg?.payment_platform_receives_all
  if (v === undefined || v === null || v === '') return true
  return String(v) !== 'false'
}

// Split de UM operador: dois recebedores, e por isso FUNCIONA COM CARTÃO
// (`application_fee`). O que a 079 desligou foi o caso de vários recebedores
// (`disbursements`), que é PIX-only — não este.
//
// Quatro condições, todas obrigatórias:
//
//   1. a chave `payment_split_single_operator` está ligada;
//   2. a reserva tem UM operador (o que aceitou);
//   3. o modal NÃO tem executor fixo. Este é o mais importante: um split de
//      dois recebedores só alcança quem ACEITOU. Se o serviço é executado por
//      outro (o aéreo, sempre a mesma empresa), dividir no ato pagaria o
//      intermediário e deixaria quem voou sem nada — e sem volta;
//   4. o operador tem conta conectada no Mercado Pago.
//
// Falhando qualquer uma, devolve null e o valor cai inteiro na plataforma, que
// repassa na mão. Fail-closed: errar para "fica com a plataforma" se corrige
// com um repasse; errar para o outro lado manda dinheiro para conta de
// terceiro e não tem como desfazer.
// Modal de cada reserva, com o percentual da plataforma. Devolve null se
// QUALQUER uma não puder ser resolvida — e isso é decisivo: sem saber o modal,
// não se sabe se há executor fixo, e dividir às cegas manda dinheiro para a
// conta errada sem volta.
async function modaisDasReservas(bookings) {
  const { modalDaReserva } = await import('../services/payouts.js')
  const out = []
  for (const b of bookings) {
    if (!b?.service_id) return null            // reserva podada → não dá para verificar
    const slug = await modalDaReserva(b)
    if (!slug) return null                     // serviço sem modal → não dá para verificar
    const { data: modal } = await supabase
      .from('service_modals')
      .select('executor_operator_id, platform_commission_pct')
      .eq('slug', slug).maybeSingle()
    if (!modal) return null
    out.push({ booking: b, ...modal })
  }
  return out
}

// Split de operador ÚNICO: dois recebedores, e por isso FUNCIONA COM CARTÃO
// (`application_fee`). O que a 079 desligou foi o caso de vários recebedores
// (`disbursements`), que é PIX-only — não este.
//
// Vale para uma reserva sozinha E para um COMBO aceito inteiro pelo mesmo
// operador: nos dois casos o dinheiro vai para um só lugar, então continua
// sendo dois recebedores. Combo repartido entre operadores diferentes é que
// fica fora.
//
// Condições, todas obrigatórias:
//   1. a chave `payment_split_single_operator` está ligada;
//   2. há um operador, o mesmo em todas as reservas do pagamento;
//   3. TODOS os modais envolvidos foram identificados;
//   4. nenhum deles tem executor fixo diferente de quem aceitou. Este é o
//      ponto mais importante: um split de dois recebedores só alcança quem
//      ACEITOU. Num combo com voo, dividir pagaria o intermediário e deixaria
//      quem voou sem nada — e não tem como desfazer.
//
// Falhando qualquer uma, devolve null e o valor cai inteiro na plataforma, que
// repassa na mão. Fail-closed: errar para "fica com a plataforma" se corrige
// com um repasse; errar para o outro lado é irreversível.
async function contextoSplitOperadorUnico(bookings, chargedTotal, cfg) {
  if (String(cfg?.payment_split_single_operator ?? 'false') !== 'true') return null

  const lista = (bookings || []).filter(Boolean)
  if (lista.length === 0) return null
  const ops = [...new Set(lista.map((b) => b.operator_id).filter(Boolean))]
  if (ops.length !== 1 || lista.some((b) => !b.operator_id)) return null
  const operatorId = ops[0]

  const modais = await modaisDasReservas(lista)
  if (!modais) {
    console.warn('[split] modal não identificado em alguma reserva — mantendo manual')
    return null
  }
  for (const m of modais) {
    if (m.executor_operator_id && m.executor_operator_id !== operatorId) {
      console.warn('[split] modal com executor fixo no pagamento — mantendo manual')
      return null
    }
  }

  const opMp = await getOperatorMp(operatorId)
  if (!opMp) return null

  // Percentual da plataforma PONDERADO pelo valor de cada reserva. Um combo
  // pode juntar modais com percentuais diferentes (terrestre 20%, aquático
  // 15%), e um único application_fee precisa representar a soma das partes.
  // Aplicado sobre o COBRADO, não sobre a soma dos totais: cupom e acréscimo
  // de data mudam o que entrou, e a divisão tem que fechar com isso.
  const geral = (opMp.platformPct != null ? Number(opMp.platformPct) : Number(cfg?.payment_split_admin_pct)) || 0
  let somaValor = 0
  let somaPeso  = 0
  for (const m of modais) {
    const v   = Number(m.booking.total_amount) || 0
    const pct = m.platform_commission_pct != null ? Number(m.platform_commission_pct) : geral
    somaValor += v
    somaPeso  += v * pct
  }
  const pct = somaValor > 0 ? somaPeso / somaValor : geral

  const applicationFee = Math.round(chargedTotal * (pct / 100) * 100) / 100
  // Comissão que zera o operador não é split, e maior que o cobrado o MP
  // recusaria — nos dois casos, manual.
  if (!(applicationFee >= 0) || applicationFee >= chargedTotal) {
    console.warn('[split] comissão de %s%% inviável para R$ %s — mantendo manual', pct, chargedTotal)
    return null
  }
  return { sellerAccessToken: opMp.token, applicationFee, operatorId }
}

async function getSplitContext(booking, chargedTotal, cfg) {
  // Sem a 079 ligada, o comportamento antigo: split para todo operador
  // conectado, pelo percentual dele.
  if (!plataformaRecebeTudo(cfg)) {
    const opMp = await getOperatorMp(booking?.operator_id)
    if (!opMp) return null
    const pct = (opMp.platformPct != null ? Number(opMp.platformPct) : Number(cfg?.payment_split_admin_pct)) || 0
    const applicationFee = Math.round(chargedTotal * (pct / 100) * 100) / 100
    return { sellerAccessToken: opMp.token, applicationFee, operatorId: booking?.operator_id }
  }
  return contextoSplitOperadorUnico([booking], chargedTotal, cfg)
}

// =============================================================================
// MOTOR DE PERNAS (Etapa 2, Onda A) — split nativo N-recebedores, atrás da
// flag booking_legs_engine_enabled. Escopo: só itens por veículo (privativo +
// transfer de rota) — únicos que geram booking_legs hoje.
// =============================================================================

// Soma o leg_price das pernas ACEITAS por operador. Map<operatorId, valor>.
async function getAcceptedLegRecipients(bookingId) {
  const { data: legs, error } = await supabase
    .from('booking_legs')
    .select('operator_id, leg_price')
    .eq('booking_id', bookingId)
    .eq('status_leg', 'accepted')
  if (error) throw error
  const byOperator = new Map()
  for (const l of legs || []) {
    if (!l.operator_id) continue
    byOperator.set(l.operator_id, (byOperator.get(l.operator_id) || 0) + Number(l.leg_price))
  }
  return byOperator
}

// Distribui `totalCents` (inteiro) entre N recebedores proporcionalmente a
// `weights`, somando EXATAMENTE ao total (método do maior resto). Trabalha em
// centavos inteiros para não acumular drift de float, e garante o invariante
// que o split nativo do MP exige: Σ(amounts) === transaction_amount.
function allocateCents(totalCents, weights) {
  const n = weights.length
  if (n === 0) return []
  let sum = weights.reduce((a, b) => a + b, 0)
  let w   = weights
  if (sum <= 0) { w = weights.map(() => 1); sum = n } // pesos degenerados → igual
  const raw   = w.map((x) => (totalCents * x) / sum)
  const cents = raw.map((x) => Math.floor(x))
  const rest  = totalCents - cents.reduce((a, b) => a + b, 0) // centavos a distribuir (0..n-1)
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac) // maiores restos primeiro
  for (let k = 0; k < rest; k++) cents[order[k % n].i] += 1
  return cents
}

// Contexto de split "consciente de pernas": se o pedido não tem pernas (Onda B
// ainda não implementada — compartilhado/cotação) ou tem pernas mas só 1
// operador aceitou, retorna o MESMO formato de getSplitContext (caminho de
// 1 recebedor intacto, sem chamada diferente ao MP). Só quando há 2+
// operadores distintas entre as pernas aceitas é que monta o split nativo
// com `disbursements` (N recebedores em 1 pagamento).
async function getSplitContextForBooking(booking, chargedTotal, cfg) {
  if (plataformaRecebeTudo(cfg)) return null
  const byOperator = await getAcceptedLegRecipients(booking.id)

  if (byOperator.size === 0) {
    // Sem pernas aceitas registradas (pedido sem booking_legs, ou pernas sem
    // operator_id) — cai no caminho legado por bookings.operator_id.
    const legacy = await getSplitContext(booking, chargedTotal, cfg)
    return legacy ? { ...legacy, mode: 'single' } : null
  }

  if (byOperator.size === 1) {
    const [operatorId] = [...byOperator.keys()]
    const legacy = await getSplitContext({ ...booking, operator_id: operatorId }, chargedTotal, cfg)
    return legacy ? { ...legacy, mode: 'single' } : null
  }

  // N recebedores — todas os operadores precisam ter conta MP conectada
  // (pré-requisito do desenho, migration 036/OAuth). Sem token/mp_user_id de
  // alguma delas, aborta com erro claro em vez de cobrar sem repassar.
  // Particiona o TOTAL COBRADO (chargedTotal) — não a soma dos leg_price —
  // proporcionalmente ao leg_price de cada operador, em centavos inteiros e
  // somando exato ao total. Assim Σ(disbursements.amount) == transaction_amount
  // (invariante do split nativo do MP) mesmo com surcharge de data/feriado
  // embutida no total e sem drift de arredondamento entre recebedores.
  const entries    = [...byOperator.entries()]                       // [operatorId, sliceReais]
  const totalCents = Math.round(Number(chargedTotal) * 100)
  const weights    = entries.map(([, slice]) => Math.round(Number(slice) * 100))
  const shareCents = allocateCents(totalCents, weights)

  const recipients = []
  let totalApplicationFeeCents = 0
  for (let idx = 0; idx < entries.length; idx++) {
    const [operatorId] = entries[idx]
    const opMp = await getOperatorMp(operatorId)
    if (!opMp?.token) {
      throw new Error(`Operador ${operatorId} sem conta Mercado Pago conectada — split multi-operador exige todas as pernas aceitas conectadas.`)
    }
    const { data: op } = await supabase.from('users').select('mp_user_id').eq('id', operatorId).single()
    if (!op?.mp_user_id) {
      throw new Error(`Operador ${operatorId} sem mp_user_id (reconecte a conta Mercado Pago) — split multi-operador bloqueado.`)
    }
    const pct      = (opMp.platformPct != null ? Number(opMp.platformPct) : Number(cfg?.payment_split_admin_pct)) || 0
    const amtCents = shareCents[idx]
    // Comissão da plataforma sobre a fatia da perna, nunca maior que a fatia.
    const feeCents = Math.min(amtCents, Math.round(amtCents * (pct / 100)))
    totalApplicationFeeCents += feeCents
    recipients.push({
      operatorId,
      collectorId:        op.mp_user_id,
      amount:              amtCents / 100,
      applicationFee:      feeCents / 100,
      externalReference:  `${booking.id}:${operatorId}`,
    })
  }

  return { mode: 'multi', recipients, totalApplicationFee: totalApplicationFeeCents / 100 }
}

// Split do GRUPO (carrinho universal): agrega as pernas aceitas de TODAS as
// reservas do grupo por operador. Opção 2 (segura): resolve só o caminho de
// recebedor ÚNICO (1 coop) ou sem split (motor OFF/compartilhado); 2+ coops
// devolve mode:'multi' para o chamador BLOQUEAR — split multi-coop de grupo
// fica para depois de validar o split nativo do MP em staging.
async function getSplitContextForGroup(bookings, combinedTotal, cfg) {
  // Com a 079 ligada, o único split permitido é o de operador único — inclusive
  // quando o pagamento é de um COMBO aceito inteiro pelo mesmo operador: ainda
  // são dois recebedores, então funciona no cartão.
  if (plataformaRecebeTudo(cfg)) {
    const ctx = await contextoSplitOperadorUnico(bookings, combinedTotal, cfg)
    return ctx ? { ...ctx, mode: 'single' } : { mode: 'single' }
  }
  const byOperator = new Map()
  for (const b of bookings) {
    const m = await getAcceptedLegRecipients(b.id)
    for (const [op, val] of m) byOperator.set(op, (byOperator.get(op) || 0) + val)
  }
  if (byOperator.size === 0) {
    // Sem pernas (motor OFF — reserva inteira): se TODAS as reservas do grupo
    // estão com a MESMO operador (combo aceito ou venda direta por link),
    // o pagamento único cai na conta dela, como no fluxo de reserva única.
    const ops = [...new Set(bookings.map((b) => b.operator_id).filter(Boolean))]
    if (ops.length === 1 && bookings.every((b) => b.operator_id)) {
      // Reservas REAIS, não `{ operator_id }`: sem `service_id` não dá para
      // saber o modal, e sem o modal não dá para saber se há executor fixo.
      const legacy = await contextoSplitOperadorUnico(bookings, combinedTotal, cfg)
        || await getSplitContext({ operator_id: ops[0] }, combinedTotal, cfg)
      return legacy ? { ...legacy, mode: 'single' } : { mode: 'single' }
    }
    if (ops.length > 1) return { mode: 'multi' } // coops diferentes → bloqueia (Opção 2)
    return { mode: 'single' }                    // nenhuma coop definida → plataforma
  }
  if (byOperator.size === 1) {
    const [operatorId] = [...byOperator.keys()]
    const legacy = await contextoSplitOperadorUnico(
      bookings.map((b) => ({ ...b, operator_id: operatorId })), combinedTotal, cfg,
    ) || await getSplitContext({ operator_id: operatorId }, combinedTotal, cfg)
    return legacy ? { ...legacy, mode: 'single' } : { mode: 'single' }
  }
  return { mode: 'multi' }                                       // bloqueado no chamador (Opção 2)
}

// ── Cutoff de solicitação (R6) ─────────────────────────────────────────
// Passeios/transfers podem ter horário limite para reserva no MESMO dia
// (tours.booking_cutoff_time / transfers.booking_cutoff_time). Passou do
// horário → só a partir do dia seguinte. O frontend já bloqueia o calendário;
// esta é a defesa real no servidor. America/Fortaleza é UTC-3 o ano todo.
function fortalezaNowParts() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((acc, x) => { acc[x.type] = x.value; return acc }, {})
  return { todayIso: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

async function checkBookingCutoff({ service_type, service_id, service_date_iso }) {
  if (!service_id || !service_date_iso) return null
  const { todayIso, minutes: nowMin } = fortalezaNowParts()
  // Só restringe o próprio dia; datas futuras estão sempre liberadas.
  if (service_date_iso !== todayIso) return null

  let cutoff = null
  if (service_type === 'tour') {
    const { data } = await supabase.from('tours')
      .select('booking_cutoff_time').eq('id', service_id).maybeSingle()
    cutoff = data?.booking_cutoff_time || null
  } else if (service_type === 'transfer') {
    // service_id é um transfer_route; o cutoff mora no transfer pai.
    const { data } = await supabase.from('transfer_routes')
      .select('transfers ( booking_cutoff_time )').eq('id', service_id).maybeSingle()
    cutoff = data?.transfers?.booking_cutoff_time || null
  }
  if (!cutoff) return null

  const cutoffMin = Number(String(cutoff).slice(0, 2)) * 60 + Number(String(cutoff).slice(3, 5))
  if (nowMin >= cutoffMin) {
    const label = `${String(cutoff).slice(0, 2)}h${String(cutoff).slice(3, 5)}`
    return `Este serviço só aceita solicitações até ${label} para o mesmo dia. Escolha a partir de amanhã.`
  }
  return null
}

// Janela de operação do serviço (migration 069): o horário escolhido precisa
// estar entre service_window_start e service_window_end. Nulo = sem restrição.
// Validado no SERVIDOR porque regra só na tela é contornável chamando a API.
async function checkServiceWindow({ service_type, service_id, service_time }) {
  if (!service_id || !service_time) return null

  let win = null
  if (service_type === 'tour') {
    const { data, error } = await supabase.from('tours')
      .select('service_window_start, service_window_end').eq('id', service_id).maybeSingle()
    if (error?.code === '42703') return null   // migration 069 pendente
    win = data
  } else if (service_type === 'transfer') {
    // service_id é um transfer_route; a janela mora no transfer pai.
    const { data, error } = await supabase.from('transfer_routes')
      .select('transfers ( service_window_start, service_window_end )').eq('id', service_id).maybeSingle()
    if (error?.code === '42703') return null
    win = data?.transfers
  }
  if (!win?.service_window_start && !win?.service_window_end) return null

  const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5))
  const hhmm  = (t) => `${String(t).slice(0, 2)}h${String(t).slice(3, 5)}`
  const alvo  = toMin(service_time)

  if (win.service_window_start && alvo < toMin(win.service_window_start)) {
    return `Este serviço começa a partir das ${hhmm(win.service_window_start)}. Escolha um horário dentro do período de operação.`
  }
  if (win.service_window_end && alvo > toMin(win.service_window_end)) {
    return `Este serviço só opera até as ${hhmm(win.service_window_end)}. Escolha um horário dentro do período de operação.`
  }
  return null
}

// ── POST /api/payments/intent ───────────────────────────
router.post('/intent', authenticate, async (req, res, next) => {
  try {
    const parsed = intentSchema.safeParse(nullToUndefined(req.body))
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' })
    }

    const {
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles = [],
      origin_text, destination_text,
      total_price, payment_method = 'pix',
      service_name, cover_image_url,
      coupon_code, existing_booking_id, order_group_id,
      card_token, installments = 1, payment_method_id, issuer_id, payer_doc,
    } = parsed.data

    const isGroup = !!order_group_id

    // R6: reserva nova (não repagamento nem grupo) respeita o cutoff do serviço.
    // Grupo já validou cutoff/antecedência na criação (cart-request).
    if (!existing_booking_id && !isGroup) {
      const cutoffErr = await checkBookingCutoff({ service_type, service_id, service_date_iso })
      if (cutoffErr) return res.status(400).json({ error: cutoffErr })
      const windowErr = await checkServiceWindow({ service_type, service_id, service_time })
      if (windowErr) return res.status(400).json({ error: windowErr })
    }

    // ── Total autoritativo: o SERVIDOR é a fonte de verdade do valor cobrado.
    //    Reserva nova → recalcula (alta temporada/feriado). Reserva já existente
    //    (pagamento pós-aceite) → usa o total já gravado no banco. Grupo → soma
    //    dos totais já gravados das reservas do grupo (definido abaixo). ───────
    let chargedTotal = existing_booking_id
      ? Number(total_price)
      : isGroup ? 0 : (await computeChargedTotal({ data: parsed.data, userId: req.user.id })).total

    // ── 1. Lê configurações do gateway ─────────────────
    const cfg     = await getPaymentSettings()
    const gateway = cfg.payment_gateway || 'manual'
    console.log('[intent] gateway=%s env=%s', gateway, cfg.payment_gateway_env)

    let booking, bookingCode, groupBookings = null

    if (isGroup) {
      // ── Carrinho universal: paga TODAS as reservas do grupo de uma vez ──
      const { data: all } = await supabase
        .from('bookings')
        .select('*')
        .eq('order_group_id', order_group_id)
        .eq('user_id', req.user.id)
      if (!all || all.length === 0) {
        return res.status(404).json({ error: 'Grupo não encontrado nesta conta.' })
      }
      // Só cobra as reservas aguardando pagamento; ignora canceladas/pagas.
      const payable = all.filter((b) => b.status_commercial === 'awaiting_payment')
      if (payable.length === 0) {
        return res.status(409).json({
          error: 'Nenhuma reserva do grupo está pronta para pagamento. Aguarde o aceite dos operadores.',
        })
      }
      // Motor de pernas ligado: cada reserva precisa ter TODAS as pernas (não
      // canceladas) aceitas antes de entrar no pagamento do grupo.
      if (await isBookingLegsEngineEnabled()) {
        for (const b of payable) {
          const { data: legs } = await supabase
            .from('booking_legs').select('status_leg').eq('booking_id', b.id)
          if (legs && legs.length > 0) {
            const relevant = legs.filter((l) => l.status_leg !== 'cancelled')
            const allAccepted = relevant.length > 0 && relevant.every((l) => l.status_leg === 'accepted')
            if (!allAccepted) {
              return res.status(409).json({
                error: `A reserva ${b.booking_code} ainda tem veículo(s) aguardando aceite. Aguarde o combo fechar ou pague por reserva.`,
              })
            }
          }
        }
      }
      groupBookings = payable
      chargedTotal  = payable.reduce((s, b) => s + Number(b.total_amount || 0), 0)
      booking       = payable[0]            // âncora (payments.booking_id é NOT NULL)
      bookingCode   = booking.booking_code
    } else if (existing_booking_id) {
      // ── Reutiliza reserva existente ────────────────────
      const { data: existing } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', existing_booking_id)
        .eq('user_id', req.user.id)
        .maybeSingle()

      // Mensagens específicas: ajudam a entender o que está acontecendo.
      if (!existing) {
        return res.status(404).json({
          error: 'Reserva não encontrada nesta conta. Entre com a mesma conta que fez a reserva.',
        })
      }
      if (existing.status_commercial !== 'awaiting_payment') {
        const s = existing.status_commercial
        const msg =
          s === 'awaiting_acceptance' ? 'Esta reserva ainda não foi aceita por um operador. Aguarde o aceite para pagar.' :
          s === 'paid'                ? 'Esta reserva já foi paga.' :
          s === 'cancelled'           ? 'Esta reserva foi cancelada.' :
                                        `Esta reserva não está aguardando pagamento (status: ${s}).`
        return res.status(409).json({ error: msg })
      }

      booking     = existing
      bookingCode = existing.booking_code
      // Pagamento de reserva já solicitada/aceita: o valor cobrado é o do banco.
      chargedTotal = Number(existing.total_amount)

      // ── Motor de pernas (Onda A) — pay-after-all na API ─────────────────
      // A trava do banco (enforce_pay_after_all_legs) já bloqueia isso a
      // nível de UPDATE de bookings; aqui é só a mensagem amigável ANTES de
      // gerar cobrança no gateway (evita criar PIX/cartão que nunca vai poder
      // confirmar a reserva).
      if (await isBookingLegsEngineEnabled()) {
        const { data: legs, error: legsErr } = await supabase
          .from('booking_legs')
          .select('status_leg')
          .eq('booking_id', booking.id)
        if (!legsErr && legs && legs.length > 0) {
          const relevant = legs.filter((l) => l.status_leg !== 'cancelled')
          const allAccepted = relevant.length > 0 && relevant.every((l) => l.status_leg === 'accepted')
          if (!allAccepted) {
            return res.status(409).json({
              error: 'Ainda há perna(s) deste pedido aguardando aceite de operador. Aguarde o combo fechar ou pague só o que já foi aceito (checkout parcial).',
            })
          }
        }
      }
    } else {
      // ── 2. Gera código da reserva ──────────────────────
      bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`

      // ── 3. Cria a reserva ──────────────────────────────
      const { data: newBooking, error: bErr } = await supabase
        .from('bookings')
        .insert({
          booking_code:        bookingCode,
          user_id:             req.user.id,
          region_id:           region_id || null,
          service_type,
          service_id,
          booking_mode:        booking_mode || 'private',
          service_date:        service_date_iso,
          service_time:        service_time || null,
          people_count:        Number(people_count) || 1,
          origin_text:         origin_text || null,
          destination_text:    destination_text || null,
          total_amount:        chargedTotal,
          status_commercial:   'awaiting_payment',
          status_operational:  'new',
          payment_status:      'pending',
        })
        .select()
        .single()

      if (bErr) throw bErr
      booking = newBooking

      // ── 4. Insere veículos da reserva ──────────────────
      if (vehicles.length > 0) {
        await insertBookingVehicles(booking.id, vehicles)
      }
    }

    // ── 5. Processa pagamento conforme gateway ─────────
    let gatewayTransactionId = null
    let expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    let pixCode   = null
    let qrBase64  = null

    // Campos extras preenchidos apenas em pagamentos com cartão
    let cardResult         = null // resultado completo de createCardPayment
    let cardPaymentStatus  = null // status final a reportar na response
    let cardStatusDetail   = null
    let cardInstallments   = Number(installments) || 1
    let cardInstFeeAmount  = null
    let cardLastFour       = null
    let cardBrand          = null
    let cardHolderName     = null
    let cardGatewayFeePct  = null
    // Fora do bloco de propósito: o `split` é calculado lá dentro, mas a linha
    // de `payments` é montada aqui fora — e é nela que o split precisa ficar
    // registrado, senão o repasse manual paga de novo o que o gateway pagou.
    let splitAplicado      = null

    if (gateway === 'test') {
      const { createPaymentIntent: testIntent } = await import('../payments/test.js')
      const d = await testIntent({ amount: chargedTotal, description: service_name || `Reserva ${bookingCode}` })
      gatewayTransactionId = d.transaction_id
      expiresAt            = d.expires_at
      pixCode              = d.pix_code
      qrBase64             = d.qr_base64
    } else if (gateway === 'mercado_pago') {
      const isCard = ['credit_card', 'debit_card'].includes(payment_method)

      // Split automático: se o operador atribuído está conectado ao Mercado
      // Pago, o pagamento cai NA conta dela e a comissão da plataforma vira
      // application_fee. Sem conexão → cai na conta da plataforma (sem split).
      // Motor de pernas (Onda A) ligado: quando o pedido tem 2+ operadores
      // com pernas aceitas, monta split nativo N-recebedores; com 1 (ou sem
      // pernas), cai no MESMO caminho de sempre (mode:'single').
      const split = isGroup
        ? await getSplitContextForGroup(groupBookings, chargedTotal, cfg)
        : (await isBookingLegsEngineEnabled())
          ? await getSplitContextForBooking(booking, chargedTotal, cfg)
          : await getSplitContext(booking, chargedTotal, cfg)
      // `mode:'multi'` é o split de N recebedores (motor de pernas), que tem
      // repasse próprio — aqui só interessa o de operador único.
      if (split?.operatorId && split.mode !== 'multi') splitAplicado = split

      // Opção 2: pagamento único de GRUPO só para recebedor único (1 coop) ou
      // sem split. Grupo multi-operador fica bloqueado até validar o split
      // nativo do MP — o cliente paga por reserva nesse caso.
      if (isGroup && split?.mode === 'multi') {
        return res.status(422).json({
          error: 'Este grupo tem operadores diferentes entre as reservas. O pagamento único multi-operador ainda não é suportado — pague cada reserva separadamente.',
        })
      }

      if (isCard) {
        // Split multi-recebedor (N operadores) via cartão ainda não
        // implementado nesta Onda — o mecanismo de `disbursements` do MP foi
        // validado aqui só para PIX. Bloqueia com mensagem clara em vez de
        // cobrar sem conseguir repassar corretamente. Ver Riscos/Objeções.
        if (split?.mode === 'multi') {
          return res.status(422).json({
            error: 'Este pedido tem operadores diferentes por perna. Pagamento com cartão para pedidos multi-operador ainda não é suportado — pague via PIX.',
          })
        }

        // ── Cartão: sem fallback fake — erro propaga ──────
        const { createCardPayment, mapRejectionKey } = await import('../services/mercadoPago.js')
        const userInfo = await supabase.from('users').select('email').eq('id', req.user.id).single()

        cardResult = await createCardPayment({
          amount:          chargedTotal,
          description:     service_name || `Reserva ${bookingCode}`,
          installments:    cardInstallments,
          paymentMethodId: payment_method_id,
          cardToken:       card_token,
          issuerId:        issuer_id,
          payerEmail:      userInfo.data?.email,
          payerDoc:        payer_doc ? String(payer_doc).replace(/\D/g, '') : undefined,
          externalRef:     booking.id,
          sellerAccessToken: split?.sellerAccessToken,
          applicationFee:    split?.applicationFee,
        })

        gatewayTransactionId = cardResult.mp_id
        cardPaymentStatus    = cardResult.status
        cardStatusDetail     = cardResult.status_detail
        cardInstallments     = cardResult.installments || cardInstallments
        cardInstFeeAmount    = cardResult.installment_fee_amount
        cardLastFour         = cardResult.card_last_four
        cardBrand            = cardResult.card_brand
        cardHolderName       = cardResult.card_holder_name

        // Taxa real por método: cartão à vista 4.98%, débito 1.50%
        if (payment_method === 'debit_card') {
          cardGatewayFeePct = 0.0150
        } else {
          cardGatewayFeePct = 0.0498
        }
      } else {
        // ── PIX ───────────────────────────────────────────
        const { createPixPayment, createPixPaymentSplit, buildDisbursements } = await import('../services/mercadoPago.js')
        const userInfo = await supabase.from('users').select('full_name, email').eq('id', req.user.id).single()
        let pixData
        try {
          if (split?.mode === 'multi') {
            // Split nativo N-recebedores: 1 pagamento com `disbursements` — um
            // por operador com perna aceita. Ver Riscos/Objeções (a validar
            // em staging com app marketplace com Split habilitado).
            pixData = await createPixPaymentSplit({
              amount:       chargedTotal,
              description:  service_name || `Reserva ${bookingCode}`,
              payerEmail:   userInfo.data?.email,
              payerName:    userInfo.data?.full_name,
              externalRef:  booking.id,
              disbursements: buildDisbursements(split.recipients),
            })
          } else {
            pixData = await createPixPayment({
              amount:      chargedTotal,
              description: service_name || `Reserva ${bookingCode}`,
              payerEmail:  userInfo.data?.email,
              payerName:   userInfo.data?.full_name,
              // IMPORTANTE: para PIX não envie payerDoc/entityType/entity_type.
              // O erro do Brick "entityType only receives individual or association"
              // costuma aparecer quando o front/backend manda CPF/CNPJ/fisica/juridica
              // como entityType. PIX funciona só com email/nome do pagador.
              externalRef: booking.id,
              sellerAccessToken: split?.sellerAccessToken,
              applicationFee:    split?.applicationFee,
            })
          }
        } catch (mpErr) {
          console.error('[intent] PIX falhou:', mpErr.message)
          return res.status(422).json({
            error: `Não foi possível gerar o PIX: ${mpErr.message}. Confirme que o PIX está ativado na conta do Mercado Pago que vai receber.`,
          })
        }
        console.log('[intent] PIX: status=%s detail=%s exp=%s split=%s qr=%s',
          pixData.status, pixData.status_detail, pixData.expires_at, !!split, !!pixData.qr_base64)

        if (pixData.status === 'pending' && (pixData.pix_code || pixData.qr_base64)) {
          gatewayTransactionId = pixData.mp_id
          expiresAt            = pixData.expires_at || expiresAt
          pixCode              = pixData.pix_code
          qrBase64             = pixData.qr_base64
        } else {
          // PIX recusado ou sem QR → mostra o MOTIVO real do Mercado Pago.
          return res.status(422).json({
            error: `Não foi possível gerar o PIX (status: ${pixData.status}${pixData.status_detail ? ` · ${pixData.status_detail}` : ''}). Confirme que o PIX está ativado na conta do Mercado Pago que vai receber.`,
          })
        }
      }
    }
    // asaas / pagarme: adapters a implementar quando credentials disponíveis

    // Gateway efetivo: se o MP (ou outro) não devolveu transação, o pagamento
    // é apresentado como manual — então grava 'manual' para o botão de
    // simulação/confirmação funcionar coerentemente.
    const effectiveGateway = gatewayTransactionId ? gateway : 'manual'

    // ── 6. Registra pagamento ──────────────────────────
    // Status inicial difere: PIX/manual ficam 'pending'; cartão já tem status
    // definitivo (approved/rejected/in_process) neste mesmo request.
    const isCard = ['credit_card', 'debit_card'].includes(payment_method)
    let initialPaymentStatus = 'pending'
    if (isCard && cardPaymentStatus) {
      if (cardPaymentStatus === 'approved')   initialPaymentStatus = 'approved'
      else if (cardPaymentStatus === 'rejected') initialPaymentStatus = 'failed'
      else                                       initialPaymentStatus = cardPaymentStatus // in_process / pending
    }

    const paymentInsertRow = {
      booking_id:             booking.id,          // âncora do grupo (NOT NULL)
      ...(isGroup ? { order_group_id } : {}),
      gateway_name:           effectiveGateway,
      gateway_transaction_id: gatewayTransactionId,
      payment_method,
      payment_type:           'full',
      amount_gross:           chargedTotal,
      gateway_fee_amount:     isCard ? Math.round(chargedTotal * (cardGatewayFeePct || 0.035) * 100) / 100 : 0,
      currency:               'BRL',
      status:                 initialPaymentStatus,
      expires_at:             expiresAt,
      // raw response para cartão (inclui dados completos do MP)
      ...(isCard && cardResult ? { raw_response_json: cardResult.raw } : {}),
      // colunas de cartão (nullable em PIX/manual)
      ...(isCard ? {
        installments:           cardInstallments,
        installment_fee_amount: cardInstFeeAmount,
        card_last_four:         cardLastFour,
        card_brand:             cardBrand,
        card_holder_name:       cardHolderName,
        gateway_fee_pct:        cardGatewayFeePct,
      } : {}),
      // Houve split? Registrar é o que impede `gerarRepasses` de lançar a
      // comissão de novo — o gateway já depositou a parte do operador nesta
      // cobrança, e o repasse manual seria pagamento em dobro (migration 087).
      ...(splitAplicado ? {
        split_operator_id:     splitAplicado.operatorId,
        split_application_fee: splitAplicado.applicationFee,
      } : {}),
    }

    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .insert(paymentInsertRow)
      .select()
      .single()

    if (pErr) throw pErr

    // ── Pós-inserção: ação imediata para cartão ────────
    if (isCard && cardPaymentStatus === 'approved') {
      // approved: dispara onPaymentApproved dentro do mesmo request
      await onPaymentApproved(payment)
    } else if (isCard && cardPaymentStatus === 'rejected') {
      // rejected: booking permanece awaiting_payment (não altera status_commercial)
      // O status 'failed' já foi gravado em payments acima
    }
    // in_process / pending: polling existente cuida via GET /:id/status

    const manual    = gateway === 'manual' || !gatewayTransactionId
    const test_mode = gateway === 'test'

    // ── Resposta final ─────────────────────────────────
    // Cartão rejected → HTTP 200 com status: 'rejected' (nunca 402)
    if (isCard && cardPaymentStatus === 'rejected') {
      const { mapRejectionKey } = await import('../services/mercadoPago.js')
      return res.json({
        booking_id:   booking.id,
        booking_code: bookingCode,
        payment_id:   payment.id,
        amount:       chargedTotal,
        status:       'rejected',
        error_code:   cardStatusDetail,
        message_key:  mapRejectionKey(cardStatusDetail),
      })
    }

    res.json({
      booking_id:   booking.id,
      booking_code: bookingCode,
      order_group_id: isGroup ? order_group_id : null,
      group_count:  isGroup ? groupBookings.length : null,
      payment_id:   payment.id,
      amount:       chargedTotal,
      expires_at:   payment.expires_at,
      status:       isCard ? (cardPaymentStatus || 'pending') : 'pending',
      // gateway-generated PIX (null when manual or card)
      pix_code:     pixCode,
      qr_base64:    qrBase64,
      test_mode,
      // campos extras de cartão (null em PIX/manual)
      installments:      isCard ? cardInstallments : null,
      card_last_four:    isCard ? cardLastFour : null,
      card_brand:        isCard ? cardBrand : null,
      // manual payment: show platform's PIX/bank info
      manual_mode:      manual,
      pix_key_type:     manual ? (cfg.payment_admin_pix_key_type || null) : null,
      pix_key:          manual ? (cfg.payment_admin_pix_key      || null) : null,
      bank_name:        manual ? (cfg.payment_admin_bank_name    || null) : null,
      bank_agency:      manual ? (cfg.payment_admin_bank_agency  || null) : null,
      bank_account:     manual ? (cfg.payment_admin_bank_account || null) : null,
      bank_account_type:manual ? (cfg.payment_admin_bank_account_type || null) : null,
    })
  } catch (err) { next(err) }
})

// ── POST /api/payments/request ─────────────────────────
// Cria a reserva SEM pagamento (fluxo solicitar → aceitar → pagar). A reserva
// nasce em 'awaiting_acceptance' e os operadores são notificadas para aceitar.
// O pagamento acontece depois, via POST /intent com existing_booking_id.
// ── POST /api/payments/validate-coupon ──────────────────
// Valida um cupom ANTES da solicitação, para o app mostrar o desconto na
// hora (Resumo e Carrinho). A aplicação autoritativa continua no servidor
// na criação da reserva — isto aqui é só feedback.
router.post('/validate-coupon', authenticate, async (req, res, next) => {
  try {
    const { coupon_code, service_type, region_id, subtotal } = req.body || {}
    if (!coupon_code || typeof coupon_code !== 'string') {
      return res.status(400).json({ error: 'Informe o código do cupom' })
    }
    const sub = Number(subtotal) || 0
    const { discount, couponId } = await applyCoupon(
      coupon_code.trim(), req.user.id, region_id || null, service_type || null, sub,
    )
    const { data: c } = await supabase
      .from('coupons')
      .select('code, title, discount_type, discount_value, applicable_service_type')
      .eq('id', couponId)
      .single()
    res.json({ valid: true, discount, coupon: c })
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.post('/request', authenticate, async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(nullToUndefined(req.body))
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' })
    }

    const {
      service_type, service_id, booking_mode,
      service_date_iso, service_time, people_count, region_id,
      vehicles = [], origin_text, destination_text, partner_slug,
    } = parsed.data

    // Antecedência mínima para transfers (rota definida) — mesma regra do
    // translado personalizado. Bloqueia agendamento "ao vivo"/imediato.
    if (service_type === 'transfer' && service_date_iso) {
      await validateTransferAdvance(service_date_iso, service_time || '00:00', { serviceId: service_id })
    }

    // R6: respeita o horário limite de solicitação do serviço.
    const cutoffErr = await checkBookingCutoff({ service_type, service_id, service_date_iso })
    if (cutoffErr) return res.status(400).json({ error: cutoffErr })
    const windowErr = await checkServiceWindow({ service_type, service_id, service_time })
    if (windowErr) return res.status(400).json({ error: windowErr })

    // Link direto de operador: resolve o slug no SERVIDOR. Reserva nasce
    // atribuída (operator_id) e pronta para pagar — mesmo estado que o aceite
    // produz (awaiting_payment + assigned). Slug inválido/inativo → fluxo normal.
    const { resolvePartner } = await import('./partner.js')
    const partner = partner_slug ? await resolvePartner(partner_slug) : null

    // Afiliado: resolve o código no servidor; autoindicação é ignorada em
    // silêncio (o cliente comprando por si não gera comissão pra si mesmo).
    const { resolveAffiliate } = await import('./affiliate.js')
    const aff = parsed.data.affiliate_code ? await resolveAffiliate(parsed.data.affiliate_code) : null
    const affiliateId = aff && aff.id !== req.user.id ? aff.id : null

    const { total: chargedTotal, couponId, discountAmount, subtotal, seasonAdditional } =
      await computeChargedTotal({ data: parsed.data, userId: req.user.id })

    const bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`
    const baseBooking = {
      booking_code:       bookingCode,
      user_id:            req.user.id,
      region_id:          region_id || null,
      service_type,
      service_id,
      booking_mode:       booking_mode || 'private',
      service_date:       service_date_iso,
      service_time:       service_time || null,
      people_count:       Number(people_count) || 1,
      origin_text:        origin_text || null,
      destination_text:   destination_text || null,
      subtotal_amount:          subtotal,
      season_additional_amount: seasonAdditional,
      total_amount:       chargedTotal,
      ...(couponId ? { coupon_id: couponId, discount_amount: discountAmount } : {}),
      ...(affiliateId ? { affiliate_id: affiliateId, source_channel: 'affiliate_link' } : {}),
      ...(partner ? {
        operator_id:        partner.id,
        status_commercial:  'awaiting_payment',
        status_operational: 'assigned',
      } : {
        status_commercial:  'awaiting_acceptance',
        status_operational: 'new',
      }),
      payment_status:     'pending',
    }
    // 24h para algum operador aceitar; depois passa só pro admin. Se a
    // migration 037 ainda não rodou (coluna ausente = 42703), reusa o insert
    // sem o campo pra não bloquear novas solicitações.
    let { data: booking, error: bErr } = await supabase
      .from('bookings')
      .insert({
        ...baseBooking,
        acceptance_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()
    if (bErr?.code === '42703') {
      console.warn('[payments/request] coluna acceptance_expires_at ausente — rodar migration 037.')
      const retry = await supabase.from('bookings').insert(baseBooking).select().single()
      booking = retry.data; bErr = retry.error
    }
    if (bErr) throw bErr

    if (vehicles.length > 0) {
      await insertBookingVehicles(booking.id, vehicles)
    }

    // Registra o uso do cupom (limites total/por usuário contam sobre isto)
    if (couponId) {
      await supabase.from('coupon_redemptions').insert({
        coupon_id:               couponId,
        user_id:                 req.user.id,
        booking_id:              booking.id,
        discount_applied_amount: discountAmount,
      })
    }

    const isTransfer = service_type === 'transfer'
    const rota = [origin_text, destination_text].filter(Boolean).join(' → ')

    if (partner) {
      // Venda direta: só o operador dona do link é avisada — nada de fila.
      notifyUser({
        userId:      partner.id,
        bookingId:   booking.id,
        templateKey: 'new_booking',
        title:       'Venda direta pelo seu link 🎉',
        body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(booking.service_date)} (${bookingCode}). O cliente já pode pagar.`,
      })
    } else {
      // Notifica os operadores da nova solicitação (ANTES do pagamento) —
      // elas aceitam e só então o cliente paga.
      notifyOperatorsNewBooking(supabase, booking).catch((err) =>
        console.error('[whatsapp] notificação de operadores falhou:', err.message))
      notifyOperatorsAndAdmin({
        bookingId:   booking.id,
        fleetBookingId: booking.id,
        templateKey: 'new_booking',
        title:       'Nova solicitação disponível',
        body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(booking.service_date)}. Abra para aceitar.`,
      })
    }

    res.json({
      booking_id:        booking.id,
      booking_code:      bookingCode,
      amount:            chargedTotal,
      status_commercial: booking.status_commercial,
      partner_name:      partner?.full_name || null,
    })
  } catch (err) { next(err) }
})

// ── POST /api/payments/cart-request ────────────────────
// Carrinho universal (N reservas, 1 pagamento). Cria TODAS as reservas do
// carrinho de uma vez, compartilhando o mesmo `order_group_id`. Valida cada
// item ANTES de inserir qualquer um — se um falhar, nada é criado (evita grupo
// meia-boca). O pagamento único do grupo vem depois (fase B).
router.post('/cart-request', authenticate, async (req, res, next) => {
  try {
    const body = req.body && Array.isArray(req.body.items)
      ? { ...nullToUndefined(req.body), items: req.body.items.map(nullToUndefined) }
      : req.body
    const parsed = cartRequestSchema.safeParse(body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' })
    }
    const { items, partner_slug, affiliate_code } = parsed.data

    // Link direto de operador: o grupo INTEIRO nasce atribuído e pronto
    // para pagar (sem fila, sem aceite) — mesmo estado do combo aceito.
    const { resolvePartner } = await import('./partner.js')
    const partner = partner_slug ? await resolvePartner(partner_slug) : null

    // Afiliado: o grupo inteiro leva a indicação (anti-autoindicação).
    const { resolveAffiliate } = await import('./affiliate.js')
    const aff = affiliate_code ? await resolveAffiliate(affiliate_code) : null
    const affiliateId = aff && aff.id !== req.user.id ? aff.id : null

    // Cupom de valor FIXO desconta uma vez só (no 1º item elegível) — o
    // percentual vale para todos os itens elegíveis. Detecta o tipo antes.
    const cartCouponCode = items.find((it) => it.coupon_code)?.coupon_code || null
    let couponIsFixed = false
    if (cartCouponCode) {
      const { data: cRow } = await supabase
        .from('coupons').select('discount_type').ilike('code', cartCouponCode).maybeSingle()
      couponIsFixed = cRow?.discount_type && cRow.discount_type !== 'percentage'
    }

    // 1) Valida TODOS os itens (antecedência, cutoff, total autoritativo) antes
    //    de criar qualquer reserva. Falha → índice + motivo, nada é inserido.
    const prepared = []
    let couponApplied = false
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      try {
        if (it.service_type === 'transfer' && it.service_date_iso) {
          await validateTransferAdvance(it.service_date_iso, it.service_time || '00:00', { serviceId: it.service_id })
        }
        const cutoffErr = await checkBookingCutoff({
          service_type: it.service_type, service_id: it.service_id, service_date_iso: it.service_date_iso,
        })
        if (cutoffErr) throw { status: 400, message: cutoffErr }
        const windowErr = await checkServiceWindow({
          service_type: it.service_type, service_id: it.service_id, service_time: it.service_time,
        })
        if (windowErr) throw { status: 400, message: windowErr }
        const itemData = (couponIsFixed && couponApplied) ? { ...it, coupon_code: undefined } : it
        const { total: chargedTotal, couponId, discountAmount, subtotal, seasonAdditional } =
          await computeChargedTotal({ data: itemData, userId: req.user.id })
        if (couponId) couponApplied = true
        prepared.push({ it, chargedTotal, couponId, discountAmount, subtotal, seasonAdditional })
      } catch (err) {
        return res.status(err?.status || 400).json({
          error: err?.message || 'Item inválido no carrinho', item_index: i, service_id: it.service_id,
        })
      }
    }

    // 2) Cria as N reservas com um order_group_id compartilhado (insert em lote
    //    = atômico). booking_code único por item.
    const orderGroupId = crypto.randomUUID()
    const now = Date.now()
    const acceptanceExpiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString()
    const rows = prepared.map(({ it, chargedTotal, couponId, discountAmount, subtotal, seasonAdditional }, i) => ({
      booking_code:       `GJ${(now + i).toString(36).toUpperCase().slice(-6)}`,
      user_id:            req.user.id,
      order_group_id:     orderGroupId,
      region_id:          it.region_id || null,
      service_type:       it.service_type,
      service_id:         it.service_id,
      booking_mode:       it.booking_mode || 'private',
      service_date:       it.service_date_iso,
      service_time:       it.service_time || null,
      people_count:       Number(it.people_count) || 1,
      origin_text:        it.origin_text || null,
      destination_text:   it.destination_text || null,
      subtotal_amount:          subtotal,
      season_additional_amount: seasonAdditional,
      total_amount:       chargedTotal,
      ...(couponId ? { coupon_id: couponId, discount_amount: discountAmount } : {}),
      ...(affiliateId ? { affiliate_id: affiliateId, source_channel: 'affiliate_link' } : {}),
      ...(partner ? {
        operator_id:        partner.id,
        status_commercial:  'awaiting_payment',
        status_operational: 'assigned',
      } : {
        status_commercial:  'awaiting_acceptance',
        status_operational: 'new',
      }),
      payment_status:     'pending',
    }))
    // Casa cada linha ao item de origem por booking_code (a ordem do RETURNING
    // não é garantida pelo SQL — não confiar no índice do array).
    const bySrc     = new Map(rows.map((r, i) => [r.booking_code, prepared[i].it]))
    const prepByCode = new Map(rows.map((r, i) => [r.booking_code, prepared[i]]))

    let { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .insert(rows.map((r) => ({ ...r, acceptance_expires_at: acceptanceExpiresAt })))
      .select()
    if (bErr?.code === '42703') {
      // Coluna nova ausente. Tenta sem acceptance_expires_at (037); se ainda
      // faltar, sem order_group_id (050) — degrada para reservas avulsas.
      const retry1 = await supabase.from('bookings').insert(rows).select()
      bookings = retry1.data; bErr = retry1.error
      if (bErr?.code === '42703') {
        console.warn('[cart-request] coluna order_group_id ausente — rodar migration 050.')
        const noGroup = rows.map(({ order_group_id, ...r }) => r)
        const retry2 = await supabase.from('bookings').insert(noGroup).select()
        bookings = retry2.data; bErr = retry2.error
      }
    }
    if (bErr) throw bErr

    // 3) Veículos + notificações por reserva (best-effort; não bloqueiam a
    //    resposta nem derrubam o grupo já criado).
    for (const b of bookings) {
      const src = bySrc.get(b.booking_code)
      const vehicles = src?.vehicles || []
      if (vehicles.length > 0) {
        await insertBookingVehicles(b.id, vehicles).catch((err) =>
          console.error('[cart-request] veículos falharam:', err.message))
      }
      // Registra o uso do cupom desta reserva (limites contam sobre isto)
      const prep = prepByCode.get(b.booking_code)
      if (prep?.couponId) {
        await supabase.from('coupon_redemptions').insert({
          coupon_id:               prep.couponId,
          user_id:                 req.user.id,
          booking_id:              b.id,
          discount_applied_amount: prep.discountAmount,
        }).then(({ error }) => {
          if (error) console.error('[cart-request] redemption falhou:', error.message)
        })
      }
      if (partner) continue // venda direta: sem fila; um aviso único abaixo
      notifyOperatorsNewBooking(supabase, b).catch((err) =>
        console.error('[whatsapp] notificação de operadores falhou:', err.message))
      const isTransfer = b.service_type === 'transfer'
      const rota = [b.origin_text, b.destination_text].filter(Boolean).join(' → ')
      notifyOperatorsAndAdmin({
        bookingId:   b.id,
        fleetBookingId: b.id,
        templateKey: 'new_booking',
        title:       'Nova solicitação disponível',
        body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(b.service_date)}. Abra para aceitar.`,
      })
    }

    if (partner) {
      notifyUser({
        userId:      partner.id,
        bookingId:   bookings[0]?.id,
        templateKey: 'new_booking',
        title:       'Venda direta pelo seu link 🎉',
        body:        `Pedido com ${bookings.length} serviço(s) pelo seu link. O cliente já pode pagar tudo junto.`,
      })
    }

    res.json({
      order_group_id: orderGroupId,
      partner_name:   partner?.full_name || null,
      bookings: bookings.map((b) => ({
        booking_id: b.id, booking_code: b.booking_code,
        service_id: b.service_id, amount: b.total_amount,
        status_commercial: b.status_commercial,
      })),
    })
  } catch (err) { next(err) }
})

// ── POST /api/bookings/:id/checkout-accepted ───────────
// Motor de pernas (Etapa 2, Onda A) — checkout parcial (R3): cancela
// ATOMICAMENTE as pernas ainda `awaiting_acceptance` e deixa o pedido pronto
// para pagar só o que já foi aceito. Nunca há reembolso — só se cobra o que
// já está aceito (o total é recalculado para a soma das pernas aceitas).
router.post('/booking/:id/checkout-accepted', authenticate, async (req, res, next) => {
  try {
    if (!(await isBookingLegsEngineEnabled())) {
      return res.status(404).json({ error: 'Motor de pernas não habilitado' })
    }

    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, user_id, booking_code, status_commercial, payment_deadline_at')
      .eq('id', req.params.id)
      .maybeSingle()
    if (bErr) throw bErr
    if (!booking) return res.status(404).json({ error: 'Reserva não encontrada' })
    // Prazo de pagamento vencido → a reserva será cancelada pela varredura;
    // recusa o checkout com mensagem clara em vez de deixar pagar fora do prazo.
    if (booking.payment_deadline_at && new Date(booking.payment_deadline_at) < new Date()) {
      await sweepExpiredLegBookings().catch(() => {})
      return res.status(409).json({ error: 'Prazo de pagamento expirado — o veículo ficou indisponível. Faça uma nova solicitação.' })
    }
    // Checkout é ação do CLIENTE (R3): só o turista dono do pedido ou um admin.
    // Bloqueia operadores/coop e turistas de pedidos alheios — senão qualquer
    // operador poderia cancelar as pernas pendentes e reescrever o total de
    // uma reserva que não é dele.
    const isOwnerTourist = req.user.user_type === 'tourist' && booking.user_id === req.user.id
    const isAdmin        = req.user.user_type === 'admin'
    if (!isOwnerTourist && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão' })
    }
    if (!['awaiting_acceptance', 'awaiting_payment'].includes(booking.status_commercial)) {
      return res.status(409).json({ error: `Reserva não está aguardando aceite/pagamento (status: ${booking.status_commercial})` })
    }

    // Cancelamento atômico: só afeta pernas AINDA pendentes no momento exato
    // do UPDATE — uma coop que aceite no mesmo instante "vence" a corrida
    // porque a guarda WHERE status_leg='awaiting_acceptance' não vai mais
    // encontrar a linha dela (já virou 'accepted').
    const { data: cancelledLegs, error: cancelErr } = await supabase
      .from('booking_legs')
      .update({ status_leg: 'cancelled' })
      .eq('booking_id', booking.id)
      .eq('status_leg', 'awaiting_acceptance')
      .select('id, vehicle_name_snapshot, leg_price')
    if (cancelErr) throw cancelErr

    const { data: remainingLegs, error: legsErr } = await supabase
      .from('booking_legs')
      .select('id, status_leg, leg_price')
      .eq('booking_id', booking.id)
    if (legsErr) throw legsErr

    const accepted = (remainingLegs || []).filter((l) => l.status_leg === 'accepted')
    if (accepted.length === 0) {
      return res.status(400).json({ error: 'Nenhuma perna foi aceita ainda — não há o que pagar. Aguarde um operador aceitar.' })
    }

    const dynamicTotal = Math.round(accepted.reduce((s, l) => s + Number(l.leg_price), 0) * 100) / 100

    // Ajusta o total autoritativo do pedido para a soma do que sobrou aceito e
    // avança para awaiting_payment. A migration 043 corrigiu
    // booking_all_legs_accepted() para IGNORAR pernas canceladas, então o
    // trigger enforce_pay_after_all_legs não bloqueia mais o checkout parcial.
    // O try/catch abaixo permanece apenas como defesa (nunca devolver 500 cru).
    let advancedToPayment = booking.status_commercial === 'awaiting_payment'
    if (!advancedToPayment) {
      try {
        const { data: updRows, error: upErr } = await supabase
          .from('bookings')
          .update({ total_amount: dynamicTotal, status_commercial: 'awaiting_payment' })
          .eq('id', booking.id)
          .eq('status_commercial', 'awaiting_acceptance')
          .select('id')
        if (upErr) throw upErr
        advancedToPayment = (updRows?.length || 0) > 0
      } catch (err) {
        console.error('[checkout-accepted] avanço para awaiting_payment bloqueado (ver booking_all_legs_accepted) booking=%s err=%s',
          booking.id, err.message)
        // Ainda assim já cancelamos as pernas pendentes e recalculamos o total —
        // atualiza só o total_amount, sem trocar o status_commercial.
        await supabase.from('bookings').update({ total_amount: dynamicTotal }).eq('id', booking.id)
      }
    } else {
      // Já estava awaiting_payment (combo tinha fechado 100% antes deste
      // checkout parcial) — sincroniza o total defensivamente.
      await supabase.from('bookings').update({ total_amount: dynamicTotal }).eq('id', booking.id)
    }

    res.json({
      ok:                true,
      booking_id:        booking.id,
      booking_code:      booking.booking_code,
      cancelled_legs:    cancelledLegs || [],
      accepted_legs:     accepted.length,
      dynamic_total:     dynamicTotal,
      ready_to_pay:      advancedToPayment,
      ...(advancedToPayment ? {} : {
        warning: 'Pernas pendentes canceladas e total recalculado, mas o pedido não foi liberado para pagamento. Tente novamente; se persistir, acione o suporte.',
      }),
    })
  } catch (err) { next(err) }
})

// ── GET /api/payments/booking/:id/checkout-key ─────────
// Devolve a public_key do Mercado Pago do operador atribuído à reserva, para
// o checkout tokenizar o cartão NA conta dela (split). Sem operador conectado
// → null (o app usa a chave da plataforma, sem split).
router.get('/booking/:id/checkout-key', authenticate, async (req, res, next) => {
  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id, operator_id')
      .eq('id', req.params.id)
      .single()
    if (!booking) return res.status(404).json({ error: 'Reserva não encontrada' })
    if (req.user.user_type === 'tourist' && booking.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' })
    }
    let publicKey = null
    if (booking.operator_id) {
      const { data: op } = await supabase
        .from('users').select('mp_public_key').eq('id', booking.operator_id).single()
      publicKey = op?.mp_public_key || null
    }
    res.json({ public_key: publicKey, split: !!publicKey })
  } catch (err) { next(err) }
})

// ── GET /api/payments/:id/status ───────────────────────
// Polling: retorna status do pagamento
router.get('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status, booking_id, order_group_id, gateway_name, gateway_transaction_id, expires_at, amount_gross, gateway_fee_pct, gateway_fee_amount, bookings(booking_code, status_commercial, operator_id)')
      .eq('id', req.params.id)
      .single()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })

    // Gateway de teste: aprova na primeira consulta de status
    if (payment.status === 'pending' && payment.gateway_name === 'test') {
      await onPaymentApproved(payment)
      return res.json({ status: 'approved', booking_id: payment.booking_id, booking_code: payment.bookings?.booking_code })
    }

    // Verifica se expirou
    if (payment.status === 'pending' && payment.expires_at && new Date(payment.expires_at) < new Date()) {
      await supabase.from('payments').update({ status: 'expired' }).eq('id', payment.id)
      if (payment.order_group_id) {
        // Grupo: expira só as reservas ainda aguardando pagamento (não toca
        // canceladas/pagas). Evita grupo "meio-expirado".
        await supabase.from('bookings')
          .update({ status_commercial: 'expired', payment_status: 'expired' })
          .eq('order_group_id', payment.order_group_id)
          .eq('status_commercial', 'awaiting_payment')
      } else {
        await supabase.from('bookings').update({ status_commercial: 'expired', payment_status: 'expired' }).eq('id', payment.booking_id)
      }
      return res.json({ status: 'expired', booking_id: payment.booking_id })
    }

    // Se MP ativo e pendente, consulta gateway em tempo real
    if (payment.status === 'pending' && payment.gateway_name === 'mercado_pago' && payment.gateway_transaction_id && !payment.gateway_transaction_id.startsWith('TEST-')) {
      try {
        const { getMpPaymentStatus } = await import('../services/mercadoPago.js')
        // Pagamento com split vive na conta do operador → consulta com o token dela.
        const opMp = await getOperatorMp(payment.bookings?.operator_id)
        const mpStatus = await getMpPaymentStatus(payment.gateway_transaction_id, opMp?.token)
        if (mpStatus === 'approved') {
          await onPaymentApproved(payment)
          return res.json({ status: 'approved', booking_id: payment.booking_id, booking_code: payment.bookings?.booking_code })
        }
      } catch { /* ignora erros de rede no polling */ }
    }

    res.json({
      status:       payment.status,
      booking_id:   payment.booking_id,
      booking_code: payment.bookings?.booking_code,
    })
  } catch (err) { next(err) }
})

// ── Verificação de assinatura do Mercado Pago ─────────
// Header x-signature: "ts=...,v1=<hmac>". Manifest:
//   id:[data.id];request-id:[x-request-id];ts:[ts];
// Em desenvolvimento, aceita sem secret pra facilitar testes locais. Em
// produção, BLOQUEIA quando secret ausente — sem isso, qualquer um poderia
// mandar um POST /webhook forjado aprovando pagamentos.
async function verifyMpSignature(req, event) {
  // Duas fontes, e a ordem importa: a variável de ambiente do Render é a
  // canônica; o campo "Webhook Secret" do painel entra como reserva.
  //
  // Sem essa reserva havia uma armadilha cara: o admin TEM o campo, diz que
  // "as chaves são armazenadas no banco", e a API nunca lia esse valor —
  // preenchê-lo não fazia nada. Em produção, sem a env var, o webhook rejeita
  // TODOS os eventos: pagamento aprovado no Mercado Pago e reserva que não
  // confirma sozinha, em silêncio.
  let secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) {
    try {
      const cfg = await getPaymentSettings()
      secret = cfg?.payment_gateway_webhook_secret || null
      if (secret) console.warn('[webhook] usando o secret do painel (MERCADO_PAGO_WEBHOOK_SECRET ausente)')
    } catch (e) {
      console.error('[webhook] falha ao ler o secret do painel:', e.message)
    }
  }
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[webhook] MERCADO_PAGO_WEBHOOK_SECRET ausente em produção — REJEITANDO evento')
      return false
    }
    console.warn('[webhook] MERCADO_PAGO_WEBHOOK_SECRET ausente — assinatura NÃO verificada (dev)')
    return true
  }
  const sig = req.headers['x-signature']
  if (!sig) { console.warn('[webhook] sem header x-signature'); return false }

  const parts = Object.fromEntries(
    sig.split(',').map((p) => p.trim().split('=').map((s) => s.trim()))
  )
  if (!parts.ts || !parts.v1) { console.warn('[webhook] x-signature malformado:', sig); return false }

  const requestId = req.headers['x-request-id'] || ''

  // O data.id usado no manifesto pode vir da query (?data.id=...) ou do corpo,
  // e o simulador às vezes difere do id do topo. Testa todos os candidatos.
  const candidates = [...new Set(
    [req.query['data.id'], event?.data?.id, event?.id]
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v).toLowerCase())
  )]

  for (const id of candidates) {
    const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))) return true
    } catch { /* tamanhos diferentes — tenta próximo candidato */ }
  }

  console.warn('[webhook] assinatura não confere — ts=%s req-id=%s candidatos=%j v1=%s',
    parts.ts, requestId, candidates, parts.v1)
  return false
}

// ── POST /api/payments/webhook ─────────────────────────
// Recebe eventos do Mercado Pago.
// O body chega como Buffer bruto (express.raw no index.js) para
// permitir a verificação de assinatura — parseia aqui.
router.post('/webhook', async (req, res, next) => {
  try {
    let event = req.body
    if (Buffer.isBuffer(event)) {
      try { event = JSON.parse(event.toString('utf8')) }
      catch { return res.status(400).json({ error: 'JSON inválido' }) }
    }

    const eventType = event.type || event.action || 'unknown'
    // MP manda data.id no body e também na query string da URL
    const gatewayId = (req.query['data.id'] || event.data?.id)?.toString()

    if (!(await verifyMpSignature(req, event))) {
      console.warn('[webhook] assinatura inválida — evento descartado')
      return res.status(401).json({ error: 'Assinatura inválida' })
    }

    // Busca o pagamento pelo gatewayId para associar o evento
    let paymentForEvent = null
    if (gatewayId) {
      const { data: p } = await supabase
        .from('payments')
        .select('*, bookings(*)')
        .eq('gateway_transaction_id', gatewayId)
        .single()
      paymentForEvent = p
    }

    // Registra evento bruto com payment_id para idempotência via UNIQUE constraint.
    // Esperamos UNIQUE violation (23505) em retentativas do MP — silencia só
    // esse caso. Qualquer outro erro de gravação é logado pra investigação.
    const evIns = await supabase.from('payment_events').insert({
      payment_id:         paymentForEvent?.id || null,
      event_name:         eventType,
      event_payload_json: event,
      processing_status:  'pending',
    })
    if (evIns.error && evIns.error.code !== '23505') {
      console.error('[webhook] falha ao gravar payment_events code=%s msg=%s',
        evIns.error.code, evIns.error.message)
    }

    if ((eventType === 'payment' || eventType === 'payment.updated') && paymentForEvent) {
      // ── O status vem do Mercado Pago, NÃO do corpo do evento ──────────────
      // A notificação do MP carrega apenas o id do recurso ({"data":{"id":...}}) —
      // não existe `data.status`. Ler o status do payload deixava `mpStatus`
      // indefinido e NENHUM pagamento era confirmado por webhook: só era
      // confirmado quem ficasse com a tela de "processando" aberta, porque lá o
      // app consulta /status de 4 em 4 segundos. Quem pagava o PIX no app do
      // banco e fechava o Turiva pagava e ficava sem reserva até expirar.
      // Só consulta o MP para cobrança que realmente vive lá. Pagamento de
      // teste (gateway 'test'/'manual', ou id "TEST-") não existe no MP: a
      // consulta falharia, cairia no 503 e o MP reenviaria o evento em laço.
      const noMercadoPago = paymentForEvent.gateway_name === 'mercado_pago'
        && paymentForEvent.gateway_transaction_id
        && !String(paymentForEvent.gateway_transaction_id).startsWith('TEST-')
      if (!noMercadoPago) {
        console.warn('[webhook] evento para pagamento fora do MP (gateway=%s) — ignorado',
          paymentForEvent.gateway_name)
        return res.status(200).json({ ok: true, ignorado: true })
      }

      let mpStatus = null
      try {
        const { getMpPaymentStatus } = await import('../services/mercadoPago.js')
        // Com split, o pagamento vive na conta do operador — consulta com o
        // token dela, como já faz o polling.
        const opMp = await getOperatorMp(paymentForEvent.bookings?.operator_id)
        mpStatus = await getMpPaymentStatus(paymentForEvent.gateway_transaction_id, opMp?.token)
      } catch (err) {
        console.error('[webhook] consulta ao MP falhou payment=%s: %s',
          paymentForEvent.id, err.message)
      }

      if (!mpStatus) {
        // Sem status confiável, não decide nada. Responder com erro faz o MP
        // reenviar o evento — melhor uma retentativa do que marcar a reserva
        // errada (paga sem dinheiro, ou falha sobre pagamento aprovado).
        console.warn('[webhook] status indeterminado payment=%s — pedindo retentativa', paymentForEvent.id)
        return res.status(503).json({ error: 'Status indeterminado, reenvie' })
      }

      if (mpStatus === 'approved' && paymentForEvent.status !== 'approved') {
        await onPaymentApproved(paymentForEvent)
      } else if (['rejected', 'cancelled'].includes(mpStatus)) {
        await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentForEvent.id)
        await supabase.from('bookings').update({ status_commercial: 'payment_failed', payment_status: 'failed' }).eq('id', paymentForEvent.booking_id)
      }
    }

    res.status(200).json({ ok: true })
  } catch (err) { next(err) }
})

// ── POST /api/payments/:id/simulate ───────────────────
// Confirma pagamento automaticamente (somente gateway manual/sem chave PIX)
router.post('/:id/simulate', authenticate, async (req, res, next) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings(user_id, booking_code, status_commercial)')
      .eq('id', req.params.id)
      .single()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })

    // Só funciona quando gateway é manual (sem integração real)
    if (payment.gateway_name !== 'manual') {
      return res.status(403).json({ error: 'Simulação disponível apenas no modo manual' })
    }

    // O pagamento deve pertencer ao usuário logado
    if (payment.bookings?.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    if (payment.status === 'approved') {
      return res.json({ ok: true, already: true })
    }

    await onPaymentApproved(payment)
    res.json({ ok: true, booking_code: payment.bookings?.booking_code })
  } catch (err) { next(err) }
})

// ── POST /api/payments/manual-confirm ─────────────────
// Admin confirma pagamento manualmente (dinheiro/transferência)
router.post('/manual-confirm', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'admin' && req.user.user_type !== 'operator') {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const { booking_id, notes } = req.body
    if (!booking_id) return res.status(400).json({ error: 'booking_id obrigatório' })

    // Busca ou cria registro de pagamento
    let { data: payment } = await supabase.from('payments').select('*').eq('booking_id', booking_id).single()

    if (!payment) {
      const { data: booking } = await supabase.from('bookings').select('total_amount').eq('id', booking_id).single()
      const { data: p } = await supabase.from('payments').insert({
        booking_id, gateway_name: 'manual', payment_method: 'cash',
        payment_type: 'full', amount_gross: booking?.total_amount || 0,
        gateway_fee_amount: 0, currency: 'BRL', status: 'pending',
      }).select().single()
      payment = p
    }

    await onPaymentApproved({ ...payment, bookings: null })
    if (notes) await supabase.from('bookings').update({ notes }).eq('id', booking_id)

    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Motor de pernas (Etapa 2, Onda A) — contabilidade por perna ─────────
// Registra 1 par de lançamentos (commission_platform/payout_operator) em
// financial_ledger + 1 linha em commissions POR PERNA aceita, cada uma com
// leg_id/operator_id (migration 042). Sem isso, /operator/financial não
// consegue separar receita entre operadores diferentes no mesmo pedido —
// risco já registrado no design (seção 10). NÃO mexe nos lançamentos de nível
// pedido (booking_gross/gateway_fee/booking_net, leg_id NULL).
async function recordLegAccounting(booking, payment) {
  if (!booking?.id) return
  if (!(await isBookingLegsEngineEnabled())) return

  const { data: legs, error } = await supabase
    .from('booking_legs')
    .select('id, operator_id, leg_price')
    .eq('booking_id', booking.id)
    .eq('status_leg', 'accepted')
  if (error) throw error
  if (!legs || legs.length === 0) return

  const cfg = await getPaymentSettings()
  const effectiveDate = new Date().toISOString().slice(0, 10)
  const ledgerRows = []
  const commissionRows = []

  for (const leg of legs) {
    if (!leg.operator_id) continue
    const opMp = await getOperatorMp(leg.operator_id)
    const pct = (opMp?.platformPct != null ? Number(opMp.platformPct) : Number(cfg?.payment_split_admin_pct)) || 0
    const commission = Math.round(Number(leg.leg_price) * (pct / 100) * 100) / 100
    const payout = Math.round((Number(leg.leg_price) - commission) * 100) / 100

    ledgerRows.push(
      { booking_id: booking.id, payment_id: payment.id, leg_id: leg.id, entry_type: 'commission_platform', description: `Comissão plataforma — perna ${leg.id} (${booking.booking_code})`, amount: commission, direction: 'outflow', financial_status: 'pending', effective_date: effectiveDate },
      { booking_id: booking.id, payment_id: payment.id, leg_id: leg.id, entry_type: 'payout_operator',     description: `Repasse operador — perna ${leg.id} (${booking.booking_code})`,  amount: payout,     direction: 'outflow', financial_status: 'pending', effective_date: effectiveDate },
    )
    commissionRows.push({
      booking_id:         booking.id,
      leg_id:             leg.id,
      operator_id:        leg.operator_id,
      commission_model:   'percentage',
      commission_percent: pct,
      commission_amount:  commission,
      platform_amount:    commission,
      operator_amount:    payout,
      payout_status:      'pending',
    })
  }

  // Upsert idempotente contra os índices únicos da migration 046: uma corrida
  // webhook+polling (ou um retry após falha parcial) NÃO duplica lançamentos.
  if (ledgerRows.length > 0) {
    const { error: lErr } = await supabase
      .from('financial_ledger')
      .upsert(ledgerRows, { onConflict: 'leg_id,entry_type', ignoreDuplicates: true })
    if (lErr) throw new Error(`ledger por perna: ${lErr.message}`)
  }
  if (commissionRows.length > 0) {
    const { error: cErr } = await supabase
      .from('commissions')
      .upsert(commissionRows, { onConflict: 'leg_id', ignoreDuplicates: true })
    if (cErr) throw new Error(`commissions por perna: ${cErr.message}`)
  }
}

// Comissão da plataforma + repasse ao operador NO NÍVEL DO PEDIDO — usado
// quando o motor de pernas está DESLIGADO (fluxo atual). Sem isso, o ledger
// nunca recebe commission_platform/payout_operator e o Dashboard do admin mostra
// "Comissão plataforma" e "Repasses" zerados. Retorna as linhas para entrarem no
// MESMO insert protegido por ledger_created (idempotente por pagamento). Vazio
// quando o motor de pernas está ligado (aí quem lança é recordLegAccounting, por
// perna, evitando contagem dobrada).
async function orderCommissionRows(booking, payment, effectiveDate, cfg) {
  if (!booking?.id) return []
  if (await isBookingLegsEngineEnabled()) return []
  const total = Number(booking.total_amount || 0)
  if (!(total > 0)) return []

  let pct = Number(cfg?.payment_split_admin_pct) || 0
  if (booking.operator_id) {
    const { data: op } = await supabase
      .from('users').select('platform_split_pct').eq('id', booking.operator_id).maybeSingle()
    if (op?.platform_split_pct != null) pct = Number(op.platform_split_pct)
  }
  const commission = Math.round(total * (pct / 100) * 100) / 100
  const payout     = Math.round((total - commission) * 100) / 100
  return [
    { booking_id: booking.id, payment_id: payment.id, entry_type: 'commission_platform', description: `Comissão plataforma — ${booking.booking_code}`, amount: commission, direction: 'outflow', financial_status: 'pending', effective_date: effectiveDate },
    { booking_id: booking.id, payment_id: payment.id, entry_type: 'payout_operator',     description: `Repasse operador — ${booking.booking_code}`,  amount: payout,     direction: 'outflow', financial_status: 'pending', effective_date: effectiveDate },
  ]
}

// ── Helpers ────────────────────────────────────────────
// Exportada para a conciliação (services/paymentReconcile.js) reaproveitar
// EXATAMENTE o mesmo caminho de aprovação do webhook e do polling — inclusive a
// reserva atômica do ledger. Duplicar essa lógica seria criar uma segunda
// verdade sobre quando uma reserva vira paga.
export async function onPaymentApproved(payment) {
  // Carrinho universal: pagamento de GRUPO segue por caminho próprio, que
  // aplica a aprovação a TODAS as reservas do grupo. O caminho de reserva
  // única abaixo permanece intacto.
  if (payment.order_group_id) return onGroupPaymentApproved(payment)

  await supabase.from('payments').update({ status: 'approved', paid_at: new Date().toISOString() }).eq('id', payment.id)

  // Carrega a reserva COMPLETA antes de atualizar (precisa saber se a
  // operador já aceitou).
  //
  // Antes isto era `payment.bookings || (busca)`, confiando no join de quem
  // chamou — e o polling de /status seleciona só três colunas da reserva
  // (booking_code, status_commercial, operator_id). Como um objeto parcial é
  // "verdadeiro" em JavaScript, a busca de reserva NUNCA acontecia e o resto da
  // função trabalhava sem `user_id`, `service_type`, `service_id` e as demais
  // que ela usa: orçamento de translado não virava "pago", a notificação ao
  // cliente ficava sem destinatário e a comissão do afiliado saía de uma
  // reserva pela metade. E o polling é justamente o caminho por onde as
  // aprovações passam hoje.
  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', payment.booking_id).maybeSingle()

  // Fluxo novo (solicitar→aceitar→pagar): o operador já está atribuída, então
  // a reserva permanece 'assigned' e segue direto para o atendimento. Fluxo
  // antigo (paga primeiro): vai para a fila de despacho para alguém aceitar.
  const bookingUpdate = { status_commercial: 'paid', payment_status: 'approved' }
  if (!booking?.operator_id) bookingUpdate.status_operational = 'awaiting_dispatch'
  await supabase.from('bookings').update(bookingUpdate).eq('id', payment.booking_id)

  // If this booking came from a custom transfer quote, mark the quote as paid.
  // Não use .catch() direto no builder do Supabase.
  if (booking?.service_type === 'transfer' && booking?.service_id) {
    try {
      await supabase.from('transfer_quotes')
        .update({ status: 'paid' })
        .eq('id', booking.service_id)
        .eq('status', 'accepted')
    } catch {
      // no-op if service_id is a route id (not a quote)
    }
  }

  // ── Lança no ledger UMA vez, com reserva atômica ──────────────────────────
  // Antes isto era ler `ledger_created` e depois inserir. Ler e escrever em duas
  // idas ao banco NÃO impede a corrida que o próprio comentário descrevia:
  // webhook e polling podiam ler `false` ao mesmo tempo, os dois inserirem e a
  // receita aparecer DOBRADA no financeiro. Era raro só porque o webhook nunca
  // aprovava nada (ele lia um status que o Mercado Pago não manda); com o
  // webhook consertado, a corrida passou a ser alcançável.
  //
  // Agora a marca é feita por UPDATE condicional: no Postgres, só uma das
  // chamadas concorrentes encontra `ledger_created = false` e leva a linha. Se
  // a inserção falhar depois, a marca é DEVOLVIDA — senão o pagamento ficaria
  // marcado como lançado sem nenhum lançamento existir.
  const { data: freshPayment } = await supabase
    .from('payments')
    .update({ ledger_created: true })
    .eq('id', payment.id)
    .eq('ledger_created', false)
    .select('ledger_created, amount_gross, gateway_fee_pct, gateway_fee_amount')
    .maybeSingle()

  if (freshPayment) {
    const amount     = freshPayment?.amount_gross ?? payment.amount_gross
    // Usa a taxa real registrada no payment; fallback 3.5% para linhas antigas sem gateway_fee_pct
    const feePct     = freshPayment?.gateway_fee_pct ?? 0.035
    const gatewayFee = freshPayment?.gateway_fee_amount > 0
      ? freshPayment.gateway_fee_amount
      : Math.round(amount * feePct * 100) / 100
    // Data efetiva do recebimento — o gráfico de faturamento agrupa por ela
    const effectiveDate = new Date().toISOString().slice(0, 10)
    const cfg = await getPaymentSettings()
    const commissionRows = await orderCommissionRows(booking, payment, effectiveDate, cfg)

    const { error: ledgerErr } = await supabase.from('financial_ledger').insert([
      { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${booking?.booking_code}`,  amount,                direction: 'inflow',  financial_status: 'pending', effective_date: effectiveDate },
      { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'gateway_fee',   description: `Taxa gateway — ${booking?.booking_code}`,    amount: gatewayFee,    direction: 'outflow', financial_status: 'pending', effective_date: effectiveDate },
      { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${booking?.booking_code}`, amount: amount - gatewayFee, direction: 'inflow',  financial_status: 'pending', effective_date: effectiveDate },
      ...commissionRows,
    ])

    if (ledgerErr) {
      // Devolve a marca: sem isso o pagamento ficaria "lançado" sem lançamento
      // nenhum, e a receita sumiria do financeiro para sempre.
      console.error('[ledger] falha ao lançar receita:', ledgerErr.message)
      await supabase.from('payments').update({ ledger_created: false }).eq('id', payment.id)
    }
  }

  // REPASSES a pagar (migration 080). Fica FORA do gate `ledger_created`: os
  // dois são idempotentes por conta própria, e o repasse precisa existir mesmo
  // que o razão já tivesse sido lançado numa tentativa anterior.
  // Best-effort — o cliente já pagou e a reserva tem de ser confirmada de
  // qualquer forma; o que se perde é a linha do repasse, que dá para lançar
  // depois pelo admin.
  try {
    const { gerarRepasses } = await import('../services/payouts.js')
    await gerarRepasses(booking, Number(payment.amount) || 0)
  } catch (e) {
    console.error('[payouts] não foi possível gerar os repasses:', e?.message)
  }

  // Contabilidade por perna (Etapa 2, Onda A) — só roda quando o motor está
  // ligado E o pedido tem pernas aceitas. Fora do gate ledger_created e
  // idempotente (upsert, migration 046): se falhar aqui, a próxima aprovação/
  // polling reprocessa sem duplicar. Best-effort: nunca derruba a aprovação.
  await recordLegAccounting(booking, payment).catch((err) =>
    console.error('[ledger] contabilidade por perna falhou booking=%s err=%s', payment.booking_id, err.message))

  // Comissão de afiliado — só quando a reserva foi INDICADA e está paga.
  // Idempotente (índice único booking+affiliate, migration 055); best-effort.
  await recordAffiliateCommission(booking).catch((err) =>
    console.error('[afiliado] comissão falhou booking=%s err=%s', payment.booking_id, err.message))

  // E-mail de confirmação — nunca pode quebrar o fluxo de pagamento
  sendConfirmationEmail(booking).catch((err) =>
    console.error('[email] confirmação de reserva falhou:', err.message))

  // Central no app: confirma para o turista e avisa quem precisa.
  if (booking) notifyBookingPaid(booking)
}

// Notificações de "pagamento confirmado" de UMA reserva (app + WhatsApp).
// Extraído para ser reusado pelo pagamento único de grupo (carrinho universal).
function notifyBookingPaid(booking) {
  if (!booking) return
  const isTransfer = booking.service_type === 'transfer'
  const tipo  = isTransfer ? 'translado' : 'passeio'
  const rota  = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')

  notifyUser({
    userId:      booking.user_id,
    bookingId:   booking.id,
    templateKey: 'payment_confirmed',
    title:       'Pagamento confirmado ✅',
    body:        booking.operator_id
      ? `Recebemos o pagamento do seu ${tipo} (${booking.booking_code}). O operador já vai cuidar de tudo! 🎉`
      : `Recebemos o pagamento do seu ${tipo} (${booking.booking_code}). Agora é só aguardar um operador aceitar.`,
  })

  // WhatsApp pro cliente: pagamento confirmado (segurança de que deu certo).
  notifyClientPaymentConfirmed(supabase, booking).catch((err) =>
    console.error('[whatsapp] aviso cliente pagamento falhou:', err.message))

  if (booking.operator_id) {
    // Fluxo novo: o operador que aceitou é avisada de que o pagamento entrou.
    notifyUser({
      userId:      booking.operator_id,
      bookingId:   booking.id,
      templateKey: 'payment_received',
      title:       'Pagamento recebido 💰',
      body:        `O cliente pagou o ${tipo} ${booking.booking_code}. Pode confirmar e seguir com o atendimento.`,
    })
    // WhatsApp pra coop: cliente pagou, hora de confirmar/despachar.
    notifyOperatorPaymentReceived(supabase, booking).catch((err) =>
      console.error('[whatsapp] aviso coop pagamento falhou:', err.message))
  } else {
    // Fluxo antigo: a reserva paga fica disponível para os operadores.
    notifyOperatorsNewBooking(supabase, booking).catch((err) =>
      console.error('[whatsapp] notificação de operadores falhou:', err.message))
    notifyOperatorsAndAdmin({
      bookingId:   booking.id,
      fleetBookingId: booking.id,
      templateKey: 'new_booking',
      title:       'Nova solicitação disponível',
      body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(booking.service_date)}. Abra para aceitar.`,
    })
  }
}

// Aprovação de pagamento de GRUPO (carrinho universal): aplica a aprovação a
// TODAS as reservas do grupo. Idempotente — webhook+polling/retry não duplicam
// status nem lançamentos. Espelha o caminho de reserva única, rateando a taxa
// de gateway por reserva pelo total de cada uma.
async function onGroupPaymentApproved(payment) {
  await supabase.from('payments')
    .update({ status: 'approved', paid_at: new Date().toISOString() })
    .eq('id', payment.id)

  const { data: bookings } = await supabase
    .from('bookings').select('*').eq('order_group_id', payment.order_group_id)
  // Só processa o que foi efetivamente cobrado: reservas que estavam prontas
  // para pagar (awaiting_payment) ou já pagas (idempotência do webhook+polling).
  // Itens ainda em aceite (awaiting_acceptance) NÃO entram — não foram cobrados,
  // então não podem virar 'paid' aqui.
  const list = (bookings || []).filter((b) => ['awaiting_payment', 'paid'].includes(b.status_commercial))
  if (list.length === 0) return

  // 1) Marca cada reserva do grupo como paga (idempotente).
  for (const b of list) {
    const upd = { status_commercial: 'paid', payment_status: 'approved' }
    if (!b.operator_id) upd.status_operational = 'awaiting_dispatch'
    await supabase.from('bookings').update(upd).eq('id', b.id)
    if (b.service_type === 'transfer' && b.service_id) {
      try {
        await supabase.from('transfer_quotes').update({ status: 'paid' })
          .eq('id', b.service_id).eq('status', 'accepted')
      } catch { /* service_id é rota, não cotação */ }
    }
  }

  // 2) Receita no ledger — uma vez por pagamento (gate ledger_created),
  //    rateando a taxa de gateway entre as reservas pelo total de cada uma.
  // Mesma reserva atômica do caminho de reserva única: UPDATE condicional em
  // vez de ler-depois-escrever. Aqui o estrago seria maior — o grupo lança a
  // receita de VÁRIAS reservas de uma vez, então a duplicação sairia
  // multiplicada.
  const { data: fresh } = await supabase.from('payments')
    .update({ ledger_created: true })
    .eq('id', payment.id)
    .eq('ledger_created', false)
    .select('ledger_created, amount_gross, gateway_fee_pct, gateway_fee_amount')
    .maybeSingle()

  if (fresh) {
    const combined = Number(fresh?.amount_gross ?? payment.amount_gross) || 0
    const feePct   = fresh?.gateway_fee_pct ?? 0.035
    const totalFee = fresh?.gateway_fee_amount > 0
      ? Number(fresh.gateway_fee_amount)
      : Math.round(combined * feePct * 100) / 100
    const effectiveDate = new Date().toISOString().slice(0, 10)
    const sumTotals = list.reduce((s, b) => s + Number(b.total_amount || 0), 0) || combined
    const cfg = await getPaymentSettings()

    const rows = []
    let feeAllocated = 0
    for (let i = 0; i < list.length; i++) {
      const b   = list[i]
      const amt = Number(b.total_amount || 0)
      // A última reserva absorve o resto da taxa p/ fechar exatamente em totalFee.
      const fee = i === list.length - 1
        ? Math.round((totalFee - feeAllocated) * 100) / 100
        : Math.round(totalFee * (sumTotals ? amt / sumTotals : 0) * 100) / 100
      feeAllocated = Math.round((feeAllocated + fee) * 100) / 100
      const commissionRows = await orderCommissionRows(b, payment, effectiveDate, cfg)
      rows.push(
        { booking_id: b.id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${b.booking_code}`,  amount: amt,                              direction: 'inflow',  financial_status: 'pending', effective_date: effectiveDate },
        { booking_id: b.id, payment_id: payment.id, entry_type: 'gateway_fee',   description: `Taxa gateway — ${b.booking_code}`,    amount: fee,                              direction: 'outflow', financial_status: 'pending', effective_date: effectiveDate },
        { booking_id: b.id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${b.booking_code}`, amount: Math.round((amt - fee) * 100) / 100, direction: 'inflow',  financial_status: 'pending', effective_date: effectiveDate },
        ...commissionRows,
      )
    }
    const { error: ledgerErr } = await supabase.from('financial_ledger').insert(rows)
    if (ledgerErr) {
      // Devolve a marca para a próxima aprovação tentar de novo.
      console.error('[ledger] grupo: falha ao lançar receita:', ledgerErr.message)
      await supabase.from('payments').update({ ledger_created: false }).eq('id', payment.id)
    }
  }

  // 3) Contabilidade por perna + e-mail + notificações — por reserva.
  for (const b of list) {
    await recordLegAccounting(b, payment).catch((err) =>
      console.error('[ledger] contabilidade por perna (grupo) falhou booking=%s err=%s', b.id, err.message))
    await recordAffiliateCommission(b).catch((err) =>
      console.error('[afiliado] comissão (grupo) falhou booking=%s err=%s', b.id, err.message))
    sendConfirmationEmail(b).catch((err) =>
      console.error('[email] confirmação (grupo) falhou:', err.message))
    notifyBookingPaid(b)
  }
}

// ── Comissão do programa de afiliados ───────────────────
// Gerada quando a reserva indicada é paga. % vem de system_settings
// (affiliate_commission_percent, padrão 5). Repasse manual via PIX em até
// 7 dias corridos (payout_due_date) — o admin marca como pago na tela
// Afiliados. Idempotente: índice único (booking_id, affiliate_id) faz o
// INSERT duplicado (webhook + polling) falhar com 23505, engolido em silêncio.
async function recordAffiliateCommission(booking) {
  if (!booking?.affiliate_id) return
  // Trava anti-autoindicação (defesa em profundidade — a criação já ignora)
  if (booking.affiliate_id === booking.user_id) return

  const { data: st } = await supabase
    .from('system_settings').select('setting_value')
    .eq('setting_key', 'affiliate_commission_percent').maybeSingle()
  const pct = Number(st?.setting_value ?? 5)
  if (!(pct > 0)) return

  const total  = Number(booking.total_amount || 0)
  const amount = Math.round(total * pct) / 100 // total × pct% com 2 casas
  if (!(amount > 0)) return

  const { error } = await supabase.from('commissions').insert({
    booking_id:         booking.id,
    affiliate_id:       booking.affiliate_id,
    commission_model:   'percentage',
    commission_percent: pct,
    commission_amount:  amount,
    platform_amount:    Math.round((total - amount) * 100) / 100,
    operator_amount:    0,
    payout_status:      'pending',
    payout_due_date:    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  })
  if (error) {
    if (error.code === '23505') return // já lançada (webhook+polling) — ok
    throw error
  }

  const fmtBRL = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  notifyUser({
    userId:      booking.affiliate_id,
    bookingId:   booking.id,
    templateKey: 'affiliate_commission',
    title:       'Você ganhou uma comissão! 🤑',
    body:        `Uma reserva indicada por você foi paga (${booking.booking_code}). Sua comissão de ${fmtBRL(amount)} será repassada via PIX em até 7 dias.`,
  })

  // WhatsApp automático pro afiliado — mesmo evento (pagamento aprovado).
  const { notifyAffiliateCommission } = await import('../services/whatsapp.js')
  notifyAffiliateCommission(supabase, { affiliateId: booking.affiliate_id, booking, amount })
    .catch((err) => console.error('[whatsapp] aviso de comissão falhou:', err.message))
}

function fmtDateBR(iso) {
  if (!iso) return 'a definir'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

async function sendConfirmationEmail(booking) {
  if (!booking?.user_id) return

  const { data: user } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', booking.user_id)
    .single()
  if (!user?.email) return

  let serviceName = null
  if (booking.service_type === 'tour' && booking.service_id) {
    const { data: tour } = await supabase
      .from('tours').select('name').eq('id', booking.service_id).maybeSingle()
    serviceName = tour?.name || 'Passeio'
  } else if (booking.service_type === 'transfer') {
    serviceName = [booking.origin_text, booking.destination_text]
      .filter(Boolean).join(' → ') || 'Transfer'
  }

  await sendBookingConfirmation({
    to:          user.email,
    name:        user.full_name?.split(' ')[0],
    bookingCode: booking.booking_code,
    serviceName,
    serviceDate: booking.service_date,
    serviceTime: booking.service_time,
    peopleCount: booking.people_count,
    totalAmount: booking.total_amount,
  })
}

export default router
