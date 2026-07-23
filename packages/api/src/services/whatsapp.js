// ── whatsapp.js ─────────────────────────────────────────
// Envio de mensagens via Z-API (https://z-api.io).
// Sem credenciais configuradas, vira no-op silencioso — nunca
// derruba o fluxo de cadastro/verificação.

const ZAPI_BASE = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';

// URLs dos apps para os deep links das notificações. Defaults já apontam pra
// produção — podem ser sobrescritos por env se o domínio mudar.
const TURISTA_APP = (process.env.TURISTA_APP_URL || 'https://sobrejeri.github.io/giro-jeri').replace(/\/$/, '');
const COOP_APP    = (process.env.COOP_APP_URL    || 'https://sobrejeri.github.io/giro-jeri/cooperativa').replace(/\/$/, '');

// Deep links prontos.
const linkBookingPay  = (id) => `${TURISTA_APP}/minhas-reservas/${id}`;
const linkMyBookings  = ()   => `${TURISTA_APP}/minhas-reservas`;
const linkCoopRides   = ()   => `${COOP_APP}/reservas`;

export function isWhatsappEnabled() {
  return !!(
    process.env.ZAPI_INSTANCE_ID &&
    process.env.ZAPI_INSTANCE_TOKEN &&
    process.env.ZAPI_CLIENT_TOKEN
  );
}

/**
 * Remove tudo que não for dígito do número E.164.
 * '+5588999999999' → '5588999999999'
 */
export function toZapiPhone(e164) {
  return String(e164 || '').replace(/\D/g, '');
}

const MESSAGES = {
  pt: (code) =>
    `Turiva: seu código de verificação é ${code}. Válido por 10 minutos. Não compartilhe.`,
  en: (code) =>
    `Turiva: your verification code is ${code}. Valid for 10 minutes. Do not share.`,
  es: (code) =>
    `Turiva: tu código de verificación es ${code}. Válido por 10 minutos. No lo compartas.`,
};

/**
 * Envia OTP via WhatsApp (Z-API).
 * @param {{ phone: string, code: string, lang?: string }} opts
 *   phone deve estar em E.164 ('+55...')
 */
