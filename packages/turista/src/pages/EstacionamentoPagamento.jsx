import { useMemo, useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ShieldCheck, CreditCard, Loader2, Copy, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { FormularioCartaoPagarme } from './checkout/CheckoutPayment'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function EstacionamentoPagamento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth() || {}
  const idemKey = useMemo(() => `park-pay-${id}-${(crypto?.randomUUID?.() || Date.now())}`, [id])
  const [metodo, setMetodo] = useState(null) // 'cartao' | 'pix'

  const { data: r, isLoading } = useQuery({ queryKey: ['parking-res', id], queryFn: () => api.parkingReservation(id) })
  const { data: settings } = useQuery({ queryKey: ['public-settings'], queryFn: () => api.getPublicSettings() })
  const publicKey = settings?.payment_pagarme_public_key
  const maxParcelas = Number(settings?.payment_max_installments) || 12
  // Formas ligadas no admin (mesma config dos passeios). Pix exige MP configurado.
  const pixAtivo = String(settings?.payment_method_pix ?? 'true') !== 'false'
  const cartaoAtivo = !!publicKey

  if (isLoading) return <p className="p-6 text-center text-gray-400 text-sm">Carregando…</p>
  if (!r) return <p className="p-6 text-center text-gray-400 text-sm">Reserva não encontrada.</p>
  const podePagar = r.status === 'accepted_awaiting_payment' && r.payment_status !== 'paid'

  async function onPagarCartao(fields) {
    const resp = await api.parkingPay(id, { card_token: fields.card_token, parcelas: Number(fields.installments) || 1, idempotency_key: idemKey })
    if (resp?.ok || resp?.already) { navigate('/minhas-reservas', { replace: true }); return { status: 'approved' } }
    if (resp?.refund_pending) return { status: 'rejected', message_key: 'payment.rejected.generic' }
    return { status: 'rejected' }
  }

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95"><ChevronLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-lg font-bold text-gray-900">Pagamento</h1>
      </header>

      <main className="px-4 pt-4 space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">Estacionamento · {r.code}</p>
            <p className="text-[15px] font-bold text-gray-900">{r.units} diária(s)</p>
          </div>
          <p className="text-[18px] font-extrabold text-brand">{fmt(r.total_amount)}</p>
        </div>

        {!podePagar ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] text-amber-700">Esta reserva não está liberada para pagamento.</div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-[14px] font-bold text-gray-900">Escolha como pagar</p>

            {/* Pix */}
            {pixAtivo && (
              <BlocoPix
                id={id}
                total={r.total_amount}
                emailPadrao={user?.email || ''}
                precisaEmail={!user?.email}
                aberto={metodo === 'pix'}
                onAbrir={() => setMetodo(metodo === 'pix' ? null : 'pix')}
                onPago={() => navigate('/minhas-reservas', { replace: true })}
              />
            )}

            {/* Cartão */}
            {cartaoAtivo && (
              <div>
                <button onClick={() => setMetodo(metodo === 'cartao' ? null : 'cartao')}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${metodo === 'cartao' ? 'border-brand bg-brand/5' : 'border-gray-200'}`}>
                  <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${metodo === 'cartao' ? 'border-brand' : 'border-gray-300'}`}>
                    {metodo === 'cartao' && <span className="w-2 h-2 rounded-full bg-brand" />}
                  </span>
                  <CreditCard size={18} className="text-gray-700" />
                  <span className="flex-1"><span className="block text-[14px] font-semibold text-gray-900">Cartão de crédito</span><span className="block text-[11px] text-gray-500">Parcele em até {maxParcelas}x</span></span>
                </button>
                {metodo === 'cartao' && (
                  <div className="mt-3">
                    <FormularioCartaoPagarme amount={Number(r.total_amount)} publicKey={publicKey} maxParcelas={maxParcelas} onPagar={onPagarCartao} installmentFees={settings?.payment_installment_fees} />
                  </div>
                )}
              </div>
            )}

            {!pixAtivo && !cartaoAtivo && (
              <p className="text-[13px] text-amber-700">Nenhuma forma de pagamento disponível no momento.</p>
            )}
          </div>
        )}

        <p className="text-[11px] text-gray-400 flex items-center gap-1.5 px-1">
          <ShieldCheck size={13} className="text-emerald-500" /> Pagamento seguro. Você recebe a confirmação após o pagamento.
        </p>
      </main>
    </div>
  )
}

