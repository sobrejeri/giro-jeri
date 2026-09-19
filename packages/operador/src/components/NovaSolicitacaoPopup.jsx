import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Users, MapPin, Check, X, BellRing } from 'lucide-react'
import { api } from '../lib/api'

// ── Pop-up flutuante de NOVA SOLICITAÇÃO ────────────────────────────────────
//
// Aparece em QUALQUER tela do operador (montado no Layout) quando entra uma
// solicitação aguardando aceite. "Recusar" NÃO cancela a corrida — o modelo é
// primeiro-a-aceitar, então recusar só some com o aviso PARA ESTE operador
// (guardado no localStorage, para não voltar a piscar a cada polling). Quem
// aceita de verdade é o botão Aceitar; se outro operador pegar antes, o item
// simplesmente sai do feed.
//
// Reusa a MESMA query da tela de Reservas (['operator-bookings']) — então não
// há polling em dobro: nas outras telas, este componente é quem mantém o feed
// atualizado; na de Reservas, os dois compartilham o cache.

const CHAVE_DISPENSADAS = 'girojeri_op_solicitacoes_dispensadas'

function idDoItem(it) {
  return it.kind === 'leg' ? it.leg_id : it.id
}

function lerDispensadas() {
  try {
    const arr = JSON.parse(localStorage.getItem(CHAVE_DISPENSADAS) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function gravarDispensadas(ids) {
  try {
    // Guarda só as últimas 200 — o localStorage não é um histórico.
    localStorage.setItem(CHAVE_DISPENSADAS, JSON.stringify(ids.slice(-200)))
  } catch { /* modo privado / bloqueado — o aviso só volta a aparecer, sem quebrar */ }
}

const fmtBRL = (v) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function NovaSolicitacaoPopup() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [dispensadas, setDispensadas] = useState(lerDispensadas)
  const [acao, setAcao] = useState(null)   // { id, tipo:'aceitar' } enquanto processa
  const [aviso, setAviso] = useState(null) // mensagem curta após aceitar/erro

  const { data } = useQuery({
    queryKey:        ['operator-bookings'],
    queryFn:         () => api.getOperatorBookings(),
    refetchInterval: 6000,
    staleTime:       3000,
  })

  const pendentes = useMemo(() => {
    const lista = data?.pending || []
    const vistas = new Set(dispensadas)
    return lista.filter((it) => !vistas.has(idDoItem(it)))
  }, [data, dispensadas])

  const atual = pendentes[0]
  const restantes = pendentes.length - 1

  function dispensar(item) {
    const nova = [...dispensadas, idDoItem(item)]
    setDispensadas(nova)
    gravarDispensadas(nova)
  }

  async function aceitar(item) {
    if (acao) return
    const isLeg = item.kind === 'leg'
    const id = idDoItem(item)
    setAcao({ id, tipo: 'aceitar' })
    setAviso(null)
    try {
      if (isLeg) await api.acceptLeg(id)
      else       await api.acceptBooking(id)
      qc.invalidateQueries({ queryKey: ['operator-bookings'] })
      setAviso({ tipo: 'ok', texto: 'Solicitação aceita! Aguardando o cliente pagar.' })
      setTimeout(() => setAviso(null), 3500)
      // Não precisa dispensar: aceita, ela sai de `pending` no próximo feed.
      // Leva direto às Solicitações, já na aba "Minhas corridas".
      navigate('/reservas?tab=mine')
    } catch (err) {
      const jaAceita = err?.message?.includes('já foi aceita') || err?.status === 409
      qc.invalidateQueries({ queryKey: ['operator-bookings'] })
      setAviso({
        tipo: 'erro',
        texto: jaAceita ? 'Outro operador aceitou antes de você.' : (err?.message || 'Não foi possível aceitar.'),
      })
      setTimeout(() => setAviso(null), 4000)
      // Some com o card: já aceita por outro, ou erro — não adianta insistir aqui.
      dispensar(item)
    } finally {
      setAcao(null)
    }
  }

  if (!atual && !aviso) return null

  const tipo   = atual?.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const isLeg  = atual?.kind === 'leg'
  const modo   = isLeg ? (atual?.vehicle_name || 'Privativo')
                       : (atual?.booking_mode === 'private' ? 'Privativo' : 'Compartilhado')
  const pessoas = isLeg ? atual?.pax_count : atual?.people_count
  const valor   = isLeg ? atual?.leg_price : atual?.total_amount
  const processando = acao?.id === (atual && idDoItem(atual))

  return (
    <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-5 sm:bottom-5 z-[60] p-3 sm:p-0 pointer-events-none">
      <div
        role="alert"
        aria-live="assertive"
        className="pointer-events-auto w-full sm:w-[360px] mx-auto bg-white rounded-2xl border-2 border-brand/30 shadow-2xl shadow-brand/20 overflow-hidden animate-[slideUp_.25s_ease-out]"
      >
        {/* Só o aviso pós-ação, quando não há card ativo */}
        {!atual && aviso ? (
          <div className={`px-4 py-3 text-[13px] font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {aviso.texto}
          </div>
        ) : (
          <>
            <div className="bg-brand px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <BellRing size={15} className="animate-pulse" />
                <span className="text-[12px] font-bold uppercase tracking-wide">Nova solicitação</span>
              </div>
              {restantes > 0 && (
                <span className="text-[11px] font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                  +{restantes} na fila
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full">{tipo}</span>
                <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{modo}</span>
                {atual.booking_code && (
                  <span className="ml-auto font-mono text-[11px] font-bold text-gray-400">{atual.booking_code}</span>
                )}
              </div>

              {(atual.service_name || atual.vehicle_name) && (
                <p className="text-[15px] font-bold text-gray-900 leading-snug">
                  {atual.service_name || atual.vehicle_name}
                </p>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[13px] text-gray-700">
                  <CalendarCheck size={13} className="text-gray-400 shrink-0" />
                  <span className="font-semibold">
                    {atual.service_date
                      ? new Date(atual.service_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      : '—'}
                    {atual.service_time ? ` às ${String(atual.service_time).slice(0, 5)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-gray-700">
                  <Users size={13} className="text-gray-400 shrink-0" />
                  <span>{pessoas ?? '—'} {pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
                </div>
                {atual.origin_text && (
                  <div className="flex items-start gap-2 text-[13px] text-gray-700">
                    <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
                    <span className="truncate">
                      {atual.origin_text}{atual.destination_text ? ` → ${atual.destination_text}` : ''}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <div>
                  <p className="text-[11px] text-gray-400">{isLeg ? 'Valor da perna' : 'Valor da reserva'}</p>
                  <p className="text-[19px] font-extrabold text-brand">{fmtBRL(valor)}</p>
                </div>
              </div>

              {aviso && (
                <p className={`text-[12px] font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
                  {aviso.texto}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => dispensar(atual)}
                  disabled={processando}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 font-bold px-3 py-2.5 rounded-xl text-[13px] active:scale-95 transition-all disabled:opacity-60"
                >
                  <X size={15} /> Recusar
                </button>
                <button
                  type="button"
                  onClick={() => aceitar(atual)}
                  disabled={processando}
                  className="flex-[1.4] flex items-center justify-center gap-1.5 bg-brand text-white font-bold px-3 py-2.5 rounded-xl text-[13px] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-brand/30"
                >
                  <Check size={15} /> {processando ? 'Aceitando…' : 'Aceitar'}
                </button>
              </div>

              {/* Recusar não cancela a corrida — deixa claro para não assustar. */}
              <p className="text-[10.5px] text-gray-400 leading-snug">
                Recusar só esconde este aviso para você. A corrida continua disponível
                para os demais operadores.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
