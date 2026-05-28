import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Copy, Check, Clock, QrCode, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

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

export default function CheckoutProcessando() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const [copied, setCopied]   = useState(false)
  const [status, setStatus]   = useState('pending')
  const pollRef = useRef(null)

  if (!state) { navigate('/'); return null }

  const { pix_code, qr_base64, expires_at, payment_id, booking_code, total_price, test_mode } = state
  const { secs, display: countdown } = useCountdown(expires_at)

  const poll = useCallback(async () => {
    if (!payment_id) return
    try {
      const r = await api.getPaymentStatus(payment_id)
      if (!r) return
      if (r.status === 'approved') {
        setStatus('approved')
        clearInterval(pollRef.current)
        setTimeout(() => navigate('/checkout/sucesso', { state }), 800)
      } else if (['expired', 'failed', 'cancelled'].includes(r.status)) {
        setStatus(r.status)
        clearInterval(pollRef.current)
      }
    } catch { /* network error, try again */ }
  }, [payment_id, navigate, state])

  useEffect(() => {
    pollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pollRef.current)
  }, [poll])

  useEffect(() => {
    if (secs === 0 && expires_at) {
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
          Reserva <span className="font-mono font-bold text-gray-600">{booking_code}</span> · R$ {fmt(total_price)}
        </p>
      </header>

      <main className="px-4 pt-4 pb-10 space-y-4">

        {test_mode && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <p className="text-[12px] text-amber-700 font-medium">⚠️ Modo teste — configure a variável MP_ACCESS_TOKEN na API para pagamentos reais.</p>
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
              <p className="text-[11px] text-gray-400 text-center">QR disponível com<br />credenciais do Mercado Pago</p>
            </div>
          )}

          {/* Polling indicator */}
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