function bookingSummary(booking) {
  const tipo = booking.service_type === 'transfer' ? 'Translado' : 'Passeio'
  const rota = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')
  const data = booking.service_date
    ? new Date(booking.service_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'a definir'
  return { tipo, rota, data }
}

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function sendToMany(numbers, message) {
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`
  await Promise.allSettled(
    numbers
      .filter(Boolean)
      .map((phone) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone: toZapiPhone(phone), message }),
        }).catch((err) => console.error('[whatsapp] envio falhou:', err.message))
      )
  )
}

// Envia uma mensagem com BOTÃO de link (Z-API send-button-actions). Se a conta
// Z-API não suportar botões, cai para send-text com o link no corpo — ou seja,
// nunca deixa de entregar a mensagem.
async function sendButtonLink(phone, message, label, url) {
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const base = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}`
  try {
    const res = await fetch(`${base}/send-button-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({
        phone: toZapiPhone(phone),
        message,
        buttonActions: [{ id: '1', type: 'URL', url, label }],
      }),
    })
    if (res.ok) return
  } catch { /* cai para texto abaixo */ }
  await sendToMany([phone], `${message}\n\n👉 ${label}: ${url}`)
}

// Busca o telefone de um usuário (cliente ou operador) por id.
async function userPhone(supabase, userId) {
  if (!userId) return null
  const { data } = await supabase.from('users').select('phone').eq('id', userId).maybeSingle()
  return data?.phone || null
}

/**
 * Checa se um número TEM WhatsApp (Z-API phone-exists) — sem enviar mensagem.
 * Retorna { checked, exists }: checked=false quando o Z-API não está
 * configurado ou a consulta falhou (aí não dá para afirmar nada).
 */
export async function checkPhoneExists(phone) {
  if (!isWhatsappEnabled() || !phone) return { checked: false, exists: null }
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/phone-exists/${toZapiPhone(phone)}`
  try {
    const res = await fetch(url, { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN } })
    if (!res.ok) return { checked: false, exists: null }
    const body = await res.json().catch(() => ({}))
    // Z-API responde { exists: true|false }
    if (typeof body.exists === 'boolean') return { checked: true, exists: body.exists }
    return { checked: false, exists: null }
  } catch (err) {
    console.error('[whatsapp] phone-exists falhou:', err.message)
    return { checked: false, exists: null }
  }
}

// Envia pra 1 número e RETORNA o resultado da Z-API (usado no diagnóstico).
export async function sendTestMessage(phone) {
  if (!isWhatsappEnabled()) return { skipped: true, reason: 'Z-API não configurada' }
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({
        phone:   toZapiPhone(phone),
        message: '✅ Turiva — teste de integração WhatsApp. Se você recebeu isto, o Z-API está funcionando!',
      }),
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * WhatsApp para o AFILIADO — comissão gerada (reserva indicada foi PAGA).
 * Regra do produto: comissão só existe após o pagamento; este aviso sai no
 * mesmo evento. Fire-and-forget: erros logados, nunca derrubam a aprovação.
 */
export async function notifyAffiliateCommission(supabase, { affiliateId, booking, amount }) {
  if (!isWhatsappEnabled() || !affiliateId || !booking) return { skipped: true }

  const phone = await userPhone(supabase, affiliateId)
  if (!phone) return { skipped: true, reason: 'afiliado sem telefone' }

  const { tipo, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Você ganhou uma comissão! 🤑\n` +
    `\n` +
    `Uma reserva indicada por você acabou de ser *paga*:\n` +
    `${tipo} · 🗓 ${data} · 🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `💰 Sua comissão: *${fmtBRL(amount)}*\n` +
    `O repasse é feito via PIX em até *7 dias*.\n` +
    `\n` +
    `Acompanhe no app: ${TURISTA_APP}/perfil\n` +
    `Continue divulgando — divulgou, ganhou! 🚀`

  await sendToMany([phone], message)
}

/**
 * WhatsApp para TODAS as cooperativas ativas — solicitação nova.
 * Admin não recebe aqui; só após a expiração (notifyAdminExpiredBooking).
 * Fire-and-forget: erros logados, nunca derrubam o fluxo.
 */
export async function notifyOperatorsNewBooking(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }

  const { data: operators } = await supabase
    .from('users')
    .select('phone')
    .eq('user_type', 'operator')
    .eq('is_active', true)

  if (!operators?.length) return { skipped: true }

  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Nova solicitação 🚗\n` +
    `\n` +
    `${tipo}${rota ? `\n${rota}` : ''}\n` +
    `🗓 ${data}\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `Você tem *24h* para aceitar antes que passe para outra cooperativa.\n` +
    `👉 Aceitar agora: ${linkCoopRides()}`

  await sendToMany(operators.map((op) => op.phone), message)
}

/**
 * WhatsApp pras cooperativas — nova cotação de translado personalizado.
 * Diferente da reserva: a coop precisa abrir e enviar o PREÇO, não só aceitar.
 */
export async function notifyOperatorsNewQuote(supabase, quote) {
  if (!isWhatsappEnabled() || !quote) return { skipped: true }

  const { data: operators } = await supabase
    .from('users')
    .select('phone')
    .eq('user_type', 'operator')
    .eq('is_active', true)

  if (!operators?.length) return { skipped: true }

  const rota = [quote.origin_place_name, quote.destination_place_name].filter(Boolean).join(' → ')
  const data = quote.service_date
    ? new Date(quote.service_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'a definir'
  const hora = quote.service_time ? ` ${quote.service_time.slice(0, 5)}` : ''

  const message =
    `*TURIVA* · Nova cotação 💸\n` +
    `\n` +
    `Translado privativo${rota ? `\n${rota}` : ''}\n` +
    `🗓 ${data}${hora}\n` +
    `👥 ${quote.people_count || 1} passageiro(s)\n` +
    `\n` +
    `Defina o valor para enviar ao cliente.\n` +
    `👉 Responder cotação: ${linkCoopRides()}`

  await sendToMany(operators.map((op) => op.phone), message)
}

/**
 * WhatsApp para o(s) admin(s) — solicitação que ninguém aceitou em 24h.
 * Chamado de forma lazy pelo /api/operator/bookings ao detectar expiradas
 * ainda sem aviso (flag bookings.admin_notified_expired_at).
 */
export async function notifyAdminExpiredBooking(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }

  const { data: admins } = await supabase
    .from('users')
    .select('phone')
    .eq('user_type', 'admin')
    .eq('is_active', true)

  if (!admins?.length) return { skipped: true }

  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Solicitação sem cooperativa ⚠️\n` +
    `\n` +
    `Nenhuma cooperativa aceitou em 24h.\n` +
    `${tipo}${rota ? `\n${rota}` : ''}\n` +
    `🗓 ${data}\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `Assuma como operador para não perder o atendimento.\n` +
    `👉 Abrir: ${linkCoopRides()}`

  await sendToMany(admins.map((a) => a.phone), message)
}

// ── ORDEM DE SERVIÇO (Despacho) ────────────────────────
// Ao confirmar o despacho, envia a OS automaticamente via Z-API para o CLIENTE
// (dados do veículo/motorista) e para o MOTORISTA (dados da corrida/cliente).
export async function notifyDispatchOS(supabase, { booking, assignment }) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const { tipo, data } = bookingSummary(booking)
  const hora       = booking.service_time ? booking.service_time.slice(0, 5) : null
  const quando     = `${data}${hora ? ` às ${hora}` : ''}`
  const veiculo    = assignment?.real_vehicle_text || '—'
  const motorista  = assignment?.driver_name || '—'
  const motoFone   = assignment?.driver_phone || ''
  const obs        = assignment?.dispatch_notes ? `\n📝 ${assignment.dispatch_notes}` : ''
  const embarque   = booking.origin_text || booking.pickup_place_name || ''
  const destino    = booking.destination_text || booking.destination_place_name || ''
  const modo       = booking.booking_mode === 'private' ? ` Privativo` : booking.booking_mode === 'shared' ? ` Compartilhado` : ''

  // Cliente
  const clientePhone = await userPhone(supabase, booking.user_id)
  if (clientePhone) {
    const msg =
      `*TURIVA* · Tudo pronto para o seu ${tipo.toLowerCase()}! 🎉\n\n` +
      `📅 ${quando}\n` +
      (embarque ? `📍 Embarque: ${embarque}\n` : '') +
      (destino  ? `🏁 Destino: ${destino}\n` : '') +
      `🚗 Veículo: ${veiculo}\n` +
      `👤 Motorista: ${motorista}${motoFone ? ` — ${motoFone}` : ''}\n` +
      `🔖 ${booking.booking_code}` + obs +
      `\n\nQualquer dúvida, é só chamar. Boa viagem! 🌴`
    await sendToMany([clientePhone], msg)
  }

  // Motorista (a OS)
  if (motoFone) {
    const { data: cli } = await supabase.from('users')
      .select('full_name, phone').eq('id', booking.user_id).maybeSingle()
    const msg =
      `*TURIVA* · Ordem de Serviço 🚗\n\n` +
      `🚙 ${tipo}${modo}\n` +
      `📅 ${quando}\n` +
      `👥 ${booking.people_count || '—'} pax\n` +
      (embarque ? `📍 Embarque: ${embarque}\n` : '') +
      (destino  ? `🏁 Destino: ${destino}\n` : '') +
      `🚗 Veículo: ${veiculo}\n` +
      `🙋 Cliente: ${cli?.full_name || '—'}${cli?.phone ? ` — ${cli.phone}` : ''}\n` +
      `🔖 ${booking.booking_code}` + obs
    await sendToMany([motoFone], msg)
  }

  return { sent: true }
}

// ── CLIENTE ────────────────────────────────────────────
// Cooperativa aceitou → cliente precisa PAGAR pra confirmar. Gatilho de
// conversão mais crítico: sem isso o cliente não sabe que pode pagar.
export async function notifyClientBookingAccepted(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Reserva aceita 🎉\n` +
    `\n` +
    `Uma cooperativa aceitou seu ${tipo.toLowerCase()}!\n` +
    `${rota ? `${rota}\n` : ''}` +
    `🗓 ${data}\n` +
    `💰 *${fmtBRL(booking.total_amount)}*\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `Falta só o pagamento para confirmar.`
  // Item 1: botão de pagamento no WhatsApp (cai para link em texto se preciso).
  await sendButtonLink(phone, message, 'Pagar agora', linkBookingPay(booking.id))
}

// ── CICLO DA CORRIDA (cooperativa) ─────────────────────
// Item 3: ao INICIAR a corrida, avisa o cliente que o motorista está a caminho.
export async function notifyClientRideStarted(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo } = bookingSummary(booking)
  const embarque = booking.origin_text || booking.pickup_place_name || ''
  const message =
    `*TURIVA* · A caminho! 🚗💨\n\n` +
    `Seu ${tipo.toLowerCase()} (${booking.booking_code || '-'}) começou e o motorista já está a caminho` +
    `${embarque ? ` do ponto de embarque: ${embarque}` : ''}.\n\n` +
    `Bom passeio! 🌴`
  await sendToMany([phone], message)
}

// Item 4: ao CONCLUIR, avisa o cliente que a corrida foi finalizada.
export async function notifyClientRideCompleted(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo } = bookingSummary(booking)
  const message =
    `*TURIVA* · Serviço concluído ✅\n\n` +
    `Seu ${tipo.toLowerCase()} (${booking.booking_code || '-'}) foi finalizado. ` +
    `Esperamos que tenha sido incrível! 🌅\n\n` +
    `Obrigado por escolher a Turiva.`
  await sendToMany([phone], message)
}

