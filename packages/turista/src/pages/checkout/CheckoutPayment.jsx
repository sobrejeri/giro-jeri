import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft, QrCode, CreditCard,
  ShieldCheck, Lock, Check, AlertCircle,
} from 'lucide-react'
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

// ─── CardBrick ───────────────────────────────────────────────
// Brick oficial de cartão do Mercado Pago (crédito e débito). Tokeniza o cartão
// com segurança (PCI) e devolve os dados no onSubmit; nós criamos o pagamento na
// API. O Brick detecta crédito/débito pela bandeira; o método é inferido do
// payment_method_id (deb* = débito).
function CardBrick({ amount, onPay, publicKey }) {
  const { t }    = useTranslation()
  const brickRef = useRef(null)
  const [phase,       setPhase]       = useState('loading') // loading | ready | error
  const [rejectedMsg, setRejectedMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    const containerId = 'cardPaymentBrick_container'

    async function mount() {
      const mp = getMercadoPago(publicKey)
      if (!mp) { setPhase('error'); return }
      let bricks
      try { bricks = mp.bricks() } catch { setPhase('error'); return }

      const email = getUserEmail()

      try {
        brickRef.current = await bricks.create('cardPayment', containerId, {
          initialization: {
            amount: Number(amount) || 0,
            ...(email ? { payer: { email } } : {}),
          },
          customization: {
            visual:         { style: { theme: 'default' } },
            paymentMethods: { minInstallments: 1, maxInstallments: 12 },
          },
          callbacks: {
            onReady: () => { if (!cancelled) setPhase('ready') },
            onError: (err) => {
              console.error('[brick] erro', err)
              if (!cancelled) setPhase((p) => (p === 'loading' ? 'error' : p))
            },
            onSubmit: async (formData) => {
              setRejectedMsg('')
              try {
                const pmId   = formData?.payment_method_id || ''
                const method = /^deb/i.test(pmId) ? 'debit_card' : 'credit_card'
                const result = await onPay({
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
        Não foi possível carregar o pagamento por cartão. Atualize a página ou pague com PIX.
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
      <div id="cardPaymentBrick_container" />
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
  const [method, setMethod]   = useState('pix')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
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

  const METHODS = [
    {
      id:        'pix',
      label:     t('payment.method.pix'),
      sub:       t('payment.method.pixSub'),
      icon:      QrCode,
      badge:     t('payment.method.pixBadge'),
      iconBg:    'bg-orange-100',
      iconColor: 'text-brand',
    },
    {
      id:        'card',
      label:     t('payment.method.card', { defaultValue: 'Cartão de crédito ou débito' }),
      sub:       t('payment.method.cardSub', { defaultValue: 'Crédito em até 12x ou débito' }),
      icon:      CreditCard,
      badge:     null,
      iconBg:    'bg-blue-50',
      iconColor: 'text-blue-400',
    },
  ]

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

  // Confirma pagamento PIX (fluxo original — QR + polling)
  async function handlePixConfirm() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const result = await api.createPaymentIntent({
        service_type, service_id, booking_mode,
        service_date, service_date_iso, service_time,
        people_count, region_id, vehicles,
        origin_text, destination_text,
        total_price, payment_method: 'pix',
        service_name, cover_image_url,
        existing_booking_id: existing_booking_id || undefined,
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
    } catch (err) {
      setError(err.message || t('payment.errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  // Callback do CardBrick: chama a API e roteia pelo status
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

    // rejected → retorna para o CardBrick exibir a mensagem
    return result
  }

  const isCard = method === 'card'

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

      <main className="px-4 pt-4 pb-36 space-y-3">
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

        {/* Métodos + painel do cartão (Brick) em accordion */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-3">{t('payment.choose')}</p>
          <div className="divide-y divide-gray-50">
            {METHODS.map((m) => {
              const selected  = method === m.id
              const showPanel = selected && m.id === 'card'

              return (
                <div key={m.id}>
                  <button
                    onClick={() => setMethod(m.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${
                      selected ? 'bg-orange-50/60' : 'active:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${selected ? 'bg-brand' : m.iconBg} flex items-center justify-center shrink-0 transition-colors`}>
                      <m.icon size={18} className={selected ? 'text-white' : m.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[14px] font-semibold ${selected ? 'text-gray-900' : 'text-gray-700'}`}>
                          {m.label}
                        </span>
                        {m.badge && (
                          <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            {m.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-400 mt-0.5">{m.sub}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      selected ? 'border-brand bg-brand' : 'border-gray-300'
                    }`}>
                      {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                  </button>

                  {/* Painel accordion do cartão (Brick do Mercado Pago) */}
                  {showPanel && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-50 bg-gray-50/40">
                      {keyChecked ? (
                        <CardBrick amount={total_price} onPay={handleCardPayment} publicKey={sellerKey} />
                      ) : (
                        <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
                          <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
                          <span className="text-[13px]">Preparando pagamento seguro…</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Erro genérico (PIX) */}
        {error && !isCard && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        <div className="bg-green-50 rounded-2xl p-3.5 border border-green-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-green-700 leading-relaxed">{t('payment.secureNote')}</p>
          </div>
        </div>
      </main>

      {/* CTA fixo — só aparece para PIX (o cartão tem botão próprio no Brick) */}
      {!isCard && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 pt-3 pb-6 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <button
            onClick={handlePixConfirm}
            disabled={loading}
            className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-70"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Lock size={15} className="text-white/80" /> {t('payment.confirmBtn', { amount: fmt(total_price) })}</>
            }
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-2">{t('payment.terms')}</p>
        </div>
      )}
    </div>
  )
}
