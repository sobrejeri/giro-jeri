import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Megaphone, Copy, Check, Loader2, Wallet, Clock, ChevronLeft, Sparkles, Share2, TrendingUp, KeyRound, AlertTriangle,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { format, subDays, subMonths, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmtBRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const fmtShort = (v) => Number(v) >= 1000
  ? `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  : `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

/* ── Chave PIX de recebimento ───────────────────────────────────
   O afiliado cadastra a chave aqui e ela aparece direto para o admin na
   tela de repasses — o PIX sai sem ninguém precisar entrar em contato. */
function PixCard({ pixKey, pixType, hasPending, onSaved }) {
  const { t } = useTranslation()
  const PIX_TYPES = [
    { id: 'cpf',    label: t('affiliatePg.pixType.cpf') },
    { id: 'phone',  label: t('affiliatePg.pixType.phone') },
    { id: 'email',  label: t('affiliatePg.pixType.email') },
    { id: 'random', label: t('affiliatePg.pixType.random') },
  ]
  const [editing, setEditing] = useState(!pixKey)
  const [type, setType] = useState(pixType || 'cpf')
  const [key, setKey]   = useState(pixKey || '')
  const [err, setErr]   = useState('')

  const save = useMutation({
    mutationFn: () => api.affiliateSavePix({ pix_key: key.trim(), pix_key_type: type }),
    onSuccess:  () => { setErr(''); setEditing(false); onSaved() },
    onError:    (e) => setErr(e?.message || t('affiliatePg.pixSaveError')),
  })

  const typeLabel = PIX_TYPES.find((pt) => pt.id === (pixType || type))?.label || ''

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound size={14} className="text-brand" />
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide flex-1">{t('affiliatePg.pixLabel')}</p>
        {pixKey && !editing && (
          <button onClick={() => { setEditing(true); setKey(pixKey); setType(pixType || 'cpf') }}
            className="text-[12px] font-bold text-brand underline">{t('affiliatePg.change')}</button>
        )}
      </div>

      {!pixKey && hasPending && !editing && null}
      {hasPending && !pixKey && (
        <p className="text-[11.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          {t('affiliatePg.pixPendingWarning')}
        </p>
      )}

      {!editing && pixKey ? (
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
          <p className="flex-1 text-[13px] font-semibold text-gray-800 truncate">{pixKey}</p>
          <span className="text-[10px] font-bold text-gray-400 uppercase bg-white border border-gray-200 rounded-md px-1.5 py-0.5 shrink-0">{typeLabel}</span>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            {PIX_TYPES.map((pt) => (
              <button key={pt.id} onClick={() => { setType(pt.id); setErr('') }}
                className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors ${
                  type === pt.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                {pt.label}
              </button>
            ))}
          </div>
          <input
            value={key}
            onChange={(e) => { setKey(e.target.value); setErr('') }}
            inputMode={type === 'cpf' || type === 'phone' ? 'numeric' : 'text'}
            placeholder={
              type === 'cpf'   ? t('affiliatePg.pixPlaceholder.cpf')
              : type === 'phone' ? t('affiliatePg.pixPlaceholder.phone')
              : type === 'email' ? t('affiliatePg.pixPlaceholder.email')
              : t('affiliatePg.pixPlaceholder.random')}
            className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-800 outline-none focus:ring-2 focus:ring-brand/30"
          />
          {err && <p className="text-[11px] text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => save.mutate()}
              disabled={!key.trim() || save.isPending}
              className="flex-1 bg-brand text-white font-bold rounded-xl py-2.5 text-[13px] active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {save.isPending ? t('affiliatePg.saving') : t('affiliatePg.saveKey')}
            </button>
            {pixKey && (
              <button onClick={() => { setEditing(false); setErr('') }}
                className="px-4 border border-gray-200 text-gray-500 font-bold rounded-xl text-[13px]">
                {t('affiliatePg.cancel')}
              </button>
            )}
          </div>
        </>
      )}
      <p className="text-[10.5px] text-gray-400">
        {t('affiliatePg.pixVisibilityNote')}
      </p>
    </div>
  )
}

/* ── Gráfico "Comissões diárias" (15 dias) ──────────────────────
   Série única na cor da marca: barras finas com topo arredondado ancoradas
   na base, grade recessiva, rótulo direto só no pico e tooltip por toque.
   O extrato logo abaixo é a visão em tabela dos mesmos dados. */
function DailyChart({ days }) {
  const { t } = useTranslation()
  const [sel, setSel] = useState(null)
  const W = 340, H = 170, PL = 40, PB = 20, PT = 16
  const plotW = W - PL - 6, plotH = H - PT - PB
  const rawMax = Math.max(...days.map((d) => d.value), 0)
  // teto "bonito": 1/2/5 × 10^n acima do maior valor (mínimo R$ 50)
  const niceMax = (() => {
    if (rawMax <= 0) return 50
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)))
    for (const m of [1, 2, 5, 10]) if (m * pow >= rawMax) return m * pow
    return 10 * pow
  })()
  const y = (v) => PT + plotH - (v / niceMax) * plotH
  const bw = plotW / days.length
  const barW = Math.max(6, Math.min(14, bw - 4))
  const maxIdx = rawMax > 0 ? days.findIndex((d) => d.value === rawMax) : -1

  // barra com topo arredondado (raio 3) ancorada na base
  const bar = (x, v) => {
    const h = Math.max(0, y(0) - y(v)); if (h <= 0) return null
    const r = Math.min(3, h, barW / 2)
    return `M ${x} ${y(0)} v ${-(h - r)} a ${r} ${r} 0 0 1 ${r} ${-r} h ${barW - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - r} Z`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('affiliatePg.chartAriaLabel')}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PL} x2={W - 6} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="#f1f2f4" strokeWidth="1" />
          <text x={PL - 5} y={y(niceMax * f) + 3} textAnchor="end" fontSize="8.5" fill="#9ca3af">
            {fmtShort(niceMax * f)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = PL + i * bw + (bw - barW) / 2
        const path = bar(x, d.value)
        return (
          <g key={d.iso}>
            {path && <path d={path} fill="#FF6A00" opacity={sel == null || sel === i ? 1 : 0.45} />}
            {/* alvo de toque maior que a barra */}
            <rect
              x={PL + i * bw} y={PT} width={bw} height={plotH + PB}
              fill="transparent"
              onClick={() => setSel(sel === i ? null : i)}
            />
            {i % 3 === 0 && (
              <text x={PL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="8" fill="#9ca3af">
                {d.label}
              </text>
            )}
            {sel === null && i === maxIdx && (
              <text x={x + barW / 2} y={y(d.value) - 4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#374151">
                {fmtShort(d.value)}
              </text>
            )}
          </g>
        )
      })}
      {sel != null && (() => {
        const d = days[sel]
        const cx = Math.min(Math.max(PL + sel * bw + bw / 2, PL + 34), W - 40)
        return (
          <g pointerEvents="none">
            <rect x={cx - 34} y={PT - 14} width="68" height="24" rx="6" fill="#111827" opacity="0.92" />
            <text x={cx} y={PT - 4} textAnchor="middle" fontSize="8" fill="#d1d5db">{d.full}</text>
            <text x={cx} y={PT + 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffffff">{fmtBRL(d.value)}</text>
          </g>
        )
      })()}
    </svg>
  )
}