// Item 5: ao CONCLUIR, convida o cliente a AVALIAR (botão para a reserva).
export async function notifyClientReviewRequest(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo } = bookingSummary(booking)
  const message =
    `*TURIVA* · Conte como foi! ⭐\n\n` +
    `Que tal avaliar seu ${tipo.toLowerCase()} (${booking.booking_code || '-'})? ` +
    `Sua opinião ajuda a cooperativa e outros viajantes. Leva 1 minutinho. 🙏`
  await sendButtonLink(phone, message, 'Avaliar agora', linkBookingPay(booking.id))
}

// Cotação personalizada precificada → cliente vê o valor e decide.
export async function notifyClientQuoteReady(supabase, quote) {
  if (!isWhatsappEnabled() || !quote) return { skipped: true }
  const phone = await userPhone(supabase, quote.user_id)
  if (!phone) return { skipped: true }
  const rota = [quote.origin_place_name, quote.destination_place_name].filter(Boolean).join(' → ')
  const message =
    `*TURIVA* · Cotação pronta 💸\n` +
    `\n` +
    `Seu translado personalizado foi precificado!\n` +
    `${rota ? `${rota}\n` : ''}` +
    `💰 *${fmtBRL(quote.quoted_price)}*\n` +
    `\n` +
    `Aceite e pague para confirmar (válido por tempo limitado).\n` +
    `👉 Ver cotação: ${linkMyBookings()}`
  await sendToMany([phone], message)
}

