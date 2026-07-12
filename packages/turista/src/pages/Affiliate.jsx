import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone, Copy, Check, Loader2, Wallet, Clock, ChevronLeft, Sparkles, Share2, TrendingUp,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { format, subDays, subMonths, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmtBRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const fmtShort = (v) => Number(v) >= 1000
  ? `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  : `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

/* ── Gráfico "Comissões diárias" (15 dias) ──────────────────────
   Série única na cor da marca: barras finas com topo arredondado ancoradas
   na base, grade recessiva, rótulo direto só no pico e tooltip por toque.
   O extrato logo abaixo é a visão em tabela dos mesmos dados. */
function DailyChart({ days }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Comissões por dia nos últimos 15 dias">
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
      value: commissions
        .filter((c) => (c.created_at || '').slice(0, 10) === iso)
        .reduce((s2, c) => s2 + Number(c.commission_amount || 0), 0),
    }
  })
  const last15Total = Math.round(days.reduce((s2, d) => s2 + d.value, 0) * 100) / 100
  const monthChips = [1, 2].map((m) => {
    const ref = subMonths(today, m)
    const tot = commissions
      .filter((c) => c.created_at && isSameMonth(new Date(c.created_at), ref))
      .reduce((s2, c) => s2 + Number(c.commission_amount || 0), 0)
    return { label: format(ref, 'MMM', { locale: ptBR }).replace('.', ''), total: Math.round(tot * 100) / 100 }
  })
  const allTotal   = commissions.reduce((s2, c) => s2 + Number(c.commission_amount || 0), 0)
  const ticketMedio = commissions.length ? allTotal / commissions.length : 0
  const link = code ? `${window.location.origin}/a/${code}` : null
  const shareText = code
    ? `Bora conhecer Jericoacoara? 🌴 Reserve passeios e transfers pelo Turiva com o meu link: ${link}`
    : ''

  function copy(text, which) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    }).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-4 shadow-sm">
        <div className="relative flex items-center justify-center min-h-[32px]">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Voltar"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[20px] text-gray-900 tracking-wide">Divulgou, Ganhou</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-[430px] mx-auto">
        {/* Hero (marketing — some quando o painel assume) */}
        {(!code || isLoading) && (
        <div className="bg-gradient-to-br from-brand to-amber-400 rounded-3xl p-5 text-white relative overflow-hidden">
          <Sparkles size={72} className="absolute -right-3 -top-3 text-white/15" />
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <Megaphone size={20} className="text-white" />
          </div>
          <p className="text-[18px] font-extrabold leading-tight">Indique amigos e ganhe {percent}% de cada reserva paga 🤑</p>
          <p className="text-[12px] text-white/85 mt-1.5 leading-relaxed">
            Compartilhe seu link. Quem entrar por ele fica ligado a você por 30 dias —
            toda reserva paga vira comissão sua, repassada via PIX em até 7 dias.
          </p>
        </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="text-brand animate-spin" /></div>
        ) : !code ? (
          /* Ainda não ativou */
          <button
            onClick={() => activate.mutate()}
            disabled={activate.isPending}
            className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {activate.isPending
              ? <><Loader2 size={16} className="animate-spin" /> Ativando…</>
              : <>Ativar meu link de afiliado</>}
          </button>
        ) : (
          <>
            {/* ── Painel do afiliado ───────────────────────── */}
            <div className="bg-gradient-to-br from-brand to-amber-400 rounded-3xl p-5 text-white relative overflow-hidden -mt-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/85">Comissões em 15 dias</p>
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

            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Indicações</p>
                <p className="text-[16px] font-extrabold text-gray-900 mt-0.5">{commissions.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">A receber</p>
                <p className="text-[15px] font-extrabold text-amber-600 mt-0.5">{fmtShort(data?.totals?.pending || 0)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 px-3 py-3 text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ticket médio</p>
                <p className="text-[15px] font-extrabold text-gray-900 mt-0.5">{fmtShort(ticketMedio)}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={15} className="text-brand" />
                <p className="text-[14px] font-bold text-gray-900">Comissões diárias</p>
              </div>
              {last15Total > 0 ? (
                <DailyChart days={days} />
              ) : (
                <p className="text-[12px] text-gray-400 py-6 text-center">
                  Sem comissões nos últimos 15 dias — compartilhe seu link pra movimentar o gráfico 📈
                </p>
              )}
            </div>

            {/* Link + código */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Seu link</p>
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="flex-1 text-[12.5px] font-semibold text-gray-800 truncate">{link}</p>
                <button onClick={() => copy(link, 'link')} aria-label="Copiar link"
                  className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 active:scale-95">
                  {copied === 'link' ? <Check size={14} className="text-emerald-500" /> : <Copy size={13} className="text-gray-500" />}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Seu código</p>
                  <p className="text-[17px] font-extrabold text-gray-900 tracking-widest">{code}</p>
                </div>
                <button onClick={() => copy(code, 'code')}
                  className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 text-[12px] font-bold px-3 py-2 rounded-xl active:scale-95">
                  {copied === 'code' ? <Check size={13} className="text-emerald-500" /> : <Copy size={12} />} Copiar
                </button>
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank" rel="noreferrer"
                className="w-full bg-[#25D366] text-white font-bold rounded-2xl py-3.5 text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Share2 size={15} /> Compartilhar no WhatsApp
              </a>
            </div>

            {/* Totais */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 text-amber-500 mb-1"><Clock size={13} /><p className="text-[11px] font-bold uppercase tracking-wide">A receber</p></div>
                <p className="text-[18px] font-extrabold text-gray-900">{fmtBRL(data?.totals?.pending)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-1.5 text-emerald-500 mb-1"><Wallet size={13} /><p className="text-[11px] font-bold uppercase tracking-wide">Já recebido</p></div>
                <p className="text-[18px] font-extrabold text-gray-900">{fmtBRL(data?.totals?.paid)}</p>
              </div>
            </div>

            {/* Comissões */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Suas comissões</p>
              {(data?.commissions || []).length === 0 ? (
                <p className="text-[12.5px] text-gray-400 px-4 pb-4">
                  Nenhuma ainda — compartilhe seu link! Quando uma reserva indicada for paga, a comissão aparece aqui.
                </p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {data.commissions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800">
                          {c.bookings?.booking_code || 'Reserva'} · {c.bookings?.service_type === 'transfer' ? 'Translado' : 'Passeio'}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {c.created_at ? format(new Date(c.created_at), "d 'de' MMM", { locale: ptBR }) : ''}
                          {c.payout_status !== 'paid' && c.payout_due_date
                            ? ` · repasse até ${format(new Date(`${c.payout_due_date}T12:00:00`), 'dd/MM', { locale: ptBR })}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-[14px] font-extrabold text-gray-900">{fmtBRL(c.commission_amount)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          c.payout_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {c.payout_status === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Como funciona */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Como funciona</p>
          <ol className="space-y-2 text-[12.5px] text-gray-600 leading-relaxed list-decimal list-inside">
            <li>Ative seu link e compartilhe com amigos e seguidores.</li>
            <li>Quem abrir o link (ou usar seu código) fica ligado a você por 30 dias.</li>
            <li>Cada reserva paga gera <b>{percent}% de comissão</b> para você.</li>
            <li>O repasse é feito via <b>PIX em até 7 dias</b>.</li>
          </ol>
          <p className="text-[11px] text-gray-400 mt-2">
            ⚠️ Seu link e seu código valem só para <b>outras pessoas</b> — usar nas
            suas próprias reservas não gera comissão.
          </p>
        </div>
      </div>
    </div>
  )
}
