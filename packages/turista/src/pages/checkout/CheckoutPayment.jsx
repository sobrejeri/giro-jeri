import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ShieldCheck, AlertCircle, BadgeCheck, CreditCard, Lock } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { buildNupayProfilePayload, getNupayProfileMissingFields } from '../../lib/nupayProfile'

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
                  await onPix(formData)
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

// ─── CheckoutPayment (página principal) ─────────────────────
export default function CheckoutPayment() {
  const navigate   = useNavigate()
  const { state }  = useLocation()
  const { t }      = useTranslation()
  const { user, updateUser } = useAuth()
  const [method, setMethod] = useState('mercado_pago')
  const [nupayEnabled, setNupayEnabled] = useState(false)
  const [nupayLoading, setNupayLoading] = useState(false)
  const [nupayError, setNupayError] = useState('')
  const [pendingBookingId, setPendingBookingId] = useState(state?.existing_booking_id || '')
  const idempotencyKey = useRef(globalThis.crypto?.randomUUID?.() || `nupay-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [nupayForm, setNupayForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    document_number: user?.document_number || '',
  })
  // Chave pública da cooperativa atribuída (split). Buscada para reservas já
  // existentes (pagamento pós-aceite). keyChecked evita montar o Brick antes.
  const [sellerKey,  setSellerKey]  = useState(null)
  const [keyChecked, setKeyChecked] = useState(() => !state?.existing_booking_id)

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
    setNupayForm((prev) => ({
      ...prev,
      full_name: prev.full_name || user?.full_name || '',
      email: prev.email || user?.email || '',
      phone: prev.phone || user?.phone || '',
      document_number: prev.document_number || user?.document_number || '',
    }))
  }, [user])

  useEffect(() => {
    api.getPublicSettings()
      .then((settings) => setNupayEnabled(settings?.payment_nupay_enabled === true))
      .catch(() => setNupayEnabled(false))
  }, [])

  if (!state) { navigate(-1); return null }

  const {
    service_name, service_type, booking_mode,
    service_date, service_date_iso, service_time,
    people_count, total_price: rawPrice, region_id, service_id,
    vehicles = [], origin_text, destination_text, cover_image_url,
    existing_booking_id, order_group_id, coupon_code,
  } = state

  const total_price = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)
  const isPrivate   = booking_mode === 'private'
  const subtitleParts = [
    service_date,
    service_time,
    `${people_count} ${people_count === 1 ? 'pessoa' : 'pessoas'}`,
  ].filter(Boolean)
  const showNupay = nupayEnabled && !order_group_id
  const needsNupayData = getNupayProfileMissingFields(nupayForm, user).length > 0

  // PIX pelo Brick: cria o pagamento e leva à tela de QR + acompanhamento.
  async function handlePix(formData) {
    const result = await api.createPaymentIntent({
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles,
      origin_text, destination_text,
      total_price, payment_method: 'pix',
      service_name, cover_image_url,
      existing_booking_id: pendingBookingId || existing_booking_id || undefined,
      order_group_id: order_group_id || undefined,
      payer_doc: formData?.payer?.identification?.number,
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
      existing_booking_id: pendingBookingId || existing_booking_id || undefined,
      order_group_id: order_group_id || undefined,
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

  function setNupayField(key, value) {
    setNupayForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleNupay() {
    if (nupayLoading) return
    setNupayLoading(true)
    setNupayError('')

    try {
      const profile = buildNupayProfilePayload(nupayForm)
      const profileResult = await api.updateProfile(profile)
      updateUser?.({ ...(profileResult?.user || profileResult || {}), ...profile })

      const result = await api.createPaymentIntent({
        service_type, service_id, booking_mode,
        service_date, service_date_iso, service_time,
        people_count, region_id, vehicles,
        origin_text, destination_text,
        total_price, payment_method: 'nupay',
        service_name, cover_image_url, coupon_code,
        existing_booking_id: pendingBookingId || existing_booking_id || undefined,
      }, idempotencyKey.current)

      if (!result?.payment_id || !result?.payment_url) {
        throw new Error('Não foi possível abrir o NuPay agora.')
      }

      sessionStorage.setItem('giro_nupay_return', JSON.stringify({
        provider: 'nupay',
        payment_method: 'nupay',
        payment_id: result.payment_id,
        booking_id: result.booking_id,
        booking_code: result.booking_code,
        amount: result.amount,
        expires_at: result.expires_at,
        payment_url: result.payment_url,
      }))
      window.location.assign(result.payment_url)
    } catch (err) {
      const bookingId = err.booking_id || err.payload?.booking_id
      if (bookingId) setPendingBookingId(bookingId)
      setNupayError(err.message || 'Não foi possível iniciar o NuPay. Tente PIX.')
      setNupayLoading(false)
    }
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

        {/* Métodos disponíveis */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-1">{t('payment.choose')}</p>
          {showNupay && (
            <div className="grid grid-cols-2 gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={() => setMethod('mercado_pago')}
                className={`min-h-16 rounded-lg border px-3 py-2.5 text-left flex items-center gap-2 ${
                  method === 'mercado_pago' ? 'border-brand bg-orange-50 text-gray-900' : 'border-gray-200 text-gray-600'
                }`}
              >
                <CreditCard size={18} className="shrink-0" />
                <span className="text-[12px] font-bold leading-tight">Cartão ou PIX</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('nupay')}
                className={`min-h-16 rounded-lg border px-3 py-2.5 text-left flex items-center gap-2 ${
                  method === 'nupay' ? 'border-[#820AD1] bg-purple-50 text-[#6200A5]' : 'border-gray-200 text-gray-600'
                }`}
              >
                <BadgeCheck size={18} className="shrink-0" />
                <span className="text-[12px] font-bold leading-tight">NuPay / Nubank</span>
              </button>
            </div>
          )}
          <div className="px-3 pb-3 pt-1">
            {method === 'mercado_pago' && keyChecked ? (
              <PaymentBrick
                amount={total_price}
                publicKey={sellerKey}
                onCard={handleCardPayment}
                onPix={handlePix}
              />
            ) : method === 'mercado_pago' ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
                <span className="text-[13px]">Preparando pagamento seguro…</span>
              </div>
            ) : null}
          </div>
        </div>

        {method === 'nupay' && (
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4 space-y-3">
            <div>
              <p className="text-[14px] font-bold text-gray-900">Dados para pagar com NuPay</p>
              <p className="text-[12px] text-gray-400 mt-0.5">
                A confirmação e as condições disponíveis serão exibidas no ambiente seguro do Nubank.
              </p>
            </div>
            {needsNupayData && (
              <>
                <input
                  value={nupayForm.full_name}
                  onChange={(e) => setNupayField('full_name', e.target.value)}
                  placeholder="Nome completo"
                  autoComplete="name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-[14px] text-gray-800 focus:outline-none focus:border-brand"
                />
                <input
                  value={nupayForm.email}
                  onChange={(e) => setNupayField('email', e.target.value)}
                  placeholder="E-mail"
                  type="email"
                  autoComplete="email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-[14px] text-gray-800 focus:outline-none focus:border-brand"
                />
                <input
                  value={nupayForm.phone}
                  onChange={(e) => setNupayField('phone', e.target.value)}
                  placeholder="Telefone / WhatsApp"
                  type="tel"
                  autoComplete="tel"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-[14px] text-gray-800 focus:outline-none focus:border-brand"
                />
                <input
                  value={nupayForm.document_number}
                  onChange={(e) => setNupayField('document_number', e.target.value)}
                  placeholder="CPF"
                  inputMode="numeric"
                  autoComplete="off"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-[14px] text-gray-800 focus:outline-none focus:border-brand"
                />
              </>
            )}
            {nupayError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-3">
                <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-600">{nupayError}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleNupay}
              disabled={nupayLoading}
              className="w-full min-h-12 bg-[#820AD1] text-white font-bold rounded-lg px-4 py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {nupayLoading
                ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Lock size={15} /> Continuar no Nubank · R$ {fmt(total_price)}</>}
            </button>
          </div>
        )}

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
