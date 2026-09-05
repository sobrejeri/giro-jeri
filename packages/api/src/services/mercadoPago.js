import { MercadoPagoConfig, Payment } from 'mercadopago'

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
const testMode    = !accessToken || accessToken.startsWith('TEST-')

const mp = accessToken
  ? new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } })
  : null

// ── Marketplace OAuth (split de pagamentos) ───────────
// Credenciais do aplicativo marketplace (criado pelo lojista no painel MP).
const OAUTH_CLIENT_ID     = process.env.MP_CLIENT_ID || process.env.MP_MARKETPLACE_CLIENT_ID || ''
const OAUTH_CLIENT_SECRET = process.env.MP_CLIENT_SECRET || process.env.MP_MARKETPLACE_CLIENT_SECRET || ''

export function isMarketplaceConfigured() {
  return !!(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET)
}

// Cria um cliente de pagamento. Com sellerAccessToken, opera NA conta da
// operador (split); sem ele, usa o token da plataforma.
function paymentClientFor(sellerAccessToken) {
  if (sellerAccessToken) {
    const cfg = new MercadoPagoConfig({ accessToken: sellerAccessToken, options: { timeout: 10000 } })
    return new Payment(cfg)
  }
  return mp ? new Payment(mp) : null
}

// Valor em reais no formato que o Mercado Pago aceita.
//
// O gateway recusa com "Invalid value for transaction_amount" qualquer coisa
// que não seja um número positivo com no máximo 2 casas. E é fácil chegar aqui
// com lixo de ponto flutuante: acréscimo de temporada é percentual, e
// `5 * 1.15` dá 5.749999999999999 em JavaScript. Na tela isso aparece como
// "R$ 5,75" — o cliente vê um valor válido e o pagamento é recusado com uma
// mensagem que não diz nada.
//
// Trava na FRONTEIRA de propósito: é o último ponto por onde todo pagamento
// passa. Corrigir só na origem deixaria o próximo caminho novo desprotegido.
function valorParaMP(v, campo = 'transaction_amount') {
  const n = Math.round(Number(v) * 100) / 100
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Valor inválido para ${campo}: ${v}`)
  }
  return n
}

// Formata uma data no padrão que o Mercado Pago espera em date_of_expiration:
// ISO 8601 com offset (ex.: 2026-06-24T21:45:00.000+00:00). O MP pode recusar o
// formato UTC com "Z".
function mpDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  const off  = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const oh   = pad(Math.floor(Math.abs(off) / 60))
  const om   = pad(Math.abs(off) % 60)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000${sign}${oh}:${om}`
}

export async function createPixPayment({ amount, description, payerEmail, payerName, payerDoc, externalRef, sellerAccessToken, applicationFee }) {
  const client = paymentClientFor(sellerAccessToken)
  // Sem token nenhum (nem da plataforma, nem do operador) = configuração
  // ausente. Erro claro em vez de um PIX falso que só "expira".
  if (!client) throw new Error('Mercado Pago não configurado: falta o Access Token (MP_ACCESS_TOKEN) no servidor.')
  if (!payerEmail) throw semEmailDoComprador()

  // Render expõe RENDER_EXTERNAL_URL automaticamente; API_BASE_URL como fallback manual
  const apiBase = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || ''
  const notificationUrl = apiBase ? `${apiBase}/api/payments/webhook` : undefined

  const body = {
    transaction_amount: valorParaMP(amount),
    description,
    payment_method_id:  'pix',
    external_reference: String(externalRef),
    // Validade explícita do QR (30 min) — não depende do padrão do MP.
    date_of_expiration: mpDate(new Date(Date.now() + 30 * 60 * 1000)),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    payer: {
      email: payerEmail,
      ...nomeDoPagador(payerName),
      // Identificação do pagador (o Payment Brick envia o CPF/CNPJ no PIX)
      ...(payerDoc ? { identification: { type: String(payerDoc).length === 14 ? 'CNPJ' : 'CPF', number: payerDoc } } : {}),
    },
  }
  // Split: comissão da plataforma quando o pagamento cai na conta do operador
  if (sellerAccessToken && applicationFee > 0) {
    // A comissão também passa pela trava: `application_fee` com casas demais é
    // recusado pelo mesmo motivo, e ela nasce de um percentual.
    body.application_fee = valorParaMP(applicationFee, 'application_fee')
  }

  const response = await client.create({ body })

  return {
    mp_id:         String(response.id),
    status:        response.status,
    status_detail: response.status_detail || null,
    pix_code:      response.point_of_interaction?.transaction_data?.qr_code,
    qr_base64:     response.point_of_interaction?.transaction_data?.qr_code_base64,
    expires_at:    response.date_of_expiration,
  }
}

