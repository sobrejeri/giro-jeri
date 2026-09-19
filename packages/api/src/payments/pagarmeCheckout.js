// ── payments/pagarmeCheckout.js ──────────────────────────────────────────────
// Cobrança de CARTÃO no Pagar.me, pelo checkout hospedado deles.
//
// POR QUE EXISTE. Nove hipóteses foram testadas no Mercado Pago ao longo de
// dois dias — Device ID, additional_info, 3DS no crédito, habilitação da conta,
// identidade e CPF do pagador, autopagamento, Checkout Pro, inverter quem cobra
// (que nem existe na API deles), e cobrar direto na conta da plataforma sem
// split. Todas descartadas por teste. A recusa por risco persistiu inclusive na
// última combinação, com a cobrança nascendo na conta da plataforma:
// collector_id 1068684688, cc_rejected_high_risk. O PIX aprova normalmente na
// MESMA conta — e por isso fica onde está.
//
// POR QUE O CHECKOUT HOSPEDADO, e não o formulário dentro do site. Duas razões:
//
//   1. Reaproveita inteiro o fluxo de redirecionamento que já existe e foi
//      exercitado em produção — link de retorno, tela de processamento,
//      resolução por referência quando o webhook não chega. Trazer o formulário
//      para dentro exigiria refazer tokenização, antifraude e 3DS do zero, para
//      só então descobrir se o Pagar.me aprova.
//   2. Não passamos perto de dado de cartão. Nada de PCI.
//
// Se o Pagar.me aprovar, aí sim vale discutir trazer o formulário para dentro,
// com a resposta na mão.
//
// ─────────────────────────────────────────────────────────────────────────────
// VALORES EM CENTAVOS. Toda a API do Pagar.me trabalha em centavos inteiros,
// e o resto do sistema em reais decimais. Uma conversão esquecida aqui cobra
// cem vezes mais — ou cem vezes menos. É a coisa mais perigosa deste arquivo.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.pagar.me/core/v5'