// Pagamento confirmado → segurança pro cliente de que deu tudo certo.
export async function notifyClientPaymentConfirmed(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Pagamento confirmado ✅\n` +
    `\n` +
    `Tudo certo com seu ${tipo.toLowerCase()}!\n` +
    `${rota ? `${rota}\n` : ''}` +
    `🗓 ${data}\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `A cooperativa já vai cuidar do seu atendimento. Boa viagem! 🚗\n` +
    `👉 Ver reserva: ${linkBookingPay(booking.id)}`
  await sendToMany([phone], message)
}

// ── COOPERATIVA ────────────────────────────────────────
// Cliente pagou → a coop que aceitou precisa confirmar/despachar. Momento
// em que a coop tem que AGIR, por isso vale o WhatsApp (além da central).
export async function notifyOperatorPaymentReceived(supabase, booking) {
  if (!isWhatsappEnabled() || !booking?.operator_id) return { skipped: true }
  const phone = await userPhone(supabase, booking.operator_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Cliente pagou 💰\n` +
    `\n` +
    `${tipo}${rota ? `\n${rota}` : ''}\n` +
    `🗓 ${data}\n` +
    `💰 *${fmtBRL(booking.total_amount)}*\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `Confirme com o cliente e siga com o atendimento.\n` +
    `👉 Abrir corrida: ${linkCoopRides()}`
  await sendToMany([phone], message)
}

export async function sendWhatsappOtp({ phone, code, lang = 'pt' }) {
  if (!isWhatsappEnabled()) return { skipped: true };

  const msgFn = MESSAGES[lang] || MESSAGES['pt'];
  const message = msgFn(code);

  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token':  ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone:   toZapiPhone(phone),
        message,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[whatsapp] Z-API respondeu', res.status, body.slice(0, 300));
      return { error: true };
    }

    return await res.json();
  } catch (err) {
    console.error('[whatsapp] falha ao enviar:', err.message);
    return { error: true };
  }
}