// ── Snapshot do pagamento, seguro para guardar ───────────────────────────────
// `raw_response_json` fica no banco para sempre e é lido no painel. A resposta
// CRUA do Mercado Pago carrega o CPF completo do portador e do pagador — dado
// que não precisamos guardar para conciliar nada. Aqui fica só o que serve para
// cruzar com o extrato: quem recebeu, quanto, quando, e quanto o gateway
// cobrou. Nunca token, nunca CVV, nunca número de cartão, nunca CPF.
export function sanitizedPaymentResult(response) {
  return {
    payment_id:         response?.id == null ? null : String(response.id),
    status:             response?.status || null,
    status_detail:      response?.status_detail || null,
    payment_method_id:  response?.payment_method_id || null,
    payment_type_id:    response?.payment_type_id || null,
    collector_id:       response?.collector_id == null ? null : String(response.collector_id),
    transaction_amount: response?.transaction_amount == null ? null : Number(response.transaction_amount),
    installments:       response?.installments == null ? null : Number(response.installments),
    external_reference: response?.external_reference == null ? null : String(response.external_reference),
    card_last_four:     response?.card?.last_four_digits || null,
    // Conciliação: quando aprovou, quanto o MP cobrou de taxa e quanto sobrou
    // líquido. Sem isto a taxa real só existia no extrato deles.
    date_approved:      response?.date_approved || null,
    fee_amount: Array.isArray(response?.fee_details)
      ? Math.round(response.fee_details.reduce((soma, f) => soma + (Number(f?.amount) || 0), 0) * 100) / 100
      : null,
    net_received_amount: response?.transaction_details?.net_received_amount == null
      ? null : Number(response.transaction_details.net_received_amount),
  }
}

// O Mercado Pago exige o e-mail REAL do pagador. Identidade fictícia derruba a
// aprovação e cega o antifraude — e ainda grava no banco um comprador que não
// existe. Quando a conta não tem e-mail o problema é do cadastro, não do
// servidor: 422 dizendo o que corrigir, em vez de um 500 que faz o cliente
// repetir a tentativa para sempre.
function semEmailDoComprador() {
  const err = new Error('Sua conta está sem e-mail cadastrado, e o Mercado Pago exige o e-mail do pagador. Adicione um e-mail no seu perfil e tente de novo.')
  err.status = 422
  return err
}

// Telefone do pagador no formato do Mercado Pago (DDD e número separados).
// Devolve null quando não dá para afirmar que é um telefone brasileiro válido —
// mandar lixo é pior que não mandar: o antifraude lê como dado inconsistente.
function telefoneDoPagador(phone) {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)   // tira o código do país
  if (d.length < 10 || d.length > 11) return null           // DDD + 8 ou 9 dígitos
  return { area_code: d.slice(0, 2), number: d.slice(2) }
}

// Nome do pagador como o Mercado Pago espera, sem inventar ninguém: só manda o
// que existe de verdade.
function nomeDoPagador(payerName) {
  const partes = String(payerName || '').trim().split(/\s+/).filter(Boolean)
  return {
    ...(partes[0] ? { first_name: partes[0] } : {}),
    ...(partes.length > 1 ? { last_name: partes.slice(1).join(' ') } : {}),
  }
}

// =============================================================================
// MOTOR DE PERNAS (Etapa 2, Onda A) — split nativo N-recebedores
// =============================================================================
// "Split de pagamentos" do Mercado Pago Brasil: 1 pagamento com N
// `disbursements`, cada um com collector_id (mp_user_id da coop) + amount +
// application_fee (comissão da plataforma sobre a fatia daquela perna).
// DIFERENTE do split de 1 recebedor acima (sellerAccessToken + application_fee
// simples, que cria o pagamento NA conta da coop): aqui o pagamento é criado
// com o token da PLATAFORMA, que distribui para várias contas ao mesmo tempo.
// Requer a aplicação marketplace com "Split de pagamentos" habilitado no
// painel do MP — NÃO validado em produção/sandbox real neste ambiente (sem
// acesso a uma conta MP com o recurso ativo). Ver Riscos/Objeções do handoff.
export function buildDisbursements(recipients) {
  return recipients.map((r) => ({
    amount:              Math.round(r.amount * 100) / 100,
    collector_id:        Number(r.collectorId),
    ...(r.applicationFee > 0 ? { application_fee: Math.round(r.applicationFee * 100) / 100 } : {}),
    external_reference:  r.externalReference,
  }))
}

