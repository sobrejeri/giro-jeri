import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, CheckCircle2, UserCheck, Car, Clock,
  Users, MapPin, RefreshCw, MessageCircle, FileText, Package, Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea, Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import { downloadOrderPDF, orderPDFBase64 } from '../lib/orderPDF'
import SendOsButton from '../components/SendOsButton'
import ConfirmarExecutor from '../components/ConfirmarExecutor'
import DespacharModal from '../components/DespacharModal'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "Despachado" = a OS já foi preenchida (veículo/motorista atribuído). O status
// 'assigned' NÃO basta, pois também é setado no aceite — por isso uma reserva
// paga (mas sem OS) fica em "Aguardando despacho", não em "Despachados".
function hasDispatch(b) {
  const a = b.operational_assignments?.[0]
  return !!(a && (a.real_vehicle_text || a.driver_name))
}

// Veículo(s) que o cliente escolheu na solicitação (ex.: "2x Buggy").
function veiculoDaReserva(b) {
  return (b?.booking_vehicles || [])
    .map((v) => `${v.quantity > 1 ? v.quantity + 'x ' : ''}${v.vehicle_name_snapshot || ''}`.trim())
    .filter(Boolean)
    .join(' + ')
}

function BookingRow({ b, onDispatch, onStart, onComplete, operador }) {
  const dateStr = b.service_date
    ? format(new Date(b.service_date + 'T12:00:00'), "dd/MM", { locale: ptBR }) : ''
  const local        = b.pickup_place_name || b.origin_text || ''
  const dest         = b.destination_place_name || b.destination_text || ''
  const isDispatched = hasDispatch(b)
  const assign       = b.operational_assignments?.[0]
  const formForOS    = {
    real_vehicle_text: assign?.real_vehicle_text || '',
    driver_name:       assign?.driver_name       || '',
    dispatch_notes:    assign?.dispatch_notes    || '',
    driver_phone:      assign?.driver_phone      || '',
  }

  return (
    <Card className={`transition-colors ${isDispatched ? 'border-green-200 bg-green-50/30' : 'hover:border-brand/20'}`}>
      <CardBody className="space-y-3">
        {/* Info principal */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-gray-400">{b.booking_code}</span>
              <Badge value={b.service_type} />
              {isDispatched && (
                b.status_operational === 'in_progress' ? (
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <Zap size={9} /> Em andamento
                  </span>
                ) : b.status_operational === 'completed' ? (
                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={9} /> Concluído
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={9} /> Despachado
                  </span>
                )
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900">{b.users?.full_name || '—'}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              {dateStr && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />{dateStr}{b.service_time ? ` · ${b.service_time.slice(0,5)}` : ''}
                </span>
              )}
              {b.people_count && <span className="flex items-center gap-1"><Users size={10} />{b.people_count} pax</span>}
              <span className="font-semibold text-gray-700">{fmt(b.total_amount)}</span>
            </div>
            {local && (
              <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                <MapPin size={9} />{local}{dest ? ` → ${dest}` : ''}
              </p>
            )}
            {assign?.real_vehicle_text && (
              <div className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                <Car size={11} />{assign.real_vehicle_text}
              </div>
            )}
          </div>

          <Button size="sm" variant={isDispatched ? 'outline' : 'primary'} onClick={() => onDispatch(b)}>
            <UserCheck size={13} />
            {isDispatched ? 'Editar' : 'Despachar'}
          </Button>
        </div>

        {/* Ações pós-despacho */}
        {isDispatched && (
          <div className="flex items-center gap-2 pt-2 border-t border-green-100 flex-wrap">
            <button
              onClick={() => downloadOrderPDF(b, formForOS, operador)}
              className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              <FileText size={12} /> Baixar PDF
            </button>
            {/* Um botão só: envia a OS em PDF para o cliente E o motorista pelo
                Z-API. Substituiu os dois antigos, que apenas abriam a conversa
                e obrigavam a anexar o arquivo à mão. */}
            <SendOsButton booking={b} form={formForOS} operador={operador} />

            {/* Ciclo da corrida (item 13): iniciar depois do despacho, depois concluir */}
            {b.status_operational !== 'in_progress' && b.status_operational !== 'completed' && (
              <button
                onClick={() => onStart?.(b)}
                className="flex items-center gap-1.5 text-xs font-bold bg-brand hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 transition-colors ml-auto"
              >
                <Zap size={12} /> Iniciar corrida
              </button>
            )}
            {b.status_operational === 'in_progress' && (
              <button
                onClick={() => onComplete?.(b)}
                className="flex items-center gap-1.5 text-xs font-bold bg-gray-900 hover:bg-black text-white rounded-lg px-3 py-1.5 transition-colors ml-auto"
              >
                <CheckCircle2 size={12} /> Concluir corrida
              </button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// Agrupa uma lista de reservas por pedido (order_group_id), preservando a
// ordem de aparição. Pedido com 2+ serviços vira um bloco; o resto fica avulso.
function groupByOrder(list) {
  const byGid = new Map()
  const out = []
  for (const b of list) {
    if (b.order_group_id) {
      if (!byGid.has(b.order_group_id)) {
        const bucket = { type: 'group', gid: b.order_group_id, items: [] }
        byGid.set(b.order_group_id, bucket)
        out.push(bucket)
      }
      byGid.get(b.order_group_id).items.push(b)
    } else {
      out.push({ type: 'single', item: b })
    }
  }
  // Pedido de 1 serviço cai como avulso.
  return out.map((o) => (o.type === 'group' && o.items.length < 2) ? { type: 'single', item: o.items[0] } : o)
}

// Lista com os serviços do mesmo pedido agrupados sob um cabeçalho. O despacho
// segue POR serviço (cada um pode ter veículo/motorista diferente).
function GroupedList({ list, onDispatch, onStart, onComplete, operador }) {
  return (
    <div className="space-y-3">
      {groupByOrder(list).map((it) => it.type === 'group' ? (
        <div key={it.gid} className="rounded-2xl border border-brand/20 overflow-hidden">
          <div className="bg-brand/5 px-4 py-2 flex items-center justify-between border-b border-brand/10">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-brand shrink-0" />
              <span className="text-[12px] font-bold text-gray-800">Pedido · {it.items.length} serviços</span>
            </div>
            <span className="text-[11px] text-gray-500 truncate max-w-[45%]">
              {it.items.find((b) => b.users?.full_name)?.users?.full_name || ''}
            </span>
          </div>
          <div className="p-2 space-y-2 bg-brand/[0.02]">
            {it.items.map((b) => (
              <BookingRow key={b.id} b={b} onDispatch={onDispatch} onStart={onStart} onComplete={onComplete} operador={operador} />
            ))}
          </div>
        </div>
      ) : (
        <BookingRow key={it.item.id} b={it.item} onDispatch={onDispatch} onStart={onStart} onComplete={onComplete} operador={operador} />
      ))}
    </div>
  )
}

// Documento e chave PIX (081) entram aqui porque é onde o motorista já é
// nomeado. São OPCIONAIS: sem a chave o despacho segue e a corrida sai — o que
// fica pendente é o repasse, que o admin resolve depois. Travar a operação por
// causa de um dado de pagamento seria pior que pagar com um dia de atraso.
// Tudo obrigatório para despachar, MENOS as observações. Uma fonte só de
// verdade para o botão e para o submit — se divergirem, o botão libera algo
// que o submit recusa (ou o contrário).
function podeDespachar(f) {
  return !!(
    f.real_vehicle_text.trim() &&
    f.driver_name.trim() &&
    f.driver_phone.trim() &&
    f.driver_document.trim() &&
    f.driver_pix_key.trim() &&
    f.driver_pix_key_type.trim()
  )
}

const FORM_VAZIO = {
  real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '',
  driver_document: '', driver_pix_key: '', driver_pix_key_type: '', driver_payout_amount: '',
}

export default function Despacho() {
  // Reserva indicada pelo botão "Despacho" da tela de Solicitações.
  const { state: navState } = useLocation()
  const abrirId = navState?.bookingId || null
  const jaAbriu = useRef(false)

  const [date, setDate]       = useState('all')
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState(FORM_VAZIO)
  // Corrida aguardando a confirmação de quem executou, antes de concluir (081).
  const [concluindo, setConcluindo] = useState(null)
  // Erro do despacho visível na tela (antes falhava em silêncio).
  const [errMsg, setErrMsg] = useState('')
  const qc                    = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dispatch', date],
    queryFn:  () => api.getOperational(date !== 'all' ? { date } : {}),
    refetchInterval: 15_000,
  })

  // Abre o formulário DAQUELA reserva assim que a lista chega. Uma vez só: sem
  // a trava, fechar o modal o reabriria no próximo refetch (a cada 15s) e o
  // operador não conseguiria sair dele.
  useEffect(() => {
    if (!abrirId || jaAbriu.current || !data) return
    const todas = Object.values(data.columns || {}).flat()
    const alvo  = todas.find((b) => b.id === abrirId)
    if (!alvo) return
    jaAbriu.current = true
    handleDispatch(alvo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirId, data])

  const { data: profile } = useQuery({
    queryKey: ['operator-profile'],
    queryFn:  () => api.getProfile(),
    staleTime: 5 * 60_000,
  })

  // Quem este operador já mandou a campo, para reaproveitar os dados de
  // repasse. Falha aqui não atrapalha o despacho: vira lista vazia e a pessoa
  // digita, como antes.
  const { data: executoresData } = useQuery({
    queryKey: ['executores'],
    queryFn:  () => api.getExecutores(),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const executores = Array.isArray(executoresData) ? executoresData : []

  const operador = profile ? {
    full_name:         profile.full_name,
    document_type:     profile.document_type,
    document_number:   profile.document_number,
    phone:             profile.phone,
    address:           profile.address,
    cep:               profile.cep,
    profile_photo_url: profile.profile_photo_url,
  } : null

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['dispatch'] })
      // Despacho OK → gera e envia o PDF da OS em segundo plano. Falha aqui não
      // desfaz nada: o despacho está feito e o cliente/motorista já receberam
      // as mensagens de texto.
      const snapshot = modal
      // Usa o corpo enviado (vars) — ele já traz o real_vehicle_text combinado
      // (veículo + placa), então a OS/PDF mostram modelo e placa.
      const formSnap = { ...form, ...vars }
      ;(async () => {
        try {
          const pdf = await orderPDFBase64(snapshot, formSnap, operador)
          if (pdf) await api.sendOsPdf(vars.id, pdf)
        } catch (err) {
          console.warn('[despacho] envio do PDF da OS falhou:', err?.message)
        }
      })()
      setModal(null)
      setForm(FORM_VAZIO)
      setErrMsg('')
    },
    // Sem isto, uma falha no despacho não mostrava NADA na tela: o modal ficava
    // aberto e parecia que o clique não tinha feito efeito.
    onError: (err) => setErrMsg(err?.message || 'Não foi possível despachar. Tente novamente.'),
  })

  // Ciclo da corrida no Despacho (item 13): iniciar após o despacho, depois concluir.
  const startMut    = useMutation({ mutationFn: (id) => api.startBooking(id),    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch'] }) })
  const completeMut = useMutation({
    mutationFn: ({ id, executor, pin }) => api.completeBooking(id, executor, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch'] })
      // O executor confirmado agora alimenta a lista de reaproveitáveis.
      qc.invalidateQueries({ queryKey: ['executores'] })
      setConcluindo(null)
    },
    // PIN errado (422) → mantém o modal aberto com a mensagem.
  })
  function handleStart(b)    { if (!startMut.isPending) startMut.mutate(b.id) }
  // Concluir passa pela confirmação de quem executou (081) — é o único momento
  // em que dá para saber quem realmente rodou, e é o que o repasse precisa.
  function handleComplete(b) { if (!completeMut.isPending) setConcluindo(b) }

  function changeDate(days) {
    const base = date === 'all' ? format(new Date(), 'yyyy-MM-dd') : date
    const d    = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  function handleDispatch(booking) {
    const assign = booking.operational_assignments?.[0]
    setModal(booking)
    setForm({
      ...FORM_VAZIO,
      // Campo agora é só a PLACA — o veículo escolhido aparece no Resumo.
      real_vehicle_text:   assign?.real_vehicle_text   || '',
      driver_name:         assign?.driver_name         || '',
      dispatch_notes:      assign?.dispatch_notes      || '',
      driver_phone:        assign?.driver_phone        || '',
      driver_document:     assign?.driver_document     || '',
      driver_pix_key:      assign?.driver_pix_key      || '',
      driver_pix_key_type: assign?.driver_pix_key_type || '',
      driver_payout_amount: assign?.driver_payout_amount != null ? String(assign.driver_payout_amount) : '',
    })
  }

  // Preenche tudo a partir de quem já rodou antes — inclusive a chave PIX, que
  // é justamente o campo em que um dígito errado manda o dinheiro para outra
  // conta. Não sobrescreve o veículo: o carro muda, o motorista não.
  function usarExecutor(ex) {
    if (!ex) return
    setForm((f) => ({
      ...f,
      driver_name:         ex.name         || '',
      driver_phone:        ex.phone        || f.driver_phone,
      driver_document:     ex.document     || '',
      driver_pix_key:      ex.pix_key      || '',
      driver_pix_key_type: ex.pix_key_type || '',
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    // Obrigatórios: veículo, motorista, WhatsApp E os dados de repasse (CPF/CNPJ,
    // chave PIX e tipo). Só Observações fica livre. Espelha o `podeDespachar`
    // usado para habilitar o botão — os dois têm de concordar.
    if (!podeDespachar(form)) return
    // Combina o veículo escolhido (Resumo) com a placa digitada, para a OS/PDF
    // continuarem mostrando modelo + placa (ex.: "2x Buggy · GKR-1234"). Se a
    // placa já contiver o veículo (edição de um despacho antigo), não duplica.
    const veic  = veiculoDaReserva(modal)
    const placa = form.real_vehicle_text.trim()
    const real_vehicle_text = (veic && !placa.toLowerCase().includes(veic.toLowerCase()))
      ? `${veic} · ${placa}`
      : placa
    // O despacho vai SOZINHO, com o mesmo corpo de sempre. O PDF da OS é um
    // extra e sai numa chamada separada, depois (ver onSuccess do assignMut) —
    // assim nada relacionado ao anexo pode atrasar ou impedir o despacho.
    assignMut.mutate({ id: modal.id, ...form, real_vehicle_text })
  }

  // Só reservas PAGAS entram no despacho (não se despacha antes do pagamento);
  // concluídas saem. "Aguardando despacho" = paga sem OS; "Despachadas" = com OS.
  const columns    = data?.columns || {}
  const paidActive = Object.values(columns).flat()
    .filter((b) => b.status_commercial === 'paid' && b.status_operational !== 'completed')
  const pending    = paidActive.filter((b) => !hasDispatch(b))
  const dispatched = paidActive.filter((b) => hasDispatch(b))

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">

      {/* ── Filtro de data ──────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setDate('all')}
          className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-colors ${
            date === 'all'
              ? 'bg-brand text-white border-brand shadow-sm'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          Todos os dias
        </button>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
          <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-50 text-gray-500">
            <ChevronLeft size={15} />
          </button>
          <input
            type="date"
            value={date === 'all' ? format(new Date(), 'yyyy-MM-dd') : date}
            onChange={(e) => setDate(e.target.value)}
            className={`px-2 text-sm font-medium bg-transparent focus:outline-none ${
              date === 'all' ? 'text-gray-300' : 'text-gray-700'
            }`}
          />
          <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-50 text-gray-500">
            <ChevronRight size={15} />
          </button>
        </div>
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{pending.length}</span> aguardando ·{' '}
          <span className="font-semibold text-green-600">{dispatched.length}</span> despachados
        </span>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['dispatch'] })}
          className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Aguardando despacho ─────────────────────────── */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Aguardando despacho ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <Card>
            <CardBody>
              <div className="py-8 text-center">
                <CheckCircle2 size={36} className="mx-auto text-green-300 mb-2" />
                <p className="text-gray-500 text-sm">Todos os serviços estão despachados!</p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <GroupedList list={pending} onDispatch={handleDispatch} onStart={handleStart} onComplete={handleComplete} operador={operador} />
        )}
      </div>

      {/* ── Já despachados ──────────────────────────────── */}
      {dispatched.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Despachados / Em andamento ({dispatched.length})
          </h3>
          <GroupedList list={dispatched} onDispatch={handleDispatch} onStart={handleStart} onComplete={handleComplete} operador={operador} />
        </div>
      )}

      {/* Modal de despacho — compartilhado com a tela Operações */}
      <DespacharModal
        booking={modal}
        operador={operador}
        onClose={() => setModal(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ['dispatch'] })}
      />

      <ConfirmarExecutor
        booking={concluindo}
        executores={executores}
        isSending={completeMut.isPending}
        errorMsg={completeMut.isError ? (completeMut.error?.message || 'Não foi possível concluir.') : ''}
        onCancel={() => { setConcluindo(null); completeMut.reset() }}
        onConfirm={(executor, pin) => completeMut.mutate({ id: concluindo.id, executor, pin })}
      />
    </div>
  )
}
