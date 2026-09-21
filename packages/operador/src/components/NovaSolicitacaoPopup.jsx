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
const CHAVE_AVISOS      = 'girojeri_op_avisos_vistos'

// Avisos INFORMATIVOS (venda direta, pagamento recebido): esses não passam por
// aceite — a reserva já é do operador e já paga —, então não entram no feed de
// `pending`. Por isso o pop-up também lê as notificações e flutua estes como
// aviso (com "Ver", sem aceitar/recusar). Detectados pelo início do título.
const ehAvisoInformativo = (n) =>
  /^Venda direta|^Pagamento recebido/.test(String(n?.title || ''))

// Só flutua notificação recente — senão, ao abrir o app, choveria histórico.
const JANELA_AVISO_MS = 20 * 60 * 1000

function idDoItem(it) {
  return it.kind === 'leg' ? it.leg_id : it.id
}

function lerLista(chave) {
  try {
    const arr = JSON.parse(localStorage.getItem(chave) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function gravarLista(chave, ids) {
  try {
    // Guarda só as últimas 200 — o localStorage não é um histórico.
    localStorage.setItem(chave, JSON.stringify(ids.slice(-200)))
  } catch { /* modo privado / bloqueado — o aviso só volta a aparecer, sem quebrar */ }
}

const lerDispensadas   = () => lerLista(CHAVE_DISPENSADAS)
const gravarDispensadas = (ids) => gravarLista(CHAVE_DISPENSADAS, ids)

const fmtBRL = (v) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function NovaSolicitacaoPopup() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [dispensadas, setDispensadas] = useState(lerDispensadas)
  const [avisosVistos, setAvisosVistos] = useState(() => lerLista(CHAVE_AVISOS))
  const [acao, setAcao] = useState(null)   // { id, tipo:'aceitar' } enquanto processa
  const [aviso, setAviso] = useState(null) // mensagem curta após aceitar/erro

  const { data } = useQuery({
    queryKey:        ['operator-bookings'],
    queryFn:         () => api.getOperatorBookings(),
    refetchInterval: 6000,
    staleTime:       3000,
  })

  // Mesma query do sino (['notifications']); aqui num intervalo curto para o
  // aviso de venda direta aparecer logo. Observadores compartilham o cache.
  const { data: notifData } = useQuery({
    queryKey:        ['notifications'],
    queryFn:         () => api.getNotifications(),
    refetchInterval: 12000,
    staleTime:       6000,
  })

  const pendentes = useMemo(() => {
    const lista = data?.pending || []
    const vistas = new Set(dispensadas)
    return lista.filter((it) => !vistas.has(idDoItem(it)))
  }, [data, dispensadas])

  const avisosInfo = useMemo(() => {
    const itens = notifData?.items || []
    const vistos = new Set(avisosVistos)
    const agora = Date.now()
    return itens.filter((n) =>
      ehAvisoInformativo(n) &&
      !n.read_at &&
      !vistos.has(n.id) &&
      (agora - new Date(n.created_at).getTime()) < JANELA_AVISO_MS,
    )
  }, [notifData, avisosVistos])

  const atual = pendentes[0]
  const restantes = pendentes.length - 1
  // Aceitar/recusar tem prioridade; o aviso informativo só aparece sem pendências.
  const avisoAtual = !atual ? avisosInfo[0] : null

  function dispensarAviso(n) {
    const nova = [...avisosVistos, n.id]
    setAvisosVistos(nova)
    gravarLista(CHAVE_AVISOS, nova)
  }

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

  if (!atual && !aviso && !avisoAtual) return null

  // ── Card INFORMATIVO (venda direta / pagamento) — sem aceitar/recusar ──────
  // Tem prioridade menor que a solicitação a aceitar, mas quando não há
  // pendência ele é o que aparece. Só "Ver" (leva às Operações) e dispensar.
  if (!atual && !aviso && avisoAtual) {
    return (
      <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-5 sm:bottom-5 z-[60] p-3 sm:p-0 pointer-events-none">
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto w-full sm:w-[360px] mx-auto bg-white rounded-2xl border-2 border-brand/30 shadow-2xl shadow-brand/20 overflow-hidden animate-[slideUp_.25s_ease-out]"
        >
          <div className="bg-brand px-4 py-2.5 flex items-center gap-2 text-white">
            <BellRing size={15} className="animate-pulse" />
            <span className="text-[12px] font-bold uppercase tracking-wide truncate">{avisoAtual.title}</span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-[13px] text-gray-700 leading-relaxed">{avisoAtual.message_body}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => dispensarAviso(avisoAtual)}
                className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 text-gray-600 font-bold px-3 py-2.5 rounded-xl text-[13px] active:scale-95 transition-all"
              >
                <X size={15} /> Dispensar
              </button>
              <button
                type="button"
                onClick={() => { dispensarAviso(avisoAtual); navigate('/reservas?tab=mine') }}
                className="flex-[1.4] flex items-center justify-center gap-1.5 bg-brand text-white font-bold px-3 py-2.5 rounded-xl text-[13px] active:scale-95 transition-all shadow-md shadow-brand/30"
              >
                <Check size={15} /> Ver reserva
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Toast curto pós-ação, quando não há mais card ativo (aceito/erro).
  if (!atual && aviso) {
    return (
      <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-5 sm:bottom-5 z-[60] p-3 sm:p-0 pointer-events-none">
        <div className="pointer-events-auto w-full sm:w-[360px] mx-auto bg-white rounded-2xl border-2 border-brand/30 shadow-2xl overflow-hidden animate-[slideUp_.25s_ease-out]">
          <div className={`px-4 py-3 text-[13px] font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {aviso.texto}
          </div>
        </div>
      </div>
    )
  }

  const tipo   = atual?.service_type === 'tour' ? 'Novo passeio' : 'Novo transfer'
  const isLeg  = atual?.kind === 'leg'
  const modo   = isLeg ? (atual?.vehicle_name || 'Privativo')
                       : (atual?.booking_mode === 'private' ? 'Privativo' : 'Compartilhado')
  const pessoas = isLeg ? atual?.pax_count : atual?.people_count
  const valor   = isLeg ? atual?.leg_price : atual?.total_amount
  const foto    = atual?.service_image_url || null
  const local   = atual?.origin_text || atual?.pickup_place_name || null
  const processando = acao?.id === (atual && idDoItem(atual))

  // ── Solicitação a ACEITAR — tela cheia, imersiva, sobre qualquer tela ──────
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-2xl overflow-hidden animate-[slideUp_.25s_ease-out]">
        {/* Cabeçalho com foto */}
        <div className="relative h-48 bg-gradient-to-br from-brand to-orange-400">
          {foto && <img src={foto} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          {restantes > 0 && (
            <span className="absolute top-3 right-3 text-[11px] font-bold text-white bg-black/40 px-2.5 py-1 rounded-full">
              +{restantes} na fila
            </span>
          )}
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-white/95 text-brand text-[12px] font-extrabold uppercase tracking-wide px-3 py-1 rounded-full shadow">
              <BellRing size={13} className="animate-pulse" /> {tipo}
            </span>
            <span className="bg-black/35 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">{modo}</span>
          </div>
        </div>

        {/* Corpo */}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[22px] font-extrabold text-gray-900 leading-tight">
              {atual.service_name || atual.vehicle_name || (atual.service_type === 'tour' ? 'Passeio' : 'Transfer')}
            </h2>
            {atual.booking_code && (
              <span className="font-mono text-[11px] font-bold text-gray-400 shrink-0 mt-1">{atual.booking_code}</span>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-[15px] text-gray-800">
              <CalendarCheck size={18} className="text-brand shrink-0" />
              <span className="font-semibold">
                {atual.service_date
                  ? new Date(atual.service_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '—'}
                {atual.service_time ? ` • ${String(atual.service_time).slice(0, 5)}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-[15px] text-gray-800">
              <Users size={18} className="text-brand shrink-0" />
              <span>{pessoas ?? '—'} {pessoas === 1 ? 'passageiro' : 'passageiros'}</span>
            </div>
            {local && (
              <div className="flex items-start gap-2.5 text-[15px] text-gray-800">
                <MapPin size={18} className="text-brand shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[12px] text-gray-400 font-medium">Buscar em:</span>
                  {local}{atual.destination_text ? ` → ${atual.destination_text}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 text-center">
            <p className="text-[13px] text-gray-500 font-medium">{isLeg ? 'Valor da perna' : 'Valor da reserva'}</p>
            <p className="text-[38px] leading-none font-extrabold text-brand mt-1">{fmtBRL(valor)}</p>
          </div>

          {aviso && (
            <p className={`text-center text-[12px] font-semibold ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
              {aviso.texto}
            </p>
          )}

          <button
            type="button"
            onClick={() => aceitar(atual)}
            disabled={processando}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white text-[17px] font-extrabold py-4 rounded-2xl active:scale-[0.98] transition-transform disabled:opacity-60 shadow-lg shadow-brand/30"
          >
            <Check size={20} /> {processando ? 'Aceitando…' : 'Aceitar'}
          </button>
          <button
            type="button"
            onClick={() => dispensar(atual)}
            disabled={processando}
            className="w-full text-center text-[15px] font-semibold text-gray-500 py-1.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            Recusar
          </button>

          {/* Recusar não cancela a corrida — deixa claro para não assustar. */}
          <p className="text-[11px] text-gray-400 text-center leading-snug">
            Recusar só esconde este aviso para você. A corrida continua disponível
            para os demais operadores na aba Solicitações.
          </p>
        </div>
      </div>
    </div>
  )
}
