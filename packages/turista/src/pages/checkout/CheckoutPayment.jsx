import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ShieldCheck, AlertCircle, QrCode, CreditCard, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

// ─── helpers ────────────────────────────────────────────────
function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

// ─── getMercadoPago ──────────────────────────────────────────
// Instancia o SDK somente quando o script já carregou. Com `publicKey` (chave
// da cooperativa atribuída), tokeniza o cartão NA conta dela para o split;
// sem ela, usa a chave da plataforma (VITE_MP_PUBLIC_KEY, sem split).
function getMercadoPago(publicKey) {
  if (typeof window.MercadoPago === 'undefined') return null
  const key = publicKey || import.meta.env.VITE_MP_PUBLIC_KEY
  if (!key) return null
  try {
    return new window.MercadoPago(key, { locale: 'pt-BR' })
  } catch {
    return null
  }
}

// E-mail do usuário logado (para pré-preencher o pagador no Brick).
function getUserEmail() {
  try { return JSON.parse(localStorage.getItem('giro_user') || 'null')?.email || undefined }
  catch { return undefined }
}

// ─── PaymentBrick ────────────────────────────────────────────
// Brick unificado do Mercado Pago: cartão (crédito/débito) E PIX na mesma tela
// embutida. Tokeniza com segurança (PCI) e devolve os dados no onSubmit; a API
// cria o pagamento (com split quando a cooperativa está conectada).
function PaymentBrick({ amount, publicKey, onCard, onPix }) {
  const { t }    = useTranslation()
  const brickRef = useRef(null)
  const [phase,       setPhase]       = useState('loading') // loading | ready | error
  const [rejectedMsg, setRejectedMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    const containerId = 'paymentBrick_container'

    async function mount() {
      const mp = getMercadoPago(publicKey)
      if (!mp) { setPhase('error'); return }
      let bricks
      try { bricks = mp.bricks() } catch { setPhase('error'); return }

      const email = getUserEmail()

      try {
        brickRef.current = await bricks.create('payment', containerId, {
          initialization: {
  amount: Number(amount) || 0,
  payer: {
    ...(email ? { email } : {}),
    entityType: 'individual',
  },
},
          customization: {
            visual:         { style: { theme: 'default' } },
            paymentMethods: {
              creditCard:     'all',
              debitCard:      'all',
              bankTransfer:   ['pix'],   // habilita PIX no mesmo Brick
              maxInstallments: 12,
            },
          },
          callbacks: {
            onReady: () => { if (!cancelled) setPhase('ready') },
            onError: (err) => {
              console.error('[brick] erro', err)
              if (!cancelled) setPhase((p) => (p === 'loading' ? 'error' : p))
            },
            onSubmit: async ({ selectedPaymentMethod, formData }) => {
              setRejectedMsg('')
              try {
                // PIX (transferência bancária) → cria o pagamento e abre o QR.
                if (selectedPaymentMethod === 'bank_transfer' || formData?.payment_method_id === 'pix') {
                  await onPix(formData?.payer?.identification?.number)
                  return Promise.resolve()
                }

                // Cartão (crédito/débito) → método inferido do payment_method_id.
                const pmId   = formData?.payment_method_id || ''
                const method = /^deb/i.test(pmId) ? 'debit_card' : 'credit_card'
                const result = await onCard({
                  payment_method:    method,
                  card_token:        formData?.token,
                  payment_method_id: pmId,
                  issuer_id:         formData?.issuer_id ? String(formData.issuer_id) : undefined,
                  installments:      Number(formData?.installments) || 1,
                  payer_doc:         formData?.payer?.identification?.number,
                })
                if (result?.status === 'rejected') {
                  const msg = result.message_key ? t(result.message_key) : t('payment.rejected.generic')
                  setRejectedMsg(msg)
                  return Promise.reject(new Error(msg))
                }
                // approved / in_process → o componente pai navega de tela.
                return Promise.resolve()
              } catch (err) {
                setRejectedMsg(err?.message || t('payment.rejected.generic'))
                return Promise.reject(err)
              }
            },
          },
        })
      } catch (e) {
        console.error('[brick] create falhou', e)
        if (!cancelled) setPhase('error')
      }
    }

    mount()
    return () => {
      cancelled = true
      try { brickRef.current?.unmount?.() } catch { /* ignore */ }
    }
  }, [amount, publicKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'error') {
    return (
      <div className="px-4 py-4 text-[13px] text-red-600 bg-red-50 rounded-2xl border border-red-100">
        Não foi possível carregar o pagamento. Atualize a página e tente novamente.
      </div>
    )
  }

  return (
    <div className="pb-1">
      {rejectedMsg && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-3 mb-3">
          <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-700">{t('payment.card.declined')}</p>
            <p className="text-[12px] text-red-600 mt-0.5">{rejectedMsg}</p>
          </div>
        </div>
      )}
      <div id="paymentBrick_container" />
      {phase === 'loading' && (
        <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
          <span className="text-[13px]">Carregando pagamento seguro…</span>
        </div>
      )}
    </div>
  )
}