// ── Bloco de Pix: escolhe, gera QR e fica consultando até confirmar ───────────
function BlocoPix({ id, total, emailPadrao, precisaEmail, aberto, onAbrir, onPago }) {
  const [email, setEmail] = useState(emailPadrao)
  const [pix, setPix] = useState(null) // { pix_code, qr_base64, expires_at }
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const pollRef = useRef(null)

  const emailOk = !precisaEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])
  // Para de pollar se o bloco fechar.
  useEffect(() => { if (!aberto && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }, [aberto])

  async function gerar() {
    setErro(''); setGerando(true)
    try {
      const resp = await api.parkingPayPix(id, precisaEmail ? { email: email.trim() } : {})
      if (resp?.already) { onPago?.(); return }
      if (!resp?.pix_code && !resp?.qr_base64) throw new Error('Não foi possível gerar o Pix.')
      setPix(resp)
      // Polling do status até confirmar.
      pollRef.current = setInterval(async () => {
        try { const s = await api.parkingPixStatus(id); if (s?.paid) { clearInterval(pollRef.current); pollRef.current = null; onPago?.() } } catch { /* tenta de novo */ }
      }, 4000)
    } catch (e) { setErro(e?.message || 'Não foi possível gerar o Pix.') }
    finally { setGerando(false) }
  }

  function copiar() {
    try { navigator.clipboard.writeText(pix.pix_code); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem clipboard */ }
  }

  return (
    <div>
      <button onClick={onAbrir}
        className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${aberto ? 'border-[#32BCAD] bg-[#32BCAD]/5' : 'border-gray-200'}`}>
        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${aberto ? 'border-[#32BCAD]' : 'border-gray-300'}`}>
          {aberto && <span className="w-2 h-2 rounded-full bg-[#32BCAD]" />}
        </span>
        <span className="w-8 h-8 rounded-full bg-[#32BCAD] flex items-center justify-center shrink-0">
          <img src={import.meta.env.BASE_URL + 'logos/pix.svg'} alt="" aria-hidden="true" className="w-4 h-4" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        </span>
        <span className="flex-1"><span className="block text-[14px] font-semibold text-gray-900">Pix</span><span className="block text-[11px] text-gray-500">Aprovação na hora, sem cadastro</span></span>
      </button>

      {aberto && (
        <div className="mt-3 space-y-3">
          {!pix ? (
            <>
              {precisaEmail && (
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">Seu e-mail</label>
                  <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-[#32BCAD]" />
                  <p className="text-[11px] text-gray-500 mt-1">Obrigatório para emitir o Pix.</p>
                </div>
              )}
              {erro && <p className="text-[12px] text-red-600">{erro}</p>}
              <button onClick={gerar} disabled={gerando || !emailOk}
                className="w-full flex items-center justify-center gap-2 bg-[#32BCAD] text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] disabled:opacity-60">
                {gerando ? <><Loader2 size={17} className="animate-spin" /> Gerando o Pix…</> : <>Pagar {fmt(total)} com Pix</>}
              </button>
            </>
          ) : (
            <div className="text-center">
              {pix.qr_base64 && <img src={`data:image/png;base64,${pix.qr_base64}`} alt="QR Code Pix" className="mx-auto w-52 h-52" />}
              <p className="text-[12px] text-gray-500 mt-2">Escaneie o QR no app do seu banco, ou copie o código:</p>
              <div className="mt-2 flex items-center gap-2">
                <input readOnly value={pix.pix_code || ''} className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-[11px] text-gray-600 bg-gray-50" />
                <button onClick={copiar} className="shrink-0 bg-gray-900 text-white rounded-xl px-3 py-2 text-[12px] font-semibold flex items-center gap-1">
                  {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-gray-500">
                <Loader2 size={14} className="animate-spin" /> Aguardando o pagamento… a reserva confirma automaticamente.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
