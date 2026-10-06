const BASE = 'https://api.pagar.me/core/v5'

// Código febraban (3 dígitos) do banco. Preferimos a coluna `bank_code`; se ela
// não existir (ainda não há migration), caímos nos dígitos à ESQUERDA de
// `bank_name`, porque o seletor de bancos salva "260 - Nubank". Nunca os
// dígitos da AGÊNCIA — esse era o bug antigo (agência "1234" virava banco 123).
export function codigoDoBanco(user) {
  const doCampo = String(user?.bank_code || '').replace(/\D/g, '')
  if (doCampo.length === 3) return doCampo
  const m = String(user?.bank_name || '').match(/^\s*(\d{3})\b/)
  return m ? m[1] : ''
}

// Separa a conta em número e dígito verificador. "55555-0" → {num:'55555',
// dv:'0'}. Sem traço, o último dígito é o DV. O Pagar.me v5 quer os dois campos
// separados.
function separaConta(bruto) {
  const s = String(bruto || '').trim()
  if (s.includes('-')) {
    const [a, b] = s.split('-')
    return { num: a.replace(/\D/g, ''), dv: b.replace(/\D/g, '').slice(0, 2) }
  }
  const d = s.replace(/\D/g, '')
  return { num: d.slice(0, -1), dv: d.slice(-1) }
}

// ── register_information (KYC exigido pelo Pagar.me para validar o recebedor) ──
const soDigitos = (v) => String(v || '').replace(/\D/g, '')

// Data ISO "YYYY-MM-DD" → "MM/DD/YYYY" (formato do register_information no
// Pagar.me v5). PONTO A CONFIRMAR no sandbox: se o gateway recusar a data,
// basta trocar a ordem aqui (um lugar só) para "DD/MM/YYYY".
function dataPagarme(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : ''
}

// Telefone → { ddd, number, type }. Aceita {ddd,number} do formulário ou um
// campo cru tipo "+55 88 99999-9999".
function telefonePagarme(tel) {
  if (tel && typeof tel === 'object' && (tel.ddd || tel.number)) {
    const ddd = soDigitos(tel.ddd).slice(-3)
    const number = soDigitos(tel.number).slice(0, 11)
    return ddd && number ? { ddd, number, type: 'mobile' } : null
  }
  const d = soDigitos(tel).replace(/^55/, '')
  if (d.length < 10) return null
  return { ddd: d.slice(0, 2), number: d.slice(2), type: 'mobile' }
}

// Endereço no formato do Pagar.me v5 (street_number, complementary, zip_code…).
// O Pagar.me EXIGE complementary e reference_point no register_information
// (provado em produção: "The complementary/reference_point field is required").
// São opcionais no nosso formulário, então caem num placeholder quando vazios.
function enderecoPagarme(a = {}) {
  return {
    street:          String(a?.street || '').trim(),
    street_number:   String(a?.number || '').trim(),
    complementary:   String(a?.complement || '').trim() || 'N/A',
    neighborhood:    String(a?.neighborhood || '').trim(),
    city:            String(a?.city || '').trim(),
    state:           String(a?.state || '').trim().toUpperCase().slice(0, 2),
    zip_code:        soDigitos(a?.zip).slice(0, 8),
    reference_point: String(a?.reference || '').trim() || 'N/A',
  }
}
function enderecoCompleto(e) {
  return !!(e && e.street && e.street_number && e.neighborhood && e.city && e.state && e.zip_code)
}

// Monta o bloco de PESSOA FÍSICA do register_information — reaproveitado no PF e
// no sócio responsável do PJ. Acumula em `faltam` o que estiver ausente, para a
// mensagem acionável. `prefixo` distingue os campos do sócio ("sócio: …").
function pessoaFisicaInfo(src = {}, faltam, prefixo = '') {
  const doc       = soDigitos(src.document)
  const birthdate = dataPagarme(src.birthdate)
  const phone     = telefonePagarme(src.phone)
  const address   = enderecoPagarme(src.address)
  const income    = Math.round(Number(src.monthly_income) || 0)

  if (!src.name)                      faltam.push(`${prefixo}nome`)
  if (doc.length !== 11)              faltam.push(`${prefixo}CPF`)
  if (!birthdate)                     faltam.push(`${prefixo}data de nascimento`)
  if (!src.mother_name)              faltam.push(`${prefixo}nome da mãe`)
  if (!income)                        faltam.push(`${prefixo}faturamento mensal`)
  if (!src.professional_occupation)   faltam.push(`${prefixo}profissão`)
  if (!phone)                         faltam.push(`${prefixo}telefone`)
  if (!enderecoCompleto(address))     faltam.push(`${prefixo}endereço`)

  return {
    name:                    src.name,
    email:                   src.email || undefined,
    document:                doc,
    type:                    'individual',
    birthdate,
    monthly_income:          income,
    professional_occupation: src.professional_occupation || undefined,
    mother_name:             src.mother_name || undefined,
    phone_numbers:           phone ? [phone] : [],
    address,
  }
}