// Página do programa de afiliados "DIVULGOU, GANHOU": qualquer usuário logado
// ativa o próprio link com 1 toque, compartilha no WhatsApp e acompanha as
// comissões (5% sobre reservas pagas de quem ele indicou; repasse manual via
// PIX em até 7 dias). O próprio link/código não vale para o dono.
export default function Affiliate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(null) // 'link' | 'code'

  const { data, isLoading } = useQuery({
    queryKey: ['affiliate-me'],
    queryFn:  () => api.affiliateMe(),
    enabled:  !!token,
    staleTime: 60 * 1000,
  })

  const activate = useMutation({
    mutationFn: () => api.affiliateActivate(),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['affiliate-me'] }),
  })

  if (!token) return <Navigate to="/login" state={{ from: '/afiliado' }} replace />

  const code = data?.code || null
  const percent = Number(data?.percent) || 5
  const commissions = data?.commissions || []
  // Comissões que ainda VALEM dinheiro: as canceladas (reserva cancelada, sem
  // serviço prestado) continuam no extrato para transparência, mas não entram
  // em nenhum total/gráfico — senão o afiliado veria ganhos que não existem.
  const earning = commissions.filter((c) => c.payout_status !== 'cancelled')

  // Painel: últimos 15 dias (hero + gráfico), meses anteriores (chips),
  // indicações e ticket médio — tudo derivado do extrato.
  const today = new Date()
  const days = [...Array(15)].map((_, i) => {
    const d = subDays(today, 14 - i)
    const iso = format(d, 'yyyy-MM-dd')
    return {
      iso,
      label: format(d, 'dd/MM'),
      full:  format(d, "d 'de' MMM", { locale: ptBR }),
      value: earning
        .filter((c) => (c.created_at || '').slice(0, 10) === iso)
        .reduce((s2, c) => s2 + Number(c.commission_amount || 0), 0),
    }
  })
  const last15Total = Math.round(days.reduce((s2, d) => s2 + d.value, 0) * 100) / 100
  const monthChips = [1, 2].map((m) => {
    const ref = subMonths(today, m)
    const tot = earning
      .filter((c) => c.created_at && isSameMonth(new Date(c.created_at), ref))
      .reduce((s2, c) => s2 + Number(c.commission_amount || 0), 0)
    return { label: format(ref, 'MMM', { locale: ptBR }).replace('.', ''), total: Math.round(tot * 100) / 100 }
  })
  const allTotal   = earning.reduce((s2, c) => s2 + Number(c.commission_amount || 0), 0)
  const ticketMedio = earning.length ? allTotal / earning.length : 0
  // BASE_URL cobre o deploy em subcaminho (GitHub Pages: /giro-jeri/) — sem
  // ele o link cairia em sobrejeri.github.io/a/... (404 fora do app).
  const link = code ? `${window.location.origin}${import.meta.env.BASE_URL}a/${code}` : null
  const shareText = code
    ? t('affiliatePg.shareText', { link })
    : ''

  function copy(text, which) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-4 shadow-sm">
        <div className="relative flex items-center justify-center min-h-[32px]">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label={t('affiliatePg.back')}
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[20px] text-gray-900 tracking-wide">{t('affiliatePg.title')}</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[430px] mx-auto lg:max-w-5xl lg:space-y-6">
        {/* Hero (marketing — some quando o painel assume) */}
        {(!code || isLoading) && (
        <div className="bg-gradient-to-br from-brand to-amber-400 rounded-3xl p-5 text-white relative overflow-hidden lg:max-w-lg lg:mx-auto">
          <Sparkles size={72} className="absolute -right-3 -top-3 text-white/15" />
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <Megaphone size={20} className="text-white" />
          </div>
          <p className="text-[18px] font-extrabold leading-tight">{t('affiliatePg.heroTitle', { percent })}</p>
          <p className="text-[12px] text-white/85 mt-1.5 leading-relaxed">
            {t('affiliatePg.heroDesc')}
          </p>
        </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="text-brand animate-spin" /></div>
        ) : !code ? (
          /* Ainda não ativou */
          <div className="space-y-2 lg:max-w-lg lg:mx-auto">
            <button
              onClick={() => activate.mutate()}
              disabled={activate.isPending}
              className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {activate.isPending
                ? <><Loader2 size={16} className="animate-spin" /> {t('affiliatePg.activating')}</>
                : activate.isError
                  ? <>{t('affiliatePg.tryAgain')}</>
                  : <>{t('affiliatePg.activateButton')}</>}
            </button>
            {activate.isError && (
              <p className="text-[12px] text-red-500 bg-red-50 rounded-xl px-3.5 py-2.5 text-center">
                {activate.error?.message || t('affiliatePg.activateError')}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* ── Painel do afiliado ───────────────────────── */}
            <div className="bg-gradient-to-br from-brand to-amber-400 rounded-3xl p-5 text-white relative overflow-hidden -mt-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/85">{t('affiliatePg.commissions15Days')}</p>
                  <p className="text-[32px] font-extrabold leading-tight mt-1">{fmtBRL(last15Total)}</p>
                </div>
                <span className="text-[30px] leading-none mt-1">🪙</span>
              </div>
              <div className="flex gap-2 mt-3">
                {monthChips.map((m) => (
                  <span key={m.label} className="bg-black/25 rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize">
                    {m.label}: <span className="font-extrabold">{fmtBRL(m.total)}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Desktop: 2 colunas lado a lado; no mobile os dois blocos
                empilham na MESMA ordem de antes (esquerda = 3 primeiros,
                direita = 3 últimos), então a versão mobile fica idêntica. */}
            <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            {/* Coluna esquerda: visão geral, gráfico e link */}
            <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('affiliatePg.referrals')}</p>
                <p className="text-[16px] font-extrabold text-gray-900 mt-0.5">{earning.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('affiliatePg.pending')}</p>
                <p className="text-[15px] font-extrabold text-amber-600 mt-0.5">{fmtShort(data?.totals?.pending || 0)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('affiliatePg.avgTicket')}</p>
                <p className="text-[15px] font-extrabold text-gray-900 mt-0.5">{fmtShort(ticketMedio)}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={15} className="text-brand" />
                <p className="text-[14px] font-bold text-gray-900">{t('affiliatePg.dailyCommissions')}</p>
              </div>
              {last15Total > 0 ? (
                <DailyChart days={days} />
              ) : (
                <p className="text-[12px] text-gray-400 py-6 text-center">
                  {t('affiliatePg.noCommissions15d')}
                </p>
              )}
            </div>

            {/* Link + código */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{t('affiliatePg.yourLink')}</p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="flex-1 text-[12.5px] font-semibold text-gray-800 truncate">{link}</p>
                <button onClick={() => copy(link, 'link')} aria-label={t('affiliatePg.copyLink')}
                  className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 active:scale-95">
                  {copied === 'link' ? <Check size={14} className="text-emerald-500" /> : <Copy size={13} className="text-gray-500" />}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{t('affiliatePg.yourCode')}</p>
                  <p className="text-[17px] font-extrabold text-gray-900 tracking-widest">{code}</p>
                </div>
                <button onClick={() => copy(code, 'code')}
                  className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 text-[12px] font-bold px-3 py-2 rounded-xl active:scale-95">
                  {copied === 'code' ? <Check size={13} className="text-emerald-500" /> : <Copy size={12} />} {t('affiliatePg.copy')}
                </button>
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank" rel="noreferrer"
                className="w-full bg-[#25D366] text-white font-bold rounded-2xl py-3.5 text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Share2 size={15} /> {t('affiliatePg.shareWhatsapp')}
              </a>
            </div>
            </div>{/* fim coluna esquerda */}

            {/* Coluna direita: financeiro (totais, PIX e comissões) */}
            <div className="space-y-4">
            {/* Totais */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 text-amber-500 mb-1"><Clock size={13} /><p className="text-[11px] font-bold uppercase tracking-wide">{t('affiliatePg.pending')}</p></div>
                <p className="text-[18px] font-extrabold text-gray-900">{fmtBRL(data?.totals?.pending)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 text-emerald-500 mb-1"><Wallet size={13} /><p className="text-[11px] font-bold uppercase tracking-wide">{t('affiliatePg.received')}</p></div>
                <p className="text-[18px] font-extrabold text-gray-900">{fmtBRL(data?.totals?.paid)}</p>
              </div>
            </div>

            {/* Chave PIX de recebimento */}
            <PixCard
              pixKey={data?.pix_key || null}
              pixType={data?.pix_key_type || null}
              hasPending={(data?.totals?.pending || 0) > 0}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['affiliate-me'] })}
            />

            {/* Comissões */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('affiliatePg.yourCommissions')}</p>
              {(data?.commissions || []).length === 0 ? (
                <p className="text-[12.5px] text-gray-400 px-4 pb-4">
                  {t('affiliatePg.noCommissionsYet')}
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.commissions.map((c) => {
                    // 3 estados: paga · cancelada (reserva cancelada, serviço não
                    // realizado — não entra no repasse) · pendente.
                    const isPaid      = c.payout_status === 'paid'
                    const isCancelled = c.payout_status === 'cancelled'
                    return (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className={`text-[13px] font-semibold ${isCancelled ? 'text-gray-400' : 'text-gray-800'}`}>
                          {c.bookings?.booking_code || t('affiliatePg.reservationFallback')} · {c.bookings?.service_type === 'transfer' ? t('affiliatePg.serviceTransfer') : t('affiliatePg.serviceTour')}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {c.created_at ? format(new Date(c.created_at), "d 'de' MMM", { locale: ptBR }) : ''}
                          {isCancelled
                            ? t('affiliatePg.cancelledNote')
                            : (!isPaid && c.payout_due_date
                                ? t('affiliatePg.payoutDueLabel', { date: format(new Date(`${c.payout_due_date}T12:00:00`), 'dd/MM', { locale: ptBR }) })
                                : '')}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={`text-[14px] font-extrabold ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{fmtBRL(c.commission_amount)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isPaid ? 'bg-emerald-50 text-emerald-600'
                          : isCancelled ? 'bg-gray-100 text-gray-500'
                          : 'bg-amber-50 text-amber-600'
                        }`}>
                          {isPaid ? t('affiliatePg.paid')
                            : isCancelled ? t('affiliatePg.cancelledStatus')
                            : t('affiliatePg.pendingStatus')}
                        </span>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
            </div>{/* fim coluna direita */}
            </div>{/* fim grid desktop */}
          </>
        )}

        {/* Como funciona */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 lg:max-w-2xl lg:mx-auto">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">{t('affiliatePg.howItWorks')}</p>
          <ol className="space-y-2 text-[12.5px] text-gray-600 leading-relaxed list-decimal list-inside">
            <li>{t('affiliatePg.step1')}</li>
            <li>{t('affiliatePg.step2')}</li>
            <li>{t('affiliatePg.step3.pre')}<b>{t('affiliatePg.step3.bold', { percent })}</b>{t('affiliatePg.step3.post')}</li>
            <li>{t('affiliatePg.step4.pre')}<b>{t('affiliatePg.step4.bold')}</b>{t('affiliatePg.step4.post')}</li>
          </ol>
          <p className="text-[11px] text-gray-400 mt-2">
            {t('affiliatePg.ownerWarning.pre')}<b>{t('affiliatePg.ownerWarning.bold')}</b>{t('affiliatePg.ownerWarning.post')}
          </p>
        </div>
      </div>
    </div>
  )
}