// ─── Pagar.me: tokenização do cartão ────────────────────────
// O número do cartão vai direto do navegador para o Pagar.me (com a chave
// pública) e volta como um token. Nada de dado sensível passa pelo nosso
// servidor — só o token é enviado à nossa API.
async function tokenizePagarmeCard(publicKey, card) {
  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number:      card.number.replace(/\D/g, ''),
        holder_name: card.holder.trim(),
        exp_month:   Number(card.expMonth),
        exp_year:    Number(card.expYear),
        cvv:         card.cvv,
      },
    }),
  })
  let data = null
  try { data = await res.json() } catch { /* corpo vazio */ }
  if (!res.ok || !data?.id) {
    throw new Error(data?.message || 'Não foi possível validar os dados do cartão.')
  }
  return data.id
}

const onlyDigits = (s) => String(s || '').replace(/\D/g, '')

// ─── PagarmeCheckout ────────────────────────────────────────
// Checkout transparente do Pagar.me: PIX (server-side) e cartão (tokenizado no
// navegador). Usado quando o gateway ativo é 'pagarme'.
function PagarmeCheckout({ amount, publicKey, onPix, onCard }) {
  const { t } = useTranslation()
  const [tab,   setTab]   = useState('pix')   // 'pix' | 'card'
  const [cpf,   setCpf]   = useState('')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  const [number, setNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [exp,    setExp]    = useState('')    // MM/AA
  const [cvv,    setCvv]    = useState('')
  const [inst,   setInst]   = useState(1)

  const cpfDigits = onlyDigits(cpf)
  const docValid  = cpfDigits.length === 11 || cpfDigits.length === 14

  function fmtCpf(v) {
    const d = onlyDigits(v).slice(0, 14)
    if (d.length <= 11) {
      return d
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    }
    return d
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
  }
  const fmtCard = (v) => onlyDigits(v).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ').trim()
  const fmtExp  = (v) => {
    const d = onlyDigits(v).slice(0, 4)
    return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
  }

  async function handlePixSubmit() {
    setError('')
    if (!docValid) { setError('Informe um CPF válido para gerar o PIX.'); return }
    setBusy(true)
    try {
      await onPix(cpfDigits)   // navega para a tela de acompanhamento
    } catch (err) {
      setError(err?.message || t('payment.errorGeneric'))
      setBusy(false)
    }
  }

  async function handleCardSubmit() {
    setError('')
    const numDigits = onlyDigits(number)
    const [mm, aa]  = exp.split('/')
    if (!docValid)             { setError('Informe um CPF válido.'); return }
    if (numDigits.length < 13) { setError('Número do cartão inválido.'); return }
    if (!holder.trim())        { setError('Informe o nome impresso no cartão.'); return }
    if (!mm || !aa || Number(mm) < 1 || Number(mm) > 12) { setError('Validade inválida (MM/AA).'); return }
    if (onlyDigits(cvv).length < 3) { setError('CVV inválido.'); return }
    if (!publicKey)            { setError('Pagamento com cartão indisponível no momento. Use o PIX.'); return }

    setBusy(true)
    try {
      const token = await tokenizePagarmeCard(publicKey, {
        number:   numDigits,
        holder,
        expMonth: mm,
        expYear:  aa.length === 2 ? `20${aa}` : aa,
        cvv:      onlyDigits(cvv),
      })
      const result = await onCard({
        payment_method: 'credit_card',
        card_token:     token,
        installments:   Number(inst) || 1,
        payer_doc:      cpfDigits,
      })
      if (result?.status === 'rejected') {
        setError(result.message_key ? t(result.message_key) : t('payment.rejected.generic'))
        setBusy(false)
      }
      // approved / in_process → o componente pai navega de tela.
    } catch (err) {
      setError(err?.message || t('payment.rejected.generic'))
      setBusy(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-brand'
  const instOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="space-y-4">
      {/* Abas */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setTab('pix'); setError('') }}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold border transition-colors ${tab === 'pix' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          <QrCode size={15} /> PIX
        </button>
        <button
          type="button"
          onClick={() => { setTab('card'); setError('') }}
          className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold border transition-colors ${tab === 'card' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'}`}
        >
          <CreditCard size={15} /> Cartão
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-3">
          <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-600">{error}</p>
        </div>
      )}

      {/* CPF do pagador (comum aos dois métodos) */}
      <div>
        <label className="block text-[12px] font-medium text-gray-500 mb-1">CPF do pagador</label>
        <input
          inputMode="numeric"
          value={cpf}
          onChange={(e) => setCpf(fmtCpf(e.target.value))}
          placeholder="000.000.000-00"
          className={inputCls}
        />
      </div>

      {tab === 'pix' ? (
        <div className="space-y-3">
          <p className="text-[12px] text-gray-500 leading-relaxed">
            Você recebe o QR Code e o código copia-e-cola na próxima tela. A reserva é confirmada
            na hora, assim que o pagamento cair.
          </p>
          <button
            type="button"
            onClick={handlePixSubmit}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <QrCode size={17} />}
            {busy ? 'Gerando PIX…' : `Gerar PIX · R$ ${fmt(amount)}`}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-gray-500 mb-1">Número do cartão</label>
            <input inputMode="numeric" value={number} onChange={(e) => setNumber(fmtCard(e.target.value))} placeholder="0000 0000 0000 0000" className={inputCls} />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-500 mb-1">Nome impresso no cartão</label>
            <input value={holder} onChange={(e) => setHolder(e.target.value.toUpperCase())} placeholder="COMO ESTÁ NO CARTÃO" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1">Validade</label>
              <input inputMode="numeric" value={exp} onChange={(e) => setExp(fmtExp(e.target.value))} placeholder="MM/AA" className={inputCls} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1">CVV</label>
              <input inputMode="numeric" value={cvv} onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))} placeholder="123" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-500 mb-1">Parcelas</label>
            <select value={inst} onChange={(e) => setInst(Number(e.target.value))} className={`${inputCls} bg-white`}>
              {instOptions.map((n) => (
                <option key={n} value={n}>{n}x de R$ {fmt(amount / n)}{n === 1 ? ' à vista' : ''}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleCardSubmit}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />}
            {busy ? 'Processando…' : `Pagar R$ ${fmt(amount)}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── CheckoutPayment (página principal) ─────────────────────
export default function CheckoutPayment() {
  const navigate   = useNavigate()
  const { state }  = useLocation()
  const { t }      = useTranslation()
  // Chave pública da cooperativa atribuída (split). Buscada para reservas já
  // existentes (pagamento pós-aceite). keyChecked evita montar o Brick antes.
  const [sellerKey,  setSellerKey]  = useState(null)
  const [keyChecked, setKeyChecked] = useState(() => !state?.existing_booking_id)
  // Gateway ativo + chave pública do Pagar.me (config pública do servidor).
  // null enquanto carrega. Decide qual checkout renderizar.
  const [payCfg, setPayCfg] = useState(null)

  useEffect(() => {
    const bid = state?.existing_booking_id
    if (!bid) { setKeyChecked(true); return }
    let active = true
    api.getCheckoutKey(bid)
      .then((r) => { if (active) setSellerKey(r?.public_key || null) })
      .catch(() => {})
      .finally(() => { if (active) setKeyChecked(true) })
    return () => { active = false }
  }, [state?.existing_booking_id])

  useEffect(() => {
    let active = true
    api.getPublicSettings()
      .then((s) => { if (active) setPayCfg({
        gateway:    s?.payment_gateway || 'mercado_pago',
        pagarmeKey: s?.payment_gateway_public_key || '',
      }) })
      .catch(() => { if (active) setPayCfg({ gateway: 'mercado_pago', pagarmeKey: '' }) })
    return () => { active = false }
  }, [])

  if (!state) { navigate(-1); return null }

  const {
    service_name, service_type, booking_mode,
    service_date, service_date_iso, service_time,
    people_count, total_price: rawPrice, region_id, service_id,
    vehicles = [], origin_text, destination_text, cover_image_url,
    existing_booking_id,
  } = state

  const total_price = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)
  const isPrivate   = booking_mode === 'private'
  const subtitleParts = [
    service_date,
    service_time,
    `${people_count} ${people_count === 1 ? 'pessoa' : 'pessoas'}`,
  ].filter(Boolean)

  // PIX: cria o pagamento e leva à tela de QR + acompanhamento. Recebe o
  // CPF/CNPJ do pagador já normalizado (Brick do MP ou form do Pagar.me).
  async function handlePix(payerDoc) {
    const result = await api.createPaymentIntent({
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles,
      origin_text, destination_text,
      total_price, payment_method: 'pix',
      service_name, cover_image_url,
      existing_booking_id: existing_booking_id || undefined,
      payer_doc: payerDoc || undefined,
    })
    if (!result) throw new Error(t('payment.errorGeneric'))

    navigate('/checkout/processando', {
      state: {
        ...state,
        payment_id:        result.payment_id,
        booking_id:        result.booking_id,
        booking_code:      result.booking_code,
        amount:            result.amount,
        pix_code:          result.pix_code,
        qr_base64:         result.qr_base64,
        expires_at:        result.expires_at,
        manual_mode:       result.manual_mode,
        pix_key_type:      result.pix_key_type,
        pix_key:           result.pix_key,
        bank_name:         result.bank_name,
        bank_agency:       result.bank_agency,
        bank_account:      result.bank_account,
        bank_account_type: result.bank_account_type,
        payment_method:    'pix',
      },
    })
  }

  // Cartão pelo Brick: cria o pagamento e roteia pelo status.
  async function handleCardPayment(cardFields) {
    const result = await api.createPaymentIntent({
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles,
      origin_text, destination_text,
      total_price, service_name, cover_image_url,
      existing_booking_id: existing_booking_id || undefined,
      ...cardFields,
    })

    if (!result) throw new Error(t('payment.errorGeneric'))

    if (result.status === 'approved') {
      navigate('/checkout/sucesso', {
        state: {
          ...state,
          booking_id:     result.booking_id,
          booking_code:   result.booking_code,
          amount:         result.amount,
          installments:   result.installments,
          card_last_four: result.card_last_four,
          card_brand:     result.card_brand,
          payment_method: cardFields.payment_method,
        },
      })
      return result
    }

    if (result.status === 'in_process') {
      navigate('/checkout/processando', {
        state: {
          ...state,
          payment_id:     result.payment_id,
          booking_id:     result.booking_id,
          booking_code:   result.booking_code,
          amount:         result.amount,
          payment_method: cardFields.payment_method,
        },
      })
      return result
    }

    // rejected → retorna para o Brick exibir a mensagem
    return result
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <header className="bg-white px-4 pt-12 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{t('payment.title')}</h1>
        </div>
      </header>

      <main className="px-4 pt-4 pb-10 space-y-3">
        {/* Resumo mini */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 mb-0.5">
              {service_type === 'tour' ? t('payment.summary.tour') : t('payment.summary.transfer')}
              {isPrivate ? ` · ${t('payment.summary.private')}` : ` · ${t('payment.summary.shared')}`}
            </p>
            <p className="text-[15px] font-bold text-gray-900 truncate">{service_name}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{subtitleParts.join(' · ')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-400">{t('payment.summary.total')}</p>
            <p className="text-[18px] font-bold text-brand">R$ {fmt(total_price)}</p>
          </div>
        </div>

        {/* Pagamento — Pagar.me (checkout próprio) ou Mercado Pago (Brick) */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-1">{t('payment.choose')}</p>
          <div className="px-3 pb-3 pt-1">
            {!payCfg ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
                <span className="text-[13px]">Preparando pagamento seguro…</span>
              </div>
            ) : payCfg.gateway === 'pagarme' ? (
              <PagarmeCheckout
                amount={total_price}
                publicKey={payCfg.pagarmeKey}
                onPix={handlePix}
                onCard={handleCardPayment}
              />
            ) : keyChecked ? (
              <PaymentBrick
                amount={total_price}
                publicKey={sellerKey}
                onCard={handleCardPayment}
                onPix={handlePix}
              />
            ) : (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
                <span className="text-[13px]">Preparando pagamento seguro…</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-green-50 rounded-2xl p-3.5 border border-green-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-green-700 leading-relaxed">{t('payment.secureNote')}</p>
          </div>
        </div>
      </main>
    </div>
  )
}
