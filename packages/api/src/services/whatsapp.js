// ── whatsapp.js ─────────────────────────────────────────
// Envio de mensagens via Z-API (https://z-api.io).
// Sem credenciais configuradas, vira no-op silencioso — nunca
// derruba o fluxo de cadastro/verificação.

const ZAPI_BASE = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';

// URLs dos apps para os deep links das notificações. Defaults já apontam pra
// produção — podem ser sobrescritos por env se o domínio mudar.
const TURISTA_APP = (process.env.TURISTA_APP_URL || 'https://sobrejeri.github.io/giro-jeri').replace(/\/$/, '');
const COOP_APP    = (process.env.COOP_APP_URL    || 'https://sobrejeri.github.io/giro-jeri/operador').replace(/\/$/, '');

// Deep links prontos.
const linkBookingPay  = (id) => `${TURISTA_APP}/minhas-reservas/${id}`;
const linkMyBookings  = ()   => `${TURISTA_APP}/minhas-reservas`;
const linkCoopRides   = ()   => `${COOP_APP}/reservas`;
// Link público da Ordem de Serviço (token assinado) — abre sem login e tem
// botão de baixar. Substitui o envio do PDF como anexo, que esbarrava em
// limite de tamanho no caminho app -> API -> Z-API.
const linkOs          = (t)  => `${COOP_APP}/os/${t}`;

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