export async function createPixPaymentSplit({ amount, description, payerEmail, payerName, payerDoc, externalRef, disbursements }) {
  if (!mp) throw new Error('Mercado Pago não configurado: falta o Access Token da plataforma (MP_ACCESS_TOKEN) para o split multi-recebedor.')
  if (!disbursements?.length) throw new Error('Split multi-recebedor exige ao menos 1 disbursement.')
  if (!payerEmail) throw semEmailDoComprador()

  const client = new Payment(mp)
  const apiBase = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || ''
  const notificationUrl = apiBase ? `${apiBase}/api/payments/webhook` : undefined

  const body = {
    transaction_amount: valorParaMP(amount),
    description,
    payment_method_id:  'pix',
    external_reference: String(externalRef),
    date_of_expiration: mpDate(new Date(Date.now() + 30 * 60 * 1000)),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    payer: {
      email: payerEmail,
      ...nomeDoPagador(payerName),
      ...(payerDoc ? { identification: { type: String(payerDoc).length === 14 ? 'CNPJ' : 'CPF', number: payerDoc } } : {}),
    },
    disbursements,
  }

  const response = await client.create({ body })

  return {
    mp_id:         String(response.id),
    status:        response.status,
    status_detail: response.status_detail || null,
    pix_code:      response.point_of_interaction?.transaction_data?.qr_code,
    qr_base64:     response.point_of_interaction?.transaction_data?.qr_code_base64,
    expires_at:    response.date_of_expiration,
  }
}

// ── Mapa de recusas → chave i18n ──────────────────────
const REJECTION_MAP = {
  cc_rejected_insufficient_amount:    'payment.rejected.insufficient_amount',
  cc_rejected_bad_filled_security_code: 'payment.rejected.bad_cvv',
  cc_rejected_bad_filled_date:        'payment.rejected.bad_date',
  cc_rejected_bad_filled_card_number: 'payment.rejected.bad_number',
  cc_rejected_high_risk:              'payment.rejected.high_risk',
  cc_rejected_call_for_authorize:     'payment.rejected.call_authorize',
  cc_rejected_card_disabled:          'payment.rejected.card_disabled',
  cc_rejected_duplicated_payment:     'payment.rejected.duplicated',
}

export function mapRejectionKey(statusDetail) {
  return REJECTION_MAP[statusDetail] || 'payment.rejected.generic'
}

