import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, CreditCard, ShieldCheck, Loader2, Clock } from 'lucide-react'
import { api } from '../lib/api'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const soDigitos = (s) => String(s || '').replace(/\D/g, '')
const dt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s } }

// Valor para <input type="datetime-local"> no fuso local do dispositivo.
function paraInputLocal(iso) {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
// Monta ISO com offset de Fortaleza (−03:00), igual ao resto do estacionamento.
function paraIsoFortaleza(local) {
  if (!local) return null
  return `${local}:00-03:00`
}

async function tokenizar(publicKey, card) {
  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card', card: {
      number: soDigitos(card.number), holder_name: card.holder.trim(),
      exp_month: Number(card.expMonth), exp_year: Number(card.expYear), cvv: card.cvv,
    } }),
  })
  let data = null; try { data = await res.json() } catch {}
  if (!res.ok || !data?.id) throw new Error(data?.message || 'Confira os dados do cartão (número, validade e CVV).')
  return data.id
}

export default function EstacionamentoEstender() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [novoFim, setNovoFim] = useState('')
  const [cotacao, setCotacao] = useState(null) // { delta, new_total, units }
  const [cotando, setCotando] = useState(false)
  const [form, setForm] = useState({ number: '', holder: '', expMonth: '', expYear: '', cvv: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const idemKey = useMemo(() => `park-ext-${id}-${(crypto?.randomUUID?.() || Date.now())}`, [id])

  const { data: r, isLoading } = useQuery({ queryKey: ['parking-res', id], queryFn: () => api.parkingReservation(id) })
  const { data: settings }    = useQuery({ queryKey: ['public-settings'], queryFn: () => api.getPublicSettings() })
  const publicKey = settings?.payment_pagarme_public_key

  // Inicializa o seletor 1h após o fim atual quando a reserva carrega.
  useEffect(() => {
    if (r?.end_at && !novoFim) setNovoFim(paraInputLocal(new Date(new Date(r.end_at).getTime() + 3600_000)))
  }, [r]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recalcula a diferença no servidor sempre que o novo fim muda.
  useEffect(() => {
    const isoNovo = paraIsoFortaleza(novoFim)
    if (!isoNovo || !r) { setCotacao(null); return }
    if (Date.parse(isoNovo) <= Date.parse(r.end_at)) { setCotacao(null); setErro(''); return }
    let vivo = true
    setCotando(true); setErro('')
    api.parkingExtendQuote(id, { new_end_at: isoNovo })
      .then((c) => { if (vivo) setCotacao(c) })
      .catch((e) => { if (vivo) { setCotacao(null); setErro(e?.message || 'Não foi possível cotar a extensão.') } })
      .finally(() => { if (vivo) setCotando(false) })
    return () => { vivo = false }
  }, [novoFim, r, id])

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const precisaCartao = (cotacao?.delta || 0) > 0

  async function estender() {
    if (enviando) return
    setErro('')
    const isoNovo = paraIsoFortaleza(novoFim)
    if (!isoNovo) { setErro('Escolha o novo horário de saída.'); return }
    setEnviando(true)
    try {
      let cardToken
      if (precisaCartao) {
        if (!publicKey) { setErro('Pagamento por cartão indisponível no momento.'); setEnviando(false); return }
        if (!form.number || !form.holder || !form.expMonth || !form.expYear || !form.cvv) {
          setErro('Preencha os dados do cartão para pagar a diferença.'); setEnviando(false); return
        }
        cardToken = await tokenizar(publicKey, form)
      }
      const resp = await api.parkingExtend(id, { new_end_at: isoNovo, card_token: cardToken, idempotency_key: idemKey })
      if (resp?.ok) navigate('/minhas-reservas', { replace: true })
      else setErro('Não foi possível estender. Tente outro horário.')
    } catch (e) {
      setErro(e?.message || 'Não foi possível concluir a extensão.')
    } finally { setEnviando(false) }
  }

  if (isLoading) return <p className="p-6 text-center text-gray-400 text-sm">Carregando…</p>
  if (!r) return <p className="p-6 text-center text-gray-400 text-sm">Reserva não encontrada.</p>
  const podeEstender = ['confirmed', 'in_lot'].includes(r.status) && r.payment_status === 'paid'

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95">
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Estender estadia</h1>
      </header>

      <main className="px-4 pt-4 space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-[11px] text-gray-400">Estacionamento · {r.code}</p>
          <p className="text-[13px] text-gray-600 flex items-center gap-1.5 mt-1"><Clock size={13} className="text-brand" /> Saída atual: {dt(r.end_at)}</p>
        </div>

        {!podeEstender ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] text-amber-700">
            Só é possível estender uma reserva confirmada ou com o carro no pátio.
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <label className="text-[13px] font-semibold text-gray-700">Novo horário de saída</label>
              <input type="datetime-local" value={novoFim} min={paraInputLocal(r.end_at)}
                onChange={(e) => setNovoFim(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
              {cotando && <p className="text-[12px] text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Calculando diferença…</p>}
              {cotacao && (
                <div className="mt-1 text-[13px] space-y-1">
                  <div className="flex items-center justify-between text-gray-500"><span>Novo total</span><span className="font-semibold text-gray-800">{fmt(cotacao.new_total)}</span></div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100"><span className="font-semibold text-gray-700">Diferença a pagar</span><span className="font-extrabold text-brand">{fmt(cotacao.delta)}</span></div>
                </div>
              )}
            </div>

            {precisaCartao && (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2"><CreditCard size={16} /> Pagar a diferença</p>
                <input value={form.number} onChange={(e) => setF('number', e.target.value)} inputMode="numeric" placeholder="Número do cartão" className="w-full border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
                <input value={form.holder} onChange={(e) => setF('holder', e.target.value)} placeholder="Nome impresso no cartão" className="w-full border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={form.expMonth} onChange={(e) => setF('expMonth', e.target.value)} inputMode="numeric" placeholder="MM" maxLength={2} className="border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
                  <input value={form.expYear} onChange={(e) => setF('expYear', e.target.value)} inputMode="numeric" placeholder="AAAA" maxLength={4} className="border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
                  <input value={form.cvv} onChange={(e) => setF('cvv', e.target.value)} inputMode="numeric" placeholder="CVV" maxLength={4} className="border border-gray-200 rounded-lg px-3 h-11 text-sm outline-none focus:border-brand" />
                </div>
              </div>
            )}

            {erro && <p className="text-[12px] text-red-500">{erro}</p>}
            <button onClick={estender} disabled={enviando || cotando || !cotacao}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60">
              {enviando ? <><Loader2 size={17} className="animate-spin" /> Processando…</>
                : precisaCartao ? <>Pagar {fmt(cotacao?.delta)} e estender</> : <>Confirmar extensão</>}
            </button>
            {precisaCartao && <p className="text-[11px] text-gray-400 flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-500" /> Pagamento seguro. O cartão vai direto ao provedor.</p>}
          </>
        )}
      </main>
    </div>
  )
}
