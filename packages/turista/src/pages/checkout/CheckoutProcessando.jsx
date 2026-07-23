import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Copy, Check, Clock, QrCode, RefreshCw, ArrowRight, Landmark, FlaskConical, Zap, Smartphone, ShieldCheck, ExternalLink } from 'lucide-react'
import { api } from '../../lib/api'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

const PIX_TYPE_LABELS = {
  cpf:        'CPF',
  cnpj:       'CNPJ',
  email:      'E-mail',
  phone:      'Telefone',
  random_key: 'Chave aleatória',
}

function useCountdown(expiresAt) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!expiresAt) return
    const calc = () => Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000))
    setSecs(calc())
    const t = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return { secs, display: `${m}:${s}` }
}

function NupayPayment({ state }) {
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('pending')
  const [providerError, setProviderError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState(state.payment_url || '')
  const pollRef = useRef(null)
  const completedRef = useRef(false)
  const sessionId = searchParams.get('sessionId') || searchParams.get('session_id')
  const returnState = String(searchParams.get('state') || '').toLowerCase()
  const { payment_id, total_price } = state
  const [bookingCode, setBookingCode] = useState(state.booking_code || '')
  const [bookingId, setBookingId] = useState(state.booking_id || '')
  const [amount, setAmount] = useState(state.amount || '')
  const [expiresAt, setExpiresAt] = useState(state.expires_at || '')
  const value = amount || total_price
  const { secs, display: countdown } = useCountdown(expiresAt)

  const openNupay = useCallback(() => {
    if (paymentUrl) window.location.assign(paymentUrl)
  }, [paymentUrl])

  const applyStatus = useCallback((result) => {
    if (!result) return
    if (result.payment_url) setPaymentUrl(result.payment_url)
    if (result.booking_code) setBookingCode(result.booking_code)
    if (result.booking_id) setBookingId(result.booking_id)
    if (result.amount) setAmount(result.amount)
    if (result.expires_at) setExpiresAt(result.expires_at)

    if (result.status === 'approved') {
      setStatus('approved')
      clearInterval(pollRef.current)
      setTimeout(() => navigate('/checkout/sucesso', {
        state: {
          ...state,
          booking_id: result.booking_id || bookingId,
          booking_code: result.booking_code || bookingCode,
        },
      }), 800)
    } else if (['expired', 'failed', 'cancelled'].includes(result.status)) {
      setStatus(result.status === 'cancelled' ? 'failed' : result.status)
      clearInterval(pollRef.current)
    }
  }, [bookingCode, bookingId, navigate, state])

  const poll = useCallback(async () => {
    if (!payment_id) return
    try {
      applyStatus(await api.getPaymentStatus(payment_id))
      setProviderError('')
    } catch {
      setProviderError('Não foi possível atualizar o pagamento agora.')
    }
  }, [applyStatus, payment_id])

  useEffect(() => {
    if (!sessionId || !payment_id || completedRef.current) return
    completedRef.current = true
    api.completeNupayPayment(payment_id, sessionId)
      .then(applyStatus)
      .catch(() => setProviderError('Não foi possível confirmar o retorno do Nubank agora.'))
  }, [applyStatus, payment_id, sessionId])

  useEffect(() => {
    if (returnState === 'canceled' || returnState === 'cancelled') setStatus('failed')
  }, [returnState])

  useEffect(() => {
    pollRef.current = setInterval(poll, 30000)
    poll()
    return () => clearInterval(pollRef.current)
  }, [poll])

  useEffect(() => {
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now() && status === 'pending') {
      clearInterval(pollRef.current)
      setStatus('expired')
    }
  }, [secs, expiresAt, status])

  async function cancelAttempt() {
    if (!payment_id || cancelling) return
    setCancelling(true)
    setProviderError('')
    try {
      await api.cancelPayment(payment_id)
      setStatus('failed')
    } catch {
      setProviderError('Não foi possível cancelar agora. Tente novamente.')
    } finally {
      setCancelling(false)
    }
  }

  function choosePix() {
    navigate('/checkout/pagamento', {
      state: {
        ...state,
        booking_id: bookingId,
        existing_booking_id: bookingId,
        booking_code: bookingCode,
        amount,
        total_price: value,
        payment_method: 'pix',
      },
    })
  }

  if (status === 'approved') {
    return (
      <div className="min-h-screen max-w-[430px] mx-auto bg-[#F8F8F8] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <Check size={36} className="text-green-500" strokeWidth={2.5} />
          </div>
          <p className="text-[20px] font-bold text-gray-900">Pagamento confirmado!</p>
          <p className="text-[14px] text-gray-500 mt-1">Redirecionando…</p>
        </div>
      </div>
    )
  }

  if (status === 'expired' || status === 'failed') {
    return (
      <div className="min-h-screen max-w-[430px] mx-auto bg-[#F8F8F8] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock size={32} className="text-red-400" />
        </div>
        <p className="text-[20px] font-bold text-gray-900 mb-1">
          {status === 'expired' ? 'Sessão NuPay expirada' : 'Pagamento NuPay cancelado'}
        </p>
        <p className="text-[13px] text-gray-500 mb-6 text-center">
          Sua reserva continua aguardando pagamento. Você pode iniciar uma nova tentativa ou pagar via PIX.
        </p>
        <div className="w-full max-w-xs space-y-2">
          <button
            onClick={choosePix}
            className="w-full bg-brand text-white font-bold rounded-lg px-8 py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            Pagar com PIX
          </button>
          <button
            onClick={() => navigate('/minhas-reservas')}
            className="w-full bg-white text-gray-700 border border-gray-200 font-bold rounded-lg px-8 py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            Ver minhas reservas
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-[430px] mx-auto bg-[#F8F8F8]">
      <header className="bg-white px-4 pt-12 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Pagar com Nubank</h1>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold ${secs < 120 ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-700'}`}>
            <Clock size={12} />
            {countdown}
          </div>
        </div>
        <p className="text-[12px] text-gray-400 mt-1">
          Reserva <span className="font-mono font-bold text-gray-600">{bookingCode || 'em processamento'}</span>
          {value ? ` · R$ ${fmt(value)}` : ''}
        </p>
      </header>

      <main className="px-4 pt-4 pb-10 space-y-4">
        {providerError && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-[12px] text-amber-700">{providerError}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-5 text-center">
          <div className="w-20 h-20 rounded-lg bg-purple-100 flex items-center justify-center mx-auto mb-4">
            <Smartphone size={34} className="text-purple-700" />
          </div>
          <p className="text-[18px] font-extrabold text-gray-900">Confirme no app Nubank</p>
          <p className="text-[13px] text-gray-500 leading-relaxed mt-2">
            Continue no ambiente seguro do Nubank para escolher as condições disponíveis e autorizar.
          </p>
          {paymentUrl && (
            <button
              onClick={openNupay}
              className="mt-5 w-full bg-[#820AD1] text-white font-bold rounded-lg py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Abrir app Nubank <ExternalLink size={16} />
            </button>
          )}
          <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-gray-400">
            <RefreshCw size={11} className="animate-spin" />
            Verificando confirmação automaticamente…
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-3.5 border border-green-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={15} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-green-700 leading-relaxed">
              Seus dados de cartão não são digitados no Giro Jeri; a autenticação acontece no Nubank.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={cancelAttempt}
            disabled={cancelling}
            className="flex-1 bg-white text-gray-600 border border-gray-200 font-bold rounded-lg py-3.5 text-[13px] disabled:opacity-60"
          >
            {cancelling ? 'Cancelando...' : 'Cancelar NuPay'}
          </button>
          <button
            onClick={choosePix}
            className="flex-1 bg-white text-brand border border-orange-200 font-bold rounded-lg py-3.5 text-[13px]"
          >
            Pagar com PIX
          </button>
        </div>
      </main>
    </div>
  )
}

// ── Manual payment (no gateway) ───────────────────────────
function ManualPayment({ state }) {
  const navigate = useNavigate()
  const [copied,        setCopied]        = useState(false)
  const [simLoading,    setSimLoading]    = useState(false)
  const [simError,      setSimError]      = useState('')
  const { booking_code, amount, total_price, pix_key, pix_key_type, bank_name, bank_agency, bank_account, bank_account_type, payment_id, booking_id } = state
  const value = amount || total_price

  function handleCopy() {
    if (!pix_key) return
    navigator.clipboard.writeText(pix_key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function handleSimulate() {
    if (!payment_id) return
    setSimLoading(true)
    setSimError('')
    try {
      await api.simulatePaymentApprove(payment_id)
      navigate('/checkout/sucesso', { state: { ...state, booking_id } })
    } catch (err) {
      setSimError(err.message || 'Erro ao simular pagamento')
    } finally {
      setSimLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <header className="bg-white px-4 pt-12 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h1 className="text-lg font-bold text-gray-900">Realizar pagamento</h1>
        <p className="text-[12px] text-gray-400 mt-1">
          Reserva <span className="font-mono font-bold text-gray-600">{booking_code}</span>
          {value ? ` · R$ ${fmt(value)}` : ''}
        </p>
      </header>

      <main className="px-4 pt-4 pb-24 space-y-4">

        {/* Instrução principal */}
        <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4">
          <p className="text-[14px] font-bold text-gray-900 mb-1">Faça o PIX para confirmar sua reserva</p>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            Transfira o valor abaixo para a chave PIX informada. Após o pagamento,
            envie o comprovante e aguarde a confirmação da equipe.
          </p>
        </div>

        {/* Valor */}
        {value > 0 && (
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4 flex items-center justify-between">
            <p className="text-[13px] text-gray-500">Valor a transferir</p>
            <p className="text-[22px] font-bold text-brand">R$ {fmt(value)}</p>
          </div>
        )}

        {/* Chave PIX */}
        {pix_key ? (
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <QrCode size={16} className="text-brand" />
              <p className="text-[13px] font-bold text-gray-900">Chave PIX</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 mb-1">{PIX_TYPE_LABELS[pix_key_type] || 'Chave'}</p>
              <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center gap-2 border border-gray-100">
                <p className="text-[13px] font-mono font-semibold text-gray-800 flex-1 break-all">{pix_key}</p>
              </div>
            </div>
            <button
              onClick={handleCopy}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-[14px] transition-all active:scale-[0.98] ${
                copied ? 'bg-green-500 text-white' : 'bg-brand text-white'
              }`}
            >
              {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar chave PIX</>}
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-[12px] text-amber-700 font-medium">
              Chave PIX ainda não configurada. Entre em contato pelo WhatsApp para receber os dados de pagamento.
            </p>
          </div>
        )}

        {/* Dados bancários (se disponíveis) */}
        {bank_name && (
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Landmark size={15} className="text-gray-400" />
              <p className="text-[13px] font-bold text-gray-900">Dados bancários</p>
            </div>
            {[
              { label: 'Banco',   value: bank_name },
              { label: 'Agência', value: bank_agency },
              { label: 'Conta',   value: bank_account ? `${bank_account} (${bank_account_type === 'poupanca' ? 'Poupança' : 'Corrente'})` : null },
            ].filter((r) => r.value).map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">{row.label}</span>
                <span className="font-semibold text-gray-800">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Botão de teste — só aparece quando não há chave PIX real */}
        {!pix_key && payment_id && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <FlaskConical size={14} className="text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-yellow-700 font-medium">
                Modo de teste ativo. Clique abaixo para simular a confirmação do pagamento.
              </p>
            </div>
            {simError && <p className="text-[11px] text-red-500">{simError}</p>}
            <button
              onClick={handleSimulate}
              disabled={simLoading}
              className="w-full flex items-center justify-center gap-2 bg-yellow-500 text-white font-bold rounded-xl py-3 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <Zap size={15} />
              {simLoading ? 'Processando…' : 'Simular pagamento aprovado'}
            </button>
          </div>
        )}

        {/* Passos */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4 space-y-3">
          <p className="text-[13px] font-bold text-gray-900">Como finalizar:</p>
          {[
            'Copie a chave PIX acima e abra o app do seu banco',
            `Faça a transferência PIX no valor de R$ ${value ? fmt(value) : '—'}`,
            'Salve o comprovante de pagamento',
            'Envie o comprovante pelo WhatsApp para nossa equipe',
            'Aguarde a confirmação — geralmente em poucos minutos',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-brand">{i + 1}</span>
              </div>
              <p className="text-[12px] text-gray-600 leading-relaxed">{step}</p>
            </div>
          ))}
        </div>

        {/* Status da reserva */}
        <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Clock size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-blue-700 leading-relaxed">
              Sua reserva está criada e aguardando confirmação do pagamento.
              Você pode acompanhá-la em "Minhas Reservas".
            </p>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 pt-3 pb-6 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <Link
          to="/minhas-reservas"
          className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform"
        >
          Ver minhas reservas <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  )
}

// ── Gateway payment (QR code polling) ────────────────────
export default function CheckoutProcessando() {
  const navigate  = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryPaymentId = searchParams.get('nupay_payment_id')
  const state = location.state || (queryPaymentId ? {
    provider: 'nupay',
    payment_method: 'nupay',
    payment_id: queryPaymentId,
  } : null)
  const [copied, setCopied]   = useState(false)
  const [status, setStatus]   = useState('pending')
  const pollRef = useRef(null)

  if (!state) { navigate('/'); return null }

  // Manual mode: delegate to static PIX display
  if (state.manual_mode) return <ManualPayment state={state} />
  if (state.provider === 'nupay' || state.payment_method === 'nupay') return <NupayPayment state={state} />

  const { pix_code, qr_base64, expires_at, payment_id, booking_code, total_price, amount, test_mode } = state
  const value = amount || total_price
  const { secs, display: countdown } = useCountdown(expires_at)

  // Test mode: count down to auto-approval (15s from payment creation)
  const [testSecsLeft, setTestSecsLeft] = useState(() => {
    if (!test_mode || !payment_id) return 0
    return 15
  })
  useEffect(() => {
    if (!test_mode) return
    const t = setInterval(() => setTestSecsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [test_mode])

  const poll = useCallback(async () => {
    if (!payment_id) return
    try {
      const r = await api.getPaymentStatus(payment_id)
      if (!r) return
      if (r.status === 'approved') {
        setStatus('approved')
        clearInterval(pollRef.current)
        setTimeout(() => navigate('/checkout/sucesso', { state: { ...state, booking_id: state.booking_id } }), 800)
      } else if (['expired', 'failed', 'cancelled'].includes(r.status)) {
        setStatus(r.status)
        clearInterval(pollRef.current)
      }
    } catch { /* network error, try again */ }
  }, [payment_id, navigate, state])

  useEffect(() => {
    // Modo de teste: verifica a cada 1s para aprovação instantânea
    pollRef.current = setInterval(poll, test_mode ? 1000 : 4000)
    return () => clearInterval(pollRef.current)
  }, [poll, test_mode])

  useEffect(() => {
    if (expires_at && new Date(expires_at).getTime() <= Date.now()) {
      clearInterval(pollRef.current)
      setStatus('expired')
    }
  }, [secs, expires_at])

  function handleCopy() {
    if (!pix_code) return
    navigator.clipboard.writeText(pix_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  if (status === 'approved') {
    return (
      <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <Check size={36} className="text-green-500" strokeWidth={2.5} />
          </div>
          <p className="text-[20px] font-bold text-gray-900">Pagamento confirmado!</p>
          <p className="text-[14px] text-gray-500 mt-1">Redirecionando…</p>
        </div>
      </div>
    )
  }

  if (status === 'expired' || status === 'failed') {
    return (
      <div className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock size={32} className="text-red-400" />
        </div>
        <p className="text-[20px] font-bold text-gray-900 mb-1">
          {status === 'expired' ? 'PIX expirado' : 'Pagamento não aprovado'}
        </p>
        <p className="text-[13px] text-gray-500 mb-6 text-center">
          O código PIX expirou ou o pagamento foi recusado. Tente novamente.
        </p>
        <button
          onClick={() => navigate(-2)}
          className="bg-brand text-white font-bold rounded-2xl px-8 py-3.5 text-[14px] active:scale-[0.98] transition-transform"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <header className="bg-white px-4 pt-12 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Pagar com PIX</h1>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold ${secs < 120 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-brand'}`}>
            <Clock size={12} />
            {countdown}
          </div>
        </div>
        <p className="text-[12px] text-gray-400 mt-1">
          Reserva <span className="font-mono font-bold text-gray-600">{booking_code}</span>
          {value ? ` · R$ ${fmt(value)}` : ''}
        </p>
      </header>

      <main className="px-4 pt-4 pb-10 space-y-4">

        {/* Test mode banner */}
        {test_mode && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-2xl px-4 py-3 flex items-start gap-3">
            <FlaskConical size={16} className="text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-yellow-800">Modo de teste ativo</p>
              <p className="text-[12px] text-yellow-700 mt-0.5">Aprovação automática em andamento…</p>
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-5 flex flex-col items-center">
          <p className="text-[13px] font-semibold text-gray-700 mb-4">Escaneie o QR Code no app do seu banco</p>
          {qr_base64 ? (
            <img src={`data:image/png;base64,${qr_base64}`} alt="QR PIX" className="w-52 h-52 rounded-xl" />
          ) : (
            <div className="w-52 h-52 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2">
              <QrCode size={48} className="text-gray-300" />
              <p className="text-[11px] text-gray-400 text-center">{test_mode ? 'Teste — sem QR real' : 'QR disponível após\nconfigurar o gateway'}</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-4 text-[11px] text-gray-400">
            <RefreshCw size={11} className="animate-spin" />
            Verificando pagamento automaticamente…
          </div>
        </div>

        {/* PIX Copia e Cola */}
        {pix_code && (
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4">
            <p className="text-[13px] font-semibold text-gray-700 mb-2">Ou use o código PIX Copia e Cola</p>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center gap-2 border border-gray-100">
              <p className="text-[11px] text-gray-500 font-mono flex-1 break-all line-clamp-2">{pix_code}</p>
            </div>
            <button
              onClick={handleCopy}
              className={`mt-2.5 w-full flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-[14px] transition-all active:scale-[0.98] ${
                copied ? 'bg-green-500 text-white' : 'bg-brand text-white'
              }`}
            >
              {copied ? <><Check size={16} /> Copiado!</> : <><Copy size={16} /> Copiar código PIX</>}
            </button>
          </div>
        )}

        {/* Instruções */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-4 space-y-3">
          <p className="text-[13px] font-bold text-gray-900">Como pagar:</p>
          {[
            'Abra o app do seu banco ou carteira digital',
            'Escolha a opção "Pix" → "Pagar com QR Code" ou "Copia e Cola"',
            'Confirme o valor e conclua o pagamento',
            'Sua reserva será confirmada automaticamente',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-brand">{i + 1}</span>
              </div>
              <p className="text-[12px] text-gray-600">{step}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
