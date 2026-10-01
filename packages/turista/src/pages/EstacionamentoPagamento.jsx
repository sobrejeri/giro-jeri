import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, CreditCard, ShieldCheck, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const soDigitos = (s) => String(s || '').replace(/\D/g, '')

// Tokeniza o cartão direto no Pagar.me (nada de dado de cartão no nosso
// servidor — só o token). Mesmo princípio do checkout de passeios.
async function tokenizar(publicKey, card) {
  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card', card: {
      number: soDigitos(card.number), holder_name: card.holder.trim(),
      exp_month: Number(card.expMonth), exp_year: Number(card.expYear), cvv: card.cvv,
    } }),
  })
  let data = null; try { data = await res.json() } catch {}
  if (!res.ok || !data?.id) {
    throw new Error(data?.message || 'Confira os dados do cartão (número, validade e CVV).')
  }
  return data.id
}

export default function EstacionamentoPagamento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ number: '', holder: '', expMonth: '', expYear: '', cvv: '' })
  const [erro, setErro] = useState('')
  const [pagando, setPagando] = useState(false)
  // Chave de idempotência estável por tentativa (não duplica com reenvio/timeout).
  const idemKey = useMemo(() => `park-pay-${id}-${(crypto?.randomUUID?.() || Date.now())}`, [id])

  const { data: r, isLoading } = useQuery({ queryKey: ['parking-res', id], queryFn: () => api.parkingReservation(id) })
  const { data: settings }    = useQuery({ queryKey: ['public-settings'], queryFn: () => api.getPublicSettings() })
  const publicKey = settings?.payment_pagarme_public_key

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function pagar() {
    if (pagando) return
    setErro('')
    if (!publicKey) { setErro('Pagamento por cartão indisponível no momento.'); return }
    if (!form.number || !form.holder || !form.expMonth || !form.expYear || !form.cvv) {
      setErro('Preencha todos os dados do cartão.'); return
    }
    setPagando(true)
    try {
      const token = await tokenizar(publicKey, form)
      const resp = await api.parkingPay(id, { card_token: token, idempotency_key: idemKey })
      if (resp?.ok || resp?.already) {
        navigate('/minhas-reservas', { replace: true })
      } else {
        setErro('Pagamento não aprovado. Tente outro cartão.')
      }
    } catch (e) {
      setErro(e?.message || 'Não foi possível concluir o pagamento.')
    } finally {
      setPagando(false)
    }
  }

  if (isLoading) return <p className="p-6 text-center text-gray-400 text-sm">Carregando…</p>
  if (!r) return <p className="p-6 text-center text-gray-400 text-sm">Reserva não encontrada.</p>

  const podePagar = r.status === 'accepted_awaiting_payment' && r.payment_status !== 'paid'

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95">
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Pagamento</h1>
      </header>

      <main className="px-4 pt-4 space-y-3">
        {/* Resumo */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">Estacionamento · {r.code}</p>
            <p className="text-[15px] font-bold text-gray-900">{r.units} diária(s)</p>
          </div>
          <p className="text-[18px] font-extrabold text-brand">{fmt(r.total_amount)}</p>
        </div>

        {!podePagar ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] text-amber-700">
            Esta reserva não está liberada para pagamento.
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2"><CreditCard size={16} /> Pagar com cartão</p>
            <input value={form.number} onChange={(e) => setF('number', e.target.value)} inputMode="numeric"
              placeholder="Número do cartão" className="w-full border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
            <input value={form.holder} onChange={(e) => setF('holder', e.target.value)}
              placeholder="Nome impresso no cartão" className="w-full border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
            <div className="grid grid-cols-3 gap-2">
              <input value={form.expMonth} onChange={(e) => setF('expMonth', e.target.value)} inputMode="numeric"
                placeholder="MM" maxLength={2} className="border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
              <input value={form.expYear} onChange={(e) => setF('expYear', e.target.value)} inputMode="numeric"
                placeholder="AAAA" maxLength={4} className="border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
              <input value={form.cvv} onChange={(e) => setF('cvv', e.target.value)} inputMode="numeric"
                placeholder="CVV" maxLength={4} className="border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
            </div>
            {erro && <p className="text-[12px] text-red-500">{erro}</p>}
            <button onClick={pagar} disabled={pagando}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60">
              {pagando ? <><Loader2 size={17} className="animate-spin" /> Processando…</> : <>Pagar {fmt(r.total_amount)}</>}
            </button>
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-500" /> Pagamento seguro. O cartão vai direto ao provedor.</p>
          </div>
        )}
      </main>
    </div>
  )
}