// ── Pagamento com cartão de crédito ou débito ─────────
export async function createCardPayment({
  amount,
  description,
  installments = 1,
  paymentMethodId,
  cardToken,
  issuerId,
  payerEmail,
  payerName,
  payerDoc,
  payerPhone,
  payerRegistrationDate,
  item,
  // Injetável para o teste exercitar o CORPO enviado ao Mercado Pago sem rede.
  paymentClient,
  externalRef,
  idempotencyKey,
  deviceId,
  sellerAccessToken,
  applicationFee,
  threeDSecure = false,
}) {
  // Com split, opera na conta do operador; sem split, na conta da plataforma.
  // Sem fallback fake para cartão — erro propaga para o caller.
  const client = paymentClient || paymentClientFor(sellerAccessToken)
  if (!client) throw new Error('Mercado Pago não configurado (access token ausente)')
  // Sem chave de idempotência não se cobra. Inventar uma aqui destrói a única
  // proteção que existe contra cobrança dupla: chave nova = compra nova para o
  // Mercado Pago, e o retry de um timeout vira uma segunda cobrança real.
  if (!idempotencyKey) throw new Error('payment_attempt_id ausente; pagamento não criado.')
  if (!payerEmail) throw semEmailDoComprador()

  const body = {
    transaction_amount: valorParaMP(amount),
    description,
    installments:       Number(installments) || 1,
    payment_method_id:  paymentMethodId,
    token:              cardToken,
    statement_descriptor: 'TURIVA',
    external_reference: externalRef,
    payer: {
      email:          payerEmail,
      ...nomeDoPagador(payerName),
      identification: { type: 'CPF', number: payerDoc },
    },
  }

  // ── additional_info: o que o antifraude realmente lê ────────────────────
  // O Mercado Pago documenta este bloco como um dos que mais pesam na
  // aprovação de cartão. Sem ele a cobrança chega "nua": um valor, um cartão e
  // nada que explique O QUE está sendo comprado nem QUEM é o comprador — e
  // compra sem contexto, de vendedor novo, é lida como risco. É uma das causas
  // documentadas de cc_rejected_high_risk.
  //
  // Tudo aqui é dado REAL do pedido e do cadastro. Campo que não existe é
  // OMITIDO: mandar telefone ou nome inventado piora, não melhora.
  const telefone = telefoneDoPagador(payerPhone)
  const pagadorInfo = {
    ...nomeDoPagador(payerName),
    ...(telefone ? { phone: telefone } : {}),
    // Há quanto tempo é cliente. Conta nova comprando alto é o padrão de
    // fraude; conta antiga é o contrário — e o MP só sabe se contarmos.
    ...(payerRegistrationDate ? { registration_date: payerRegistrationDate } : {}),
  }
  if (item || Object.keys(pagadorInfo).length) {
    body.additional_info = {
      ...(item ? { items: [{
        id:          String(item.id),
        title:       String(item.title || '').slice(0, 256),
        description: String(item.description || item.title || '').slice(0, 256),
        category_id: 'travels',
        quantity:    Number(item.quantity) || 1,
        unit_price:  valorParaMP(item.unit_price ?? amount, 'unit_price'),
      }] } : {}),
      ...(Object.keys(pagadorInfo).length ? { payer: pagadorInfo } : {}),
    }
  }

  // issuer_id é opcional — não enviar quando undefined para evitar rejeição MP
  if (issuerId) body.issuer_id = String(issuerId)

  // 3-D Secure. No Brasil o Mercado Pago EXIGE autenticação do emissor para
  // cartão de DÉBITO: sem isto o pagamento é recusado, e era por isso que a
  // opção de débito não funcionava.
  //
  // 'optional' e não 'mandatory' de propósito: o desafio só aparece quando o
  // emissor pede. Obrigar todo mundo a passar pela tela do banco derruba
  // conversão sem necessidade — inclusive no crédito, onde o 3DS nem é exigido
  // (por isso este parâmetro só é ligado para débito).
  if (threeDSecure) body.three_d_secure_mode = 'optional'

  // Split: comissão da plataforma quando o pagamento cai na conta do operador
  if (sellerAccessToken && applicationFee > 0) {
    // A comissão também passa pela trava: `application_fee` com casas demais é
    // recusado pelo mesmo motivo, e ela nasce de um percentual.
    body.application_fee = valorParaMP(applicationFee, 'application_fee')
  }

  const response = await client.create({
    body,
    // X-Idempotency-Key protege contra COBRAR DUAS VEZES quando a mesma
    // tentativa é reenviada (timeout de rede, cliente tocando de novo).
    //
    // Ela NÃO pode ser a reserva: a chave é por TENTATIVA. Com booking.id, o
    // cliente cujo cartão foi recusado tentava de novo e o Mercado Pago
    // devolvia a MESMA cobrança recusada, sem nem tocar no cartão novo — e a
    // gravação estourava a unicidade de gateway_transaction_id, jogando o erro
    // do banco na cara do cliente. Quem chama manda uma chave por tentativa
    // (o token do cartão serve: é de uso único).
    requestOptions: {
      idempotencyKey,
      // X-Meli-Session-Id: identifica o APARELHO para o antifraude. O Mercado
      // Pago documenta este sinal como um dos que mais pesam na aprovação —
      // sem ele, compra legítima de aparelho desconhecido vira risco e volta
      // como cc_rejected_high_risk. O SDK envia o header a partir daqui.
      ...(deviceId ? { meliSessionId: String(deviceId) } : {}),
    },
  })

  // Extrai juro de parcelamento da lista de fees retornada pelo MP
  const financingFee = (response.fees || [])
    .filter((f) => f.fee_id === 'FINANCING_FEE' || (f.type && /juros|interest|financing/i.test(f.type)))
    .reduce((acc, f) => acc + (Number(f.value) || 0), 0)

  return {
    mp_id:                  String(response.id),
    status:                 response.status,
    status_detail:          response.status_detail || null,
    installments:           response.installments || installments,
    installment_amount:     response.transaction_details?.installment_amount ?? null,
    installment_fee_amount: financingFee > 0 ? financingFee : null,
    card_last_four:         response.card?.last_four_digits ?? null,
    card_brand:             response.payment_method_id ?? null,
    card_holder_name:       response.card?.cardholder?.name ?? null,
    // Desafio do emissor: quando existe, o pagamento NÃO está resolvido — o
    // cliente precisa autenticar no banco dele e só depois o status muda.
    // Devolver null quando não há é o caso comum (crédito, e débito que o
    // emissor liberou sem desafio).
    three_ds:               response.three_ds_info?.external_resource_url
      ? {
          url:  response.three_ds_info.external_resource_url,
          creq: response.three_ds_info.creq || null,
        }
      : null,
    // Quem recebeu de fato. Com split é a conta do operador; sem split, a da
    // plataforma. É o que permite conferir se o split saiu como esperado.
    collector_id:           response.collector_id == null ? null : String(response.collector_id),
    raw:                    sanitizedPaymentResult(response),
  }
}