// Cria um recebedor no Pagar.me (o destino da fatia do operador no split).
// Devolve o id (re_xxx) que entra na regra de split de cada cobrança.
//
// Fail-closed e SEM inventar dado: sem documento ou sem conta bancária
// completa, recusa com mensagem acionável em vez de mandar um recebedor pela
// metade. O Pagar.me EXIGE a conta bancária (`default_bank_account`) — provado
// em produção: "The default_bank_account field is required." A chave PIX
// sozinha não basta; ela entra como método extra quando existe.
export async function createRecipient(user, apiKey, env = 'sandbox') {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada em Configurações → Pagamentos')

  const doc = String(user.document_number || '').replace(/\D/g, '')
  if (!doc) {
    throw new Error('Cadastre seu CPF ou CNPJ no perfil antes de ativar o recebimento automático')
  }
  const isCompany = user.document_type === 'cnpj' || doc.length === 14

  const bankCode = codigoDoBanco(user)
  const agencia  = String(user.bank_agency || '').replace(/\D/g, '')
  const conta    = separaConta(user.bank_account_number)
  const contaOk  = bankCode.length === 3 && agencia.length >= 1 && conta.num.length >= 1 && conta.dv.length >= 1

  if (!contaOk) {
    throw new Error('Cadastre banco (na lista), agência e conta com dígito em Dados Bancários para ativar o recebimento')
  }

  const temPix = !!(user.pix_key && user.pix_key_type)

  // KYC completo (register_information). Quando presente, o Pagar.me consegue
  // VALIDAR o recebedor sem o fluxo externo. Ausente (coluna não migrada ou
  // operador ainda não preencheu) → mantém o cadastro mínimo de antes, que nasce
  // em análise e se resolve pelo link de verificação.
  const kyc = (user.recipient_kyc && typeof user.recipient_kyc === 'object') ? user.recipient_kyc : null
  let register_information = null
  if (kyc) {
    const faltam = []
    if (isCompany) {
      const addr    = enderecoPagarme(kyc.address)
      const phone   = telefonePagarme(kyc.phone)
      const founding = dataPagarme(kyc.founding_date)
      const revenue = Math.round(Number(kyc.annual_revenue) || 0)
      if (!kyc.company_name)          faltam.push('razão social')
      if (!kyc.trading_name)          faltam.push('nome fantasia')
      if (!revenue)                   faltam.push('faturamento anual')
      if (!founding)                  faltam.push('data de fundação')
      if (!phone)                     faltam.push('telefone da empresa')
      if (!enderecoCompleto(addr))    faltam.push('endereço da empresa')
      const partner = pessoaFisicaInfo(kyc.partner || {}, faltam, 'sócio: ')
      register_information = {
        type:           'corporation',
        document:        doc,
        company_name:    kyc.company_name,
        trading_name:    kyc.trading_name,
        annual_revenue:  revenue,
        founding_date:   founding,
        email:           user.email || undefined,
        phone_numbers:   phone ? [phone] : [],
        address:         addr,
        managing_partners: [{ ...partner, self_declared_legal_representative: true }],
      }
    } else {
      register_information = pessoaFisicaInfo({
        name:                    user.full_name,
        email:                   user.email,
        document:                doc,
        birthdate:               kyc.birthdate || user.birth_date,
        mother_name:             kyc.mother_name,
        monthly_income:          kyc.monthly_income,
        professional_occupation: kyc.professional_occupation,
        phone:                   kyc.phone,
        address:                 kyc.address,
      }, faltam)
    }
    if (faltam.length) {
      throw new Error(`Complete no perfil para validar o recebedor: ${faltam.join(', ')}.`)
    }
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64')

  // Com register_information (KYC completo), o Pagar.me v5 REJEITA os campos de
  // topo name/type/email/document ("… cannot be populated when the
  // register_information field is populated") — eles já vão dentro do KYC. Sem
  // KYC, mandamos o cadastro mínimo legado (name/email/document/type).
  const body = {
    document_type: isCompany ? 'cnpj' : 'cpf',
    // Referência externa = id do operador. Deixa reconciliar recebedor↔usuário
    // depois sem ter de casar nome ou documento.
    ...(user.id ? { code: String(user.id) } : {}),
    ...(register_information ? {} : {
      name:     isCompany && kyc?.company_name ? kyc.company_name : user.full_name,
      email:    user.email,
      document: doc,
      type:     isCompany ? 'company' : 'individual',
    }),
    default_bank_account: {
      holder_name:        user.full_name,
      holder_type:        isCompany ? 'company' : 'individual',
      holder_document:    String(user.bank_document || doc).replace(/\D/g, ''),
      bank:               bankCode,
      branch_number:      agencia,
      account_number:     conta.num,
      account_check_digit: conta.dv,
      type:               user.bank_account_type === 'poupanca' ? 'savings' : 'checking',
    },
    // PIX é método EXTRA quando existe — não substitui a conta bancária.
    ...(temPix ? { pix_key: { type: user.pix_key_type, key: String(user.pix_key).trim() } } : {}),
    // KYC completo quando o operador preencheu — é o que permite validar sem KYC externo.
    ...(register_information ? { register_information } : {}),
    // Antecipação automática LIGADA já no cadastro: 100% por volume. Assim o
    // operador recebe sua parte antecipada sem precisar mexer no painel.
    automatic_anticipation_settings: {
      enabled:           true,
      type:              'full',      // por volume (não D+X)
      volume_percentage: '100',
      delay:             null,
    },
  }

  const postRecebedor = async (payload) => {
    const r = await fetch(`${BASE}/recipients`, {
      method:  'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const d = await r.json().catch(() => ({}))
    return { r, d }
  }

  let { r: res, d: data } = await postRecebedor(body)

  // A antecipação depende do contrato da conta master. Se ela for recusada,
  // recria o recebedor SEM antecipação (não vale perder o split por causa disso).
  const mencionaAntecipacao = (d) => /anticipat|antecipa/i.test(JSON.stringify(d || {}))
  if (!res.ok && mencionaAntecipacao(data)) {
    console.warn('[pagarme] antecipação recusada pela conta — recriando recebedor sem antecipação automática')
    const { automatic_anticipation_settings, ...semAntecip } = body // eslint-disable-line no-unused-vars
    ;({ r: res, d: data } = await postRecebedor(semAntecip))
  }

  if (!res.ok) {
    // A mensagem do Pagar.me é sobre os DADOS do operador ("document is
    // invalid") — acionável e não é segredo, então pode ir para ele. O corpo
    // completo, que pode trazer mais dado, fica no log.
    console.error('[pagarme] criar recebedor falhou:', res.status, JSON.stringify(data).slice(0, 500))
    // "The request is invalid." vem SEM detalhe; os erros por campo ficam em
    // `data.errors` ({ "campo": ["motivo"] }). Traduz o campo e junta à mensagem
    // para o operador saber exatamente o que corrigir.
    const detalhes = data?.errors && typeof data.errors === 'object'
      ? Object.entries(data.errors)
          .flatMap(([campo, msgs]) => (Array.isArray(msgs) ? msgs : [msgs]).map((m) => `${rotuloCampo(campo)}: ${m}`))
          .join(' · ')
      : ''
    const base = data.message || `Pagar.me recusou o cadastro do recebedor (${res.status})`
    throw new Error(detalhes ? `${base} — ${detalhes}` : base)
  }

  return data.id
}

// Traduz o caminho do campo que o Pagar.me devolve em `errors` para um rótulo
// que o operador reconhece no formulário do perfil.
function rotuloCampo(campo) {
  const c = String(campo || '')
  const mapa = {
    'default_bank_account.account_number': 'Conta bancária (número)',
    'default_bank_account.account_check_digit': 'Conta bancária (dígito)',
    'default_bank_account.branch_number': 'Agência',
    'default_bank_account.bank': 'Banco',
    'default_bank_account.holder_document': 'CPF/CNPJ do titular da conta',
    'default_bank_account.holder_name': 'Nome do titular da conta',
    'default_bank_account': 'Conta bancária',
    'document': 'CPF/CNPJ',
    'register_information.birthdate': 'Data de nascimento',
    'register_information.monthly_income': 'Faturamento mensal',
    'register_information.professional_occupation': 'Profissão',
    'register_information.mother_name': 'Nome da mãe',
    'register_information.phone_numbers': 'Telefone',
    'register_information.address': 'Endereço',
    'register_information.annual_revenue': 'Faturamento anual',
    'register_information.founding_date': 'Data de fundação',
  }
  if (mapa[c]) return mapa[c]
  // Normaliza chaves tipo "register_information.address.zip_code".
  for (const [k, v] of Object.entries(mapa)) if (c.startsWith(k + '.') || c.startsWith(k)) return v
  return c
}

// Consulta o status ATUAL de um recebedor. Só leitura. Devolve apenas o que a
// tela precisa para dizer se a conta está apta — nunca conta bancária ou chave
// PIX. O `status` do Pagar.me é a fonte da verdade: um recebedor recém-criado
// nasce 'registration' (em análise de KYC) e só recebe com split quando vira
// 'active'.
export async function getRecipient(apiKey, recipientId) {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada')
  if (!recipientId) throw new Error('recipientId ausente')
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const r = await fetch(`${BASE}/recipients/${encodeURIComponent(recipientId)}`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!r.ok) {
    const corpo = await r.text().catch(() => '')
    console.error('[pagarme] consultar recebedor falhou:', r.status, corpo.slice(0, 200))
    const e = new Error(`Pagar.me respondeu ${r.status} ao consultar o recebedor`)
    e.status = r.status >= 400 && r.status < 500 ? 422 : 502
    throw e
  }
  const x = await r.json().catch(() => ({}))
  // Só o essencial. `status` e, quando houver, o detalhe do KYC — nada de dado
  // bancário numa resposta que chega até a tela do operador.
  return {
    id:         x.id,
    status:     x.status || null,
    kyc_status: x?.kyc_details?.status || null,
  }
}

// Gera o link de verificação (KYC) de um recebedor. É por ele que o operador
// resolve pendências — ele não tem acesso ao painel do Pagar.me, só a
// plataforma tem. Devolve a URL (e o QR, quando vier) para a plataforma repassar
// ao operador.
export async function kycLink(apiKey, recipientId) {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada')
  if (!recipientId) throw new Error('recipientId ausente')
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const r = await fetch(`${BASE}/recipients/${encodeURIComponent(recipientId)}/kyc_link`, {
    method:  'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body:    '{}',
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data?.url) {
    console.error('[pagarme] kyc_link falhou:', r.status, JSON.stringify(data).slice(0, 200))
    const e = new Error('Não foi possível gerar o link de verificação agora. Tente de novo em instantes.')
    e.status = r.status >= 400 && r.status < 500 ? 422 : 502
    throw e
  }
  return { url: data.url, qrcode: data.base64_qrcode || null, expires_at: data.expires_at || null }
}

// Lista os recebedores da conta. Só leitura, usada pelo admin para descobrir o
// `re_...` da própria plataforma sem ter de caçá-lo no painel do gateway —
// que foi exatamente onde a integração do split emperrou.
export async function listarRecebedores(apiKey, pagina = 1) {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada em Configurações → Pagamentos')
  const auth = Buffer.from(`${apiKey}:`).toString('base64')
  const r = await fetch(`${BASE}/recipients?page=${Number(pagina) || 1}&size=30`, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!r.ok) {
    const corpo = await r.text().catch(() => '')
    const e = new Error(`Pagar.me respondeu ${r.status} ao listar recebedores`)
    e.status = r.status >= 400 && r.status < 500 ? 422 : 502
    // O corpo pode trazer dado do recebedor — fica no log, não na resposta.
    console.error('[pagarme] listar recebedores falhou:', r.status, corpo.slice(0, 300))
    throw e
  }
  const json = await r.json().catch(() => ({}))
  // Devolve só o que serve para escolher: id, nome, documento mascarado e
  // status. Nada de conta bancária ou chave PIX numa tela de configuração.
  return (json?.data || []).map((x) => ({
    id:       x.id,
    nome:     x.name,
    status:   x.status,
    tipo:     x.type,
    documento: String(x.document || '').replace(/^(\d{3})\d+(\d{2})$/, '$1***$2'),
  }))
}
