import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Copy, Check, Clock, QrCode, RefreshCw, ArrowRight, Landmark } from 'lucide-react'
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

// ── Manual payment (no gateway) ───────────────────────────
function ManualPayment({ state }) {
  const [copied, setCopied] = useState(false)
  const { booking_code, amount, total_price, pix_key, pix_key_type, bank_name, bank_agency, bank_account, bank_account_type } = state
  const value = amount || total_price

  function handleCopy() {
    if (!pix_key) return
    navigator.clipboard.writeText(pix_key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
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
  const { state } = useLocation()
  const [copied, setCopied]   = useState(false)
  const [status, setStatus]   = useState('pending')
  const pollRef = useRef(null)

  if (!state) { navigate('/'); return null }

  // Manual mode: delegate to static PIX display
  if (state.manual_mode) return <ManualPayment state={state} />

  const { pix_code, qr_base64, expires_at, payment_id, booking_code, total_price, amount } = state
  const value = amount || total_price
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
          Reserva <span className="font-mono font-bold text-gray-600">{booking_code}</span>
          {value ? ` · R$ ${fmt(value)}` : ''}
        </p>
      </header>

      <main className="px-4 pt-4 pb-10 space-y-4">
        {/* QR Code */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-5 flex flex-col items-center">
          <p className="text-[13px] font-semibold text-gray-700 mb-4">Escaneie o QR Code no app do seu banco</p>
          {qr_base64 ? (
            <img src={`data:image/png;base64,${qr_base64}`} alt="QR PIX" className="w-52 h-52 rounded-xl" />
          ) : (
            <div className="w-52 h-52 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2">
              <QrCode size={48} className="text-gray-300" />
              <p className="text-[11px] text-gray-400 text-center">QR disponível após<br />configurar o gateway</p>
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