// Reais → centavos, com a mesma trava do adaptador do Mercado Pago: valor que
// não é número positivo não vira cobrança. Acréscimo percentual produz lixo de
// ponto flutuante (5 * 1.15 = 5.749999999999999), e arredondar depois de
// multiplicar por 100 é o que evita cobrar R$ 574,99 em vez de R$ 5,75.
export function emCentavos(valor, campo = 'amount') {
  const n = Math.round(Number(valor) * 100)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Valor inválido para ${campo}: ${valor}`)
  }
  return n
}

// Documento sem pontuação, e só o que é CPF ou CNPJ de verdade. O Pagar.me
// recusa o pedido inteiro por documento malformado, com mensagem que não diz
// ao cliente o que corrigir — mesma lição do "Invalid user identification
// number" que o Mercado Pago devolvia.
function documentoDoCliente(doc) {
  const d = String(doc || '').replace(/\D/g, '')
  if (d.length !== 11 && d.length !== 14) return null
  return { document: d, document_type: d.length === 14 ? 'CNPJ' : 'CPF',
    type: d.length === 14 ? 'company' : 'individual' }
}

// Telefone no formato do Pagar.me. Ausente ou implausível é OMITIDO: mandar
// lixo é pior que não mandar, porque o antifraude lê como dado inconsistente.
function telefonesDoCliente(phone) {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length < 10 || d.length > 11) return null
  return { mobile_phone: { country_code: '55', area_code: d.slice(0, 2), number: d.slice(2) } }
}

async function chamar(caminho, apiKey, init = {}) {
  if (!apiKey) {
    const e = new Error('Pagar.me não configurado: falta a API Key em Configurações → Pagamentos.')
    e.status = 503
    throw e
  }
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const r = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) {
    // O Pagar.me detalha o que recusou em `errors`. Sem isso a mensagem vira
    // "erro 422" e ninguém sabe qual campo — foi assim que perdemos tempo com
    // o Mercado Pago até ele nomear `disbursements`.
    const detalhe = corpo?.errors
      ? Object.entries(corpo.errors).map(([campo, msgs]) => `${campo}: ${[].concat(msgs).join(', ')}`).join(' · ')
      : ''
    const e = new Error([corpo?.message, detalhe].filter(Boolean).join(' — ') || `Pagar.me respondeu ${r.status}`)
    // 4xx é problema do que enviamos ou do cadastro; 5xx é deles.
    e.status = r.status >= 400 && r.status < 500 ? 422 : 502
    e.pagarme = corpo
    throw e
  }
  return corpo
}

// ── Cria o pedido e devolve o link do checkout ───────────────────────────────
//
// `code` é o nosso identificador dentro do Pagar.me — usamos o id da RESERVA,
// pelo mesmo motivo do `external_reference` no Mercado Pago: quando o webhook
// chega com um id de cobrança que nunca vimos, é por ele que descobrimos a qual
// reserva pertence. Sem isso, todo pagamento ficaria pendente esperando um
// vínculo que não existe.
export async function criarCheckoutCartao({
  apiKey, amount, description, bookingId, retornoUrl,
  clienteNome, clienteEmail, clienteDoc, clienteTelefone,
  maxParcelas = 12, item,
  // Array pronto, montado por pagarmeSplit.montarSplit(). Ausente = pedido sem
  // divisão (o valor inteiro fica na conta da chave). Quem decide se isso é
  // aceitável é o chamador — aqui só se envia o que chegou.
  split,
}) {
  if (!clienteEmail) {
    const e = new Error('Sua conta está sem e-mail cadastrado, e o gateway exige o e-mail do pagador. Adicione um e-mail no seu perfil e tente de novo.')
    e.status = 422
    throw e
  }
  const centavos = emCentavos(amount)
  const doc = documentoDoCliente(clienteDoc)
  const tel = telefonesDoCliente(clienteTelefone)

  // Parcelas: o Pagar.me quer a lista explícita, com o total de cada opção.
  // Sem juros, todas somam o mesmo — quem define juros é o contrato deles.
  const parcelas = Array.from({ length: Math.max(1, Math.min(Number(maxParcelas) || 1, 12)) },
    (_, i) => ({ number: i + 1, total: centavos }))

  const corpo = {
    code: String(bookingId),
    items: [{
      amount:      centavos,
      description: String(item?.title || description || 'Reserva').slice(0, 255),
      quantity:    1,
      code:        String(item?.id || bookingId),
    }],
    customer: {
      name:  String(clienteNome || '').trim() || 'Cliente',
      email: clienteEmail,
      ...(doc ? doc : {}),
      ...(tel ? { phones: tel } : {}),
    },
    payments: [{
      payment_method: 'checkout',
      // O split vive DENTRO do payment, não no nível do pedido. A soma dos
      // percentuais tem de fechar 100 — o gateway recusa o contrário.
      ...(Array.isArray(split) && split.length ? { split } : {}),
      checkout: {
        expires_in:               30,          // minutos
        default_payment_method:   'credit_card',
        accepted_payment_methods: ['credit_card', 'debit_card'],
        success_url:              retornoUrl,
        customer_editable:        false,
        skip_checkout_success_page: true,
        credit_card: { installments: parcelas },
      },
    }],
  }

  const pedido = await chamar('/orders', apiKey, { method: 'POST', body: JSON.stringify(corpo) })
  const link = pedido?.checkouts?.[0]?.payment_url

  if (!link) {
    // Pedido criado sem link é pior que erro: o cliente fica sem para onde ir e
    // nós com um pedido pendurado. Falha alto para virar caso de suporte, não
    // uma tela em branco.
    const e = new Error('O Pagar.me criou o pedido mas não devolveu o link de pagamento.')
    e.status = 502
    e.pagarme = pedido
    throw e
  }

  return { pedido_id: String(pedido.id), checkout_id: pedido.checkouts[0]?.id || null, redirect_url: link }
}

// ── Cobrança de cartão INLINE (tokenizado no navegador) ──────────────────────
//
// Alternativa ao checkout hospedado, para contas SEM o produto "checkout"
// habilitado (o erro "The checkout payment method is not available for this
// account"). O cartão é tokenizado no NAVEGADOR com a chave pública, e só o
// TOKEN chega aqui — o número do cartão nunca passa pelo nosso servidor (PCI
// mínimo, igual ao que o Brick do Mercado Pago faz).
//
// Cobrança SÍNCRONA (auth_and_capture): o pedido volta pago ou recusado na
// hora, então o chamador decide o desfecho no mesmo request — sem redirect,
// sem esperar webhook. O split, quando existe, é o mesmo array do checkout.
export async function criarCobrancaCartao({
  apiKey, amount, description, bookingId,
  clienteNome, clienteEmail, clienteDoc, clienteTelefone,
  cardToken, parcelas = 1, item, split,
}) {
  if (!clienteEmail) {
    const e = new Error('Sua conta está sem e-mail cadastrado, e o gateway exige o e-mail do pagador. Adicione um e-mail no seu perfil e tente de novo.')
    e.status = 422
    throw e
  }
  if (!cardToken) {
    const e = new Error('Token do cartão ausente — recarregue a tela e tente de novo.')
    e.status = 422
    throw e
  }
  const centavos   = emCentavos(amount)
  const doc        = documentoDoCliente(clienteDoc)
  const tel        = telefonesDoCliente(clienteTelefone)
  const nParcelas  = Math.max(1, Math.min(Number(parcelas) || 1, 12))

  const corpo = {
    code: String(bookingId),
    items: [{
      amount:      centavos,
      description: String(item?.title || description || 'Reserva').slice(0, 255),
      quantity:    1,
      code:        String(item?.id || bookingId),
    }],
    customer: {
      name:  String(clienteNome || '').trim() || 'Cliente',
      email: clienteEmail,
      ...(doc ? doc : {}),
      ...(tel ? { phones: tel } : {}),
    },
    payments: [{
      payment_method: 'credit_card',
      // Mesmo split do checkout hospedado; ausente = valor inteiro na conta da
      // chave (repasse manual, decidido pelo chamador).
      ...(Array.isArray(split) && split.length ? { split } : {}),
      credit_card: {
        installments:         nParcelas,
        statement_descriptor: 'TURIVA',            // máx. 13 caracteres na fatura
        operation_type:       'auth_and_capture',
        card_token:           cardToken,
      },
    }],
  }

  const pedido = await chamar('/orders', apiKey, { method: 'POST', body: JSON.stringify(corpo) })
  const charge = pedido?.charges?.[0] || {}
  const tx     = charge.last_transaction || {}
  const card   = tx.card || {}
  return {
    pedido_id: String(pedido.id),
    estado:    estadoDoPedido(pedido),             // approved | failed | pending
    parcelas:  nParcelas,
    ultimos4:  card.last_four_digits || null,
    bandeira:  card.brand || null,
    // Motivo legível da recusa, quando houver — vai para o log e o status_detail.
    motivo:    tx.acquirer_message || tx.gateway_response?.errors?.[0]?.message || charge.status || null,
    raw:       pedido,
  }
}

// ── Consulta ─────────────────────────────────────────────────────────────────
// Nunca lança: é usada no webhook e no polling, e ali "não consegui perguntar"
// não pode virar HTTP 500 (o gateway reentrega em loop) nem decisão errada.
export async function consultarPedido(apiKey, pedidoId) {
  try {
    return await chamar(`/orders/${pedidoId}`, apiKey)
  } catch (err) {
    console.error('[pagarme] consulta do pedido %s falhou: %s', pedidoId, err?.message)
    return null
  }
}

// Acha o pedido pelo NOSSO código (o id da reserva). É o equivalente da busca
// por external_reference no Mercado Pago: o caminho de descobrir uma aprovação
// quando o webhook não chegou.
export async function buscarPedidoPorCodigo(apiKey, codigo) {
  try {
    const r = await chamar(`/orders?code=${encodeURIComponent(String(codigo))}&size=10`, apiKey)
    const achados = r?.data || []
    if (!achados.length) return null
    // Pago tem prioridade sobre tentativa anterior recusada: o cliente pode ter
    // errado o cartão e acertado na segunda, e a reserva vale pela que passou.
    return achados.find((p) => p.status === 'paid') || achados[0]
  } catch (err) {
    console.error('[pagarme] busca por code=%s falhou: %s', codigo, err?.message)
    return null
  }
}

// ── Tradução do estado ───────────────────────────────────────────────────────
// O resto do sistema fala 'approved' / 'failed' / 'pending'. Traduzir num lugar
// só evita que cada caminho invente a sua interpretação — foi o que fez a lista
// e o detalhe da reserva discordarem sobre o mesmo pagamento.
export function estadoDoPedido(pedido) {
  switch (pedido?.status) {
    case 'paid':      return 'approved'
    case 'failed':
    case 'canceled':  return 'failed'
    default:          return 'pending'   // pending, processing e o que vier novo
  }
}