export async function getMpPaymentStatus(mpId, sellerAccessToken) {
  // Uma cobrança só existe para a conta que a criou. Consultar com o token
  // ERRADO devolve "não encontrado", e quem chama não distingue isso de "ainda
  // pendente" — o pagamento fica pendente para sempre.
  //
  // Foi exatamente o que aconteceu: PIX aprovado no Mercado Pago, reserva
  // parada em `awaiting_payment`. A conciliação usava o token do operador
  // sempre que a reserva tinha um operador conectado, mesmo quando a cobrança
  // tinha sido feita na conta da PLATAFORMA (sem split).
  //
  // Então tenta o token informado e, se ele não achar, tenta o da plataforma.
  // Duas contas, duas tentativas — e é barato: só acontece quando a primeira
  // falha. Nunca devolve palpite: sem resposta de nenhuma das duas, devolve
  // null e quem chamou deixa o pagamento como está.
  const tentativas = sellerAccessToken ? [sellerAccessToken, null] : [null]

  let ultimoErro = null
  for (const token of tentativas) {
    const client = paymentClientFor(token)
    if (!client) continue
    try {
      const r = await client.get({ id: mpId })
      if (r?.status) return r.status
    } catch (err) {
      ultimoErro = err
    }
  }
  if (ultimoErro) throw ultimoErro
  return null
}

// Auditoria: a cobrança COMPLETA no Mercado Pago, não só o status.
// `getMpPaymentStatus` devolve uma string — suficiente para decidir o fluxo,
// inútil para descobrir POR QUE uma cobrança foi recusada. Aqui vem o
// status_detail, o meio de pagamento, as parcelas e a comissão aplicada.
// Nada sensível: o MP nunca devolve número completo nem CVV.
export async function getMpPaymentAudit(mpId, sellerAccessToken) {
  const tentativas = sellerAccessToken ? [sellerAccessToken, null] : [null]
  let ultimoErro = null
  for (const token of tentativas) {
    const client = paymentClientFor(token)
    if (!client) continue
    try {
      const r = await client.get({ id: mpId })
      if (!r?.status) continue
      return {
        conta_consultada:    token ? 'operador' : 'plataforma',
        payment_id:          String(r.id),
        status:              r.status,
        status_detail:       r.status_detail,
        payment_method_id:   r.payment_method_id,
        payment_type_id:     r.payment_type_id,
        installments:        r.installments,
        transaction_amount:  r.transaction_amount,
        application_fee:     r.application_fee ?? null,
        external_reference:  r.external_reference,
        date_created:        r.date_created,
        date_approved:       r.date_approved,
        // E-mail do pagador só como domínio — o suficiente para comparar com a
        // conta recebedora sem despejar dado pessoal no relatório.
        payer_email_dominio: r.payer?.email ? String(r.payer.email).split('@')[1] : null,
        collector_id:        r.collector_id ?? null,
        payer_id:            r.payer?.id ?? null,
        card_last_four:      r.card?.last_four_digits ?? null,
        live_mode:           r.live_mode ?? null,
      }
    } catch (err) { ultimoErro = err }
  }
  if (ultimoErro) throw ultimoErro
  return null
}

// ── OAuth: autorização e troca de código ──────────────
export function buildOAuthAuthorizeUrl({ redirectUri, state }) {
  const params = new URLSearchParams({
    client_id:     OAUTH_CLIENT_ID,
    response_type: 'code',
    platform_id:   'mp',
    redirect_uri:  redirectUri,
    ...(state ? { state } : {}),
  })
  return `https://auth.mercadopago.com.br/authorization?${params.toString()}`
}

async function oauthToken(payload) {
  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Mercado Pago OAuth erro ${res.status}`)
  return data // { access_token, refresh_token, user_id, public_key, expires_in, live_mode, ... }
}

export function exchangeOAuthCode({ code, redirectUri }) {
  return oauthToken({
    client_id:     OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
  })
}

export function refreshOAuthToken({ refreshToken }) {
  return oauthToken({
    client_id:     OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  })
}

// Modo teste: gera um PIX fictício para desenvolvimento
function createFakePix({ amount, description, externalRef }) {
  const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${externalRef || 'test'}520400005303986540${String(amount.toFixed(2)).padStart(6,'0')}5802BR5906TURIVA6009JERICOACOA62290525TURIVA${Date.now()}6304ABCD`
  return {
    mp_id:      `TEST-${Date.now()}`,
    status:     'pending',
    pix_code:   fakeCode,
    qr_base64:  null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    test_mode:  true,
  }
}

export { testMode }
