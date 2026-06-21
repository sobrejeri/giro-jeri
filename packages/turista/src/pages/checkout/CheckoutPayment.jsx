import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft, QrCode, CreditCard, Smartphone,
  ShieldCheck, Lock, Check, AlertCircle, ChevronDown,
} from 'lucide-react'
import { api } from '../../lib/api'

// ─── helpers ────────────────────────────────────────────────
function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function fmtCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function fmtCardNumber(v) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
}

function fmtExpiry(v) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length >= 3) return d.slice(0, 2) + '/' + d.slice(2)
  return d
}

// Detecta a bandeira pelo BIN (6 primeiros dígitos)
const BRAND_PATTERNS = {
  visa:      /^4/,
  master:    /^(5[1-5]|2[2-7])/,
  amex:      /^3[47]/,
  elo:       /^(4011|4312|4389|4514|4573|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/,
  hipercard: /^(606282|3841)/,
}

function detectBrand(cardNumber) {
  const raw = cardNumber.replace(/\s/g, '')
  for (const [brand, pattern] of Object.entries(BRAND_PATTERNS)) {
    if (pattern.test(raw)) return brand
  }
  return null
}

// ─── getMercadoPago ──────────────────────────────────────────
// Instancia o SDK somente quando o script já carregou
function getMercadoPago() {
  if (typeof window.MercadoPago === 'undefined') return null
  const key = import.meta.env.VITE_MP_PUBLIC_KEY
  if (!key) return null
  try {
    return new window.MercadoPago(key, { locale: 'pt-BR' })
  } catch {
    return null
  }
}

// ─── CardForm ────────────────────────────────────────────────
function CardForm({ method, totalPrice, onSuccess, onError }) {
  const { t } = useTranslation()

  const [cardNumber,   setCardNumber]   = useState('')
  const [cardName,     setCardName]     = useState('')
  const [expiry,       setExpiry]       = useState('')
  const [cvv,          setCvv]          = useState('')
  const [cpf,          setCpf]          = useState('')
  const [installments, setInstallments] = useState(1)
  const [brand,        setBrand]        = useState(null)
  const [installmentOptions, setInstallmentOptions] = useState([])
  const [loadingInst,  setLoadingInst]  = useState(false)
  const [errors,       setErrors]       = useState({})
  const [loading,      setLoading]      = useState(false)
  const [rejectedMsg,  setRejectedMsg]  = useState('')

  const isCredit = method === 'credit_card'
  const mpRef    = useRef(null)

  // Inicializa instância MP quando o componente monta
  useEffect(() => {
    mpRef.current = getMercadoPago()
  }, [])

  // Detecta bandeira e busca parcelas quando BIN muda (crédito)
  const fetchInstallments = useCallback(async (bin) => {
    const mp = mpRef.current
    if (!mp || !isCredit || !bin || bin.length < 6) {
      setInstallmentOptions([])
      return
    }
    setLoadingInst(true)
    try {
      const result = await mp.getInstallments({
        amount: String(totalPrice),
        bin,
        paymentTypeId: 'credit_card',
      })
      const payer = result?.[0]?.payer_costs ?? []
      setInstallmentOptions(payer)
      if (payer.length > 0) setInstallments(payer[0].installments)
    } catch {
      setInstallmentOptions([])
    } finally {
      setLoadingInst(false)
    }
  }, [isCredit, totalPrice])

  function handleCardNumberChange(e) {
    const formatted = fmtCardNumber(e.target.value)
    setCardNumber(formatted)
    const raw = formatted.replace(/\s/g, '')
    const detected = detectBrand(formatted)
    setBrand(detected)
    if (raw.length >= 6) {
      fetchInstallments(raw.slice(0, 6))
    } else {
      setInstallmentOptions([])
    }
  }

  function validateField(field, value) {
    const errs = { ...errors }
    const raw = value.replace(/\D/g, '')
    if (field === 'cardNumber') {
      if (raw.length < 13) errs.cardNumber = t('payment.rejected.bad_number')
      else delete errs.cardNumber
    }
    if (field === 'cardName') {
      if (value.trim().length < 3) errs.cardName = t('payment.card.nameLabel')
      else delete errs.cardName
    }
    if (field === 'expiry') {
      const parts = value.split('/')
      const month = parseInt(parts[0], 10)
      const year  = parseInt('20' + parts[1], 10)
      const now   = new Date()
      const valid = parts.length === 2
        && month >= 1 && month <= 12
        && year >= now.getFullYear()
        && !(year === now.getFullYear() && month < now.getMonth() + 1)
      if (!valid) errs.expiry = t('payment.rejected.bad_date')
      else delete errs.expiry
    }
    if (field === 'cvv') {
      if (value.replace(/\D/g, '').length < 3) errs.cvv = t('payment.rejected.bad_cvv')
      else delete errs.cvv
    }
    if (field === 'cpf') {
      if (raw.length !== 11) errs.cpf = t('payment.card.cpfLabel')
      else delete errs.cpf
    }
    setErrors(errs)
  }

  async function handleSubmit() {
    // Validação final completa
    const allErrors = {}
    if (cardNumber.replace(/\s/g, '').length < 13) allErrors.cardNumber = t('payment.rejected.bad_number')
    if (cardName.trim().length < 3)                allErrors.cardName   = t('payment.card.nameLabel')
    const parts = expiry.split('/')
    const month = parseInt(parts[0], 10)
    const year  = parseInt('20' + (parts[1] || ''), 10)
    const now   = new Date()
    const expiryValid = parts.length === 2
      && month >= 1 && month <= 12
      && year >= now.getFullYear()
      && !(year === now.getFullYear() && month < now.getMonth() + 1)
    if (!expiryValid) allErrors.expiry = t('payment.rejected.bad_date')
    if (cvv.replace(/\D/g, '').length < 3)         allErrors.cvv        = t('payment.rejected.bad_cvv')
    if (cpf.replace(/\D/g, '').length !== 11)      allErrors.cpf        = t('payment.card.cpfLabel')

    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors)
      return
    }

    const mp = mpRef.current
    if (!mp) {
      setRejectedMsg(t('payment.rejected.generic'))
      return
    }

    setLoading(true)
    setRejectedMsg('')

    try {
      // Tokeniza o cartão via MP
      const tokenResult = await mp.createCardToken({
        cardNumber:          cardNumber.replace(/\s/g, ''),
        cardholderName:      cardName,
        cardExpirationMonth: expiry.split('/')[0],
        cardExpirationYear:  '20' + expiry.split('/')[1],
        securityCode:        cvv.replace(/\D/g, ''),
        identificationType:  'CPF',
        identificationNumber: cpf.replace(/\D/g, ''),
      })

      const card_token = tokenResult?.id
      if (!card_token) throw new Error(t('payment.rejected.generic'))

      // Identifica bandeira via MP (mais confiável que regex local)
      let payment_method_id = brand || 'visa'
      let issuer_id
      try {
        const binInfo = await mp.getPaymentMethods({
          bin: cardNumber.replace(/\s/g, '').slice(0, 6),
        })
        if (binInfo?.results?.[0]) {
          payment_method_id = binInfo.results[0].id
          issuer_id = binInfo.results[0].issuer?.id?.toString()
        }
      } catch { /* usa brand local como fallback */ }

      const selectedInstallment = isCredit
        ? (installmentOptions.find((o) => o.installments === installments) || null)
        : null

      // Chama a API
      const result = await onSuccess({
        payment_method:    method,
        card_token,
        payment_method_id,
        payer_doc:         cpf.replace(/\D/g, ''),
        installments:      isCredit ? installments : 1,
        ...(issuer_id ? { issuer_id } : {}),
      })

      if (result?.status === 'rejected') {
        setCvv('')
        const msgKey = result.message_key || 'payment.rejected.generic'
        setRejectedMsg(t(msgKey))
      }
      // approved / in_process → tratados pelo pai
    } catch (err) {
      setCvv('')
      setRejectedMsg(err.message || t('payment.rejected.generic'))
    } finally {
      setLoading(false)
    }
  }

  // Parcela selecionada para exibição no CTA
  const selectedInstallmentOption = isCredit
    ? installmentOptions.find((o) => o.installments === installments)
    : null

  function ctaLabel() {
    if (loading) return t('payment.card.processing')
    if (isCredit && selectedInstallmentOption && selectedInstallmentOption.installments > 1) {
      const perInstallment = fmt(selectedInstallmentOption.installment_amount)
      return t('payment.card.payInstallments', {
        count: selectedInstallmentOption.installments,
        value: perInstallment,
      })
    }
    return t('payment.card.payNow', { amount: fmt(totalPrice) })
  }

  const brandSrc = brand ? `/cards/${brand}.svg` : '/cards/card.svg'

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-4 pt-4 pb-5 space-y-4">

        {/* Banner de recusa */}
        {rejectedMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-3">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-red-700">{t('payment.card.declined')}</p>
              <p className="text-[12px] text-red-600 mt-0.5">{rejectedMsg}</p>
            </div>
          </div>
        )}

        {/* Número do cartão */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
            {t('payment.card.numberLabel')}
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              value={cardNumber}
              onChange={handleCardNumberChange}
              onBlur={() => validateField('cardNumber', cardNumber)}
              disabled={loading}
              placeholder="0000 0000 0000 0000"
              style={{ fontSize: '16px' }}
              className={`w-full rounded-xl border px-3 py-3 pr-14 text-gray-900 placeholder-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition disabled:opacity-60 ${
                errors.cardNumber ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            <img
              src={brandSrc}
              alt={brand || 'card'}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-10 object-contain"
            />
          </div>
          {errors.cardNumber && (
            <p className="text-[11px] text-red-500 mt-1">{errors.cardNumber}</p>
          )}
        </div>

        {/* Nome no cartão */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
            {t('payment.card.nameLabel')}
          </label>
          <input
            type="text"
            autoComplete="cc-name"
            value={cardName}
            onChange={(e) => setCardName(e.target.value.toUpperCase())}
            onBlur={() => validateField('cardName', cardName)}
            disabled={loading}
            placeholder={t('payment.card.namePlaceholder')}
            style={{ fontSize: '16px' }}
            className={`w-full rounded-xl border px-3 py-3 text-gray-900 placeholder-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition disabled:opacity-60 uppercase ${
              errors.cardName ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {errors.cardName && (
            <p className="text-[11px] text-red-500 mt-1">{t('payment.card.nameLabel')} obrigatório</p>
          )}
        </div>

        {/* Validade + CVV */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              {t('payment.card.expiryLabel')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp"
              value={expiry}
              onChange={(e) => setExpiry(fmtExpiry(e.target.value))}
              onBlur={() => validateField('expiry', expiry)}
              disabled={loading}
              placeholder={t('payment.card.expiryPlaceholder')}
              style={{ fontSize: '16px' }}
              className={`w-full rounded-xl border px-3 py-3 text-gray-900 placeholder-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition disabled:opacity-60 ${
                errors.expiry ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            {errors.expiry && (
              <p className="text-[11px] text-red-500 mt-1">{errors.expiry}</p>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              {t('payment.card.cvvLabel')}
              <span className="font-normal text-gray-400 ml-1">— {t('payment.card.cvvHint')}</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-csc"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onBlur={() => validateField('cvv', cvv)}
              disabled={loading}
              placeholder="•••"
              style={{ fontSize: '16px' }}
              className={`w-full rounded-xl border px-3 py-3 text-gray-900 placeholder-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition disabled:opacity-60 ${
                errors.cvv ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            {errors.cvv && (
              <p className="text-[11px] text-red-500 mt-1">{errors.cvv}</p>
            )}
          </div>
        </div>

        {/* CPF */}
        <div>
          <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
            {t('payment.card.cpfLabel')}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(fmtCPF(e.target.value))}
            onBlur={() => validateField('cpf', cpf)}
            disabled={loading}
            placeholder="000.000.000-00"
            style={{ fontSize: '16px' }}
            className={`w-full rounded-xl border px-3 py-3 text-gray-900 placeholder-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition disabled:opacity-60 ${
              errors.cpf ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {errors.cpf && (
            <p className="text-[11px] text-red-500 mt-1">{t('payment.card.cpfLabel')} obrigatório</p>
          )}
        </div>

        {/* Parcelas — só para crédito, após detectar bandeira */}
        {isCredit && brand && (
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">
              {t('payment.card.installmentsLabel')}
            </label>
            {loadingInst ? (
              <div className="flex items-center gap-2 text-[12px] text-gray-400 py-2">
                <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
                {t('payment.card.loadingInstallments')}
              </div>
            ) : installmentOptions.length > 0 ? (
              <div className="relative">
                <select
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  disabled={loading}
                  style={{ fontSize: '16px' }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 pr-10 text-gray-900 appearance-none focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition disabled:opacity-60"
                >
                  {installmentOptions.map((opt) => {
                    const hasInterest  = opt.installment_rate > 0
                    const perValue     = fmt(opt.installment_amount)
                    const totalValue   = fmt(opt.total_amount)
                    const label = hasInterest
                      ? t('payment.card.installmentWithInterest', {
                          count: opt.installments,
                          value: perValue,
                          total: totalValue,
                        })
                      : t('payment.card.installmentNoInterest', {
                          count: opt.installments,
                          value: perValue,
                        })
                    return (
                      <option key={opt.installments} value={opt.installments}>
                        {label}
                      </option>
                    )
                  })}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            ) : (
              /* Fallback: sem parcelas da API — exibe apenas 1x */
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                <span className="text-[14px] text-gray-700">
                  {t('payment.card.installmentNoInterest', {
                    count: 1,
                    value: fmt(totalPrice),
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* CTA do formulário */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-70 mt-1"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <><Lock size={15} className="text-white/80" /> {ctaLabel()}</>
          )}
        </button>
      </div>
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

  const METHODS = [
    {
      id:        'pix',
      apiMethod: 'pix',
      label:     t('payment.method.pix'),
      sub:       t('payment.method.pixSub'),
      icon:      QrCode,
      badge:     t('payment.method.pixBadge'),
      iconBg:    'bg-orange-100',
      iconColor: 'text-brand',
    },
    {
      id:        'credit_card',
      apiMethod: 'credit_card',
      label:     t('payment.method.credit'),
      sub:       t('payment.method.creditSub'),
      icon:      CreditCard,
      badge:     null,
      iconBg:    'bg-blue-50',
      iconColor: 'text-blue-400',
    },
    {
      id:        'debit_card',
      apiMethod: 'debit_card',
      label:     t('payment.method.debit'),
      sub:       t('payment.method.debitSub'),
      icon:      Smartphone,
      badge:     null,
      iconBg:    'bg-purple-50',
      iconColor: 'text-purple-400',
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

  // Confirma pagamento PIX (fluxo original)
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

  // Callback do CardForm: chama a API e roteia pelo status
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

    // rejected → retorna para o CardForm exibir a mensagem
    return result
  }

  const isCard = method === 'credit_card' || method === 'debit_card'

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

        {/* Métodos + painéis de cartão em accordion */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-3">{t('payment.choose')}</p>
          <div className="divide-y divide-gray-50">
            {METHODS.map((m) => {
              const selected = method === m.id
              const showPanel = selected && (m.id === 'credit_card' || m.id === 'debit_card')

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

                  {/* Painel accordion de cartão */}
                  {showPanel && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-50 bg-gray-50/40">
                      <CardForm
                        key={m.id}
                        method={m.id}
                        totalPrice={total_price}
                        onSuccess={handleCardPayment}
                        onError={setError}
                      />
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

      {/* CTA fixo — só aparece para PIX */}
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
