import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone, Copy, Check, Loader2, Wallet, Clock, ChevronLeft, Sparkles, Share2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmtBRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

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
        {/* Hero */}
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