// Envia um DOCUMENTO (PDF) pelo Z-API. `document` aceita URL pública ou data
// URI base64 ('data:application/pdf;base64,...'). Best-effort: registra a falha
// e devolve o resultado, nunca lança — o envio do documento não pode derrubar
// o fluxo que o disparou (ex.: despacho).
async function sendDocument(phone, document, fileName, caption) {
  if (!isWhatsappEnabled() || !phone || !document) return { skipped: true }
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-document/pdf`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({
        phone: toZapiPhone(phone),
        document,
        fileName: fileName || 'documento.pdf',
        ...(caption ? { caption } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[whatsapp] envio de PDF falhou', res.status, body.slice(0, 300))
      // `detail` volta para a tela do operador: sem a resposta crua do Z-API
      // não dá para saber se o problema é credencial, formato ou o número.
      return { error: true, status: res.status, detail: body.slice(0, 300) }
    }
    return await res.json().catch(() => ({ ok: true }))
  } catch (err) {
    console.error('[whatsapp] envio de PDF falhou:', err.message)
    return { error: true, detail: err.message }
  }
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
 * WhatsApp para o AFILIADO — comissão CANCELADA (a reserva indicada foi
 * cancelada, ou seja, o serviço não foi realizado). Transparência: o afiliado
 * já tinha sido avisado da comissão, então precisa saber que ela caiu.
 * Fire-and-forget: erros logados, nunca derrubam o cancelamento.
 */
export async function notifyAffiliateCommissionCancelled(supabase, { affiliateId, booking, amount }) {
  if (!isWhatsappEnabled() || !affiliateId || !booking) return { skipped: true }

  const phone = await userPhone(supabase, affiliateId)
  if (!phone) return { skipped: true, reason: 'afiliado sem telefone' }

  const { tipo, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Comissão cancelada\n` +
    `\n` +
    `Uma reserva indicada por você foi *cancelada* e o serviço não será realizado:\n` +
    `${tipo} · 🗓 ${data} · 🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `❌ Comissão cancelada: *${fmtBRL(amount)}*\n` +
    `Como a comissão só vale para serviços realizados, esse valor não entra no seu repasse.\n` +
    `\n` +
    `Suas outras indicações seguem normalmente: ${TURISTA_APP}/afiliado\n` +
    `Continue divulgando! 🚀`

  await sendToMany([phone], message)
}

/**
 * WhatsApp para TODAS os operadores ativos — solicitação nova.
 * Admin não recebe aqui; só após a expiração (notifyAdminExpiredBooking).
 * Fire-and-forget: erros logados, nunca derrubam o fluxo.
 */
export async function notifyOperatorsNewBooking(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }

  // Item 17: só os operadores com a FROTA compatível (não desabilitaram os
  // veículos da reserva). Ex.: helicóptero/UTV não notificam quem não opera.
  const { eligibleOperatorsForBooking } = await import('./fleet.js')
  const operators = await eligibleOperatorsForBooking(supabase, booking.id)

  if (!operators?.length) return { skipped: true }

  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Nova solicitação 🚗\n` +
    `\n` +
    `${tipo}${rota ? `\n${rota}` : ''}\n` +
    `🗓 ${data}\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `Você tem *24h* para aceitar antes que passe para outro operador.\n` +
    `👉 Aceitar agora: ${linkCoopRides()}`

  await sendToMany(operators.map((op) => op.phone), message)
}

// Modal de um translado PERSONALIZADO. É de rua por natureza: os translados
// aéreos são rotas fixas (migration 067), não cotação livre. Constante e não
// campo do formulário porque o cliente não escolhe meio ao pedir cotação — se
// um dia escolher, isto vira uma coluna em `transfer_quotes`.
const MODAL_DA_COTACAO = 'terrestre'

/**
 * WhatsApp pras operadores — nova cotação de translado personalizado.
 * Diferente da reserva: a coop precisa abrir e enviar o PREÇO, não só aceitar.
 */
export async function notifyOperatorsNewQuote(supabase, quote) {
  if (!isWhatsappEnabled() || !quote) return { skipped: true }

  // Cotação nasce SEM veículo — o cliente só diz de onde, para onde e quando —
  // então o filtro por veículo não tem no que se apoiar. O corte é o MODAL:
  // translado personalizado é de rua, e o operador que só voa não deve
  // receber pedido de buggy. Fail-open dentro do helper.
  const { eligibleOperatorsForModal } = await import('./fleet.js')
  const operators = await eligibleOperatorsForModal(supabase, MODAL_DA_COTACAO)

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
    `*TURIVA* · Solicitação sem operador ⚠️\n` +
    `\n` +
    `Nenhum operador aceitou em 24h.\n` +
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
// Envia o PDF da Ordem de Serviço ao cliente e ao motorista. Chamado por um
// endpoint PRÓPRIO (/operational/:id/os-pdf), depois que o despacho já
// aconteceu — o anexo nunca entra no caminho crítico do despacho.
// O PDF é gerado no app do operador (orderPDF.js) e chega em base64, então o
// documento enviado é exatamente o que a coop vê, sem duplicar layout aqui.
export async function sendOsPdf(supabase, { booking, driverPhone, pdfBase64 }) {
  if (!isWhatsappEnabled()) return { skipped: true, reason: 'whatsapp desligado' }
  if (!booking || !pdfBase64) return { skipped: true, reason: 'sem PDF' }

  const file = pdfBase64.startsWith('data:')
    ? pdfBase64
    : `data:application/pdf;base64,${pdfBase64}`
  const name = `OS-${booking.booking_code || 'turiva'}.pdf`

  // O Z-API espera DDI+DDD+número. O telefone do motorista é digitado à mão no
  // despacho e costuma vir sem o 55 — mesma normalização que o app já faz ao
  // compartilhar a OS manualmente (≤11 dígitos = número local → prefixa 55).
  const comDDI = (p) => {
    const d = String(p || '').replace(/\D/g, '')
    return d && d.length <= 11 ? `55${d}` : d
  }

  const alvos = []
  const clientePhone = await userPhone(supabase, booking.user_id)
  if (clientePhone) alvos.push(comDDI(clientePhone))
  if (driverPhone)  alvos.push(comDDI(driverPhone))
  if (alvos.length === 0) return { skipped: true, reason: 'sem telefone' }

  const results = await Promise.all(
    alvos.map(async (p) => ({ phone: p, ...(await sendDocument(p, file, name, 'Ordem de Serviço')) })),
  )
  const enviados = results.filter((r) => r && !r.error && !r.skipped).length
  const falhas   = results.filter((r) => r?.error)
  return {
    sent:  enviados,
    total: alvos.length,
    kb:    Math.round((file.length * 0.75) / 1024),
    ...(falhas.length ? { error: falhas[0].detail || 'falha no envio', status: falhas[0].status } : {}),
  }
}

export async function notifyDispatchOS(supabase, { booking, assignment }) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  // Link da OS (não o PDF): o anexo em base64 estourava o limite de corpo da
  // API. O link abre a OS no navegador, com opção de baixar em PDF.
  let osUrl = null
  try {
    const { signOsToken } = await import('../lib/osToken.js')
    osUrl = linkOs(signOsToken(booking.id))
  } catch (e) {
    console.error('[whatsapp] não foi possível gerar o link da OS:', e.message)
  }
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
      (osUrl ? `\n\n📄 Ordem de Serviço: ${osUrl}` : '') +
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
      `🔖 ${booking.booking_code}` + obs +
      (osUrl ? `\n\n📄 Ordem de Serviço: ${osUrl}` : '')
    await sendToMany([motoFone], msg)
  }

  return { sent: true }
}

// ── RESET DE SENHA ─────────────────────────────────────
// Item 3: envia o link de redefinição de senha por WhatsApp (botão + fallback
// para link em texto). O token vem do endpoint /forgot-password.
const linkPasswordReset = (token) => `${TURISTA_APP}/redefinir-senha?token=${encodeURIComponent(token)}`;

export async function notifyPasswordReset(phone, token) {
  if (!isWhatsappEnabled() || !phone) return { skipped: true }
  const url = linkPasswordReset(token)
  const message =
    `*TURIVA* · Redefinição de senha 🔐\n\n` +
    `Recebemos um pedido para redefinir a sua senha. Toque no botão para criar ` +
    `uma nova (o link vale por 30 minutos).\n\n` +
    `Se não foi você, é só ignorar esta mensagem.`
  await sendButtonLink(phone, message, 'Redefinir senha', url)
  return { sent: true }
}

// ── CLIENTE ────────────────────────────────────────────
// Operador aceitou → cliente precisa PAGAR pra confirmar. Gatilho de
// conversão mais crítico: sem isso o cliente não sabe que pode pagar.
export async function notifyClientBookingAccepted(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `*TURIVA* · Reserva aceita 🎉\n` +
    `\n` +
    `Um operador aceitou seu ${tipo.toLowerCase()}!\n` +
    `${rota ? `${rota}\n` : ''}` +
    `🗓 ${data}\n` +
    `💰 *${fmtBRL(booking.total_amount)}*\n` +
    `🔖 ${booking.booking_code || '-'}\n` +
    `\n` +
    `Falta só o pagamento para confirmar.`
  // Item 1: botão de pagamento no WhatsApp (cai para link em texto se preciso).
  await sendButtonLink(phone, message, 'Pagar agora', linkBookingPay(booking.id))
}

// ── CICLO DA CORRIDA (operador) ─────────────────────
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
    `Sua opinião ajuda o operador e outros viajantes. Leva 1 minutinho. 🙏`
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
    `O operador já vai cuidar do seu atendimento. Boa viagem! 🚗\n` +
    `👉 Ver reserva: ${linkBookingPay(booking.id)}`
  await sendToMany([phone], message)
}

// ── OPERADOR ────────────────────────────────────────
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
