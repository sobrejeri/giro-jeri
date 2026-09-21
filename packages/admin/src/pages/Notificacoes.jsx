import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Bell, Save } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Input, { Textarea, Select } from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'

const TEMPLATE_LABELS = {
  welcome:       { label: 'Boas-vindas', hint: 'Enviada quando o usuário cria a conta.' },
  birthday:      { label: 'Feliz aniversário', hint: 'Enviada no dia do aniversário (varredura diária ~9h).' },
  cart_reminder: { label: 'Reserva aguardando pagamento', hint: 'Lembrete ~3h após a reserva ficar sem pagamento.' },
  admin_new_user:         { label: 'Admin · Novo cadastro', hint: 'Avisa os admins quando um novo usuário cria conta.' },
  admin_payment_approved: { label: 'Admin · Recebimento aprovado', hint: 'Avisa os admins quando um pagamento é aprovado (valor + método).' },
  admin_payment_rejected: { label: 'Admin · Pagamento recusado', hint: 'Avisa os admins quando uma tentativa de pagamento é recusada.' },
}
const TARGETS = [
  { value: 'turista',  label: 'Turistas (app do cliente)' },
  { value: 'operador', label: 'Operadores (app da cooperativa)' },
  { value: 'admin',    label: 'Admins (painel)' },
]
const AUDIENCES = [
  { value: 'all',         label: 'Todos os turistas' },
  { value: 'subscribed',  label: 'Só quem ativou notificações' },
  { value: 'with_booking', label: 'Com reserva' },
  { value: 'no_booking',  label: 'Sem reserva' },
]

function TemplateCard({ tpl }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ enabled: tpl.enabled, title: tpl.title, body: tpl.body })
  useEffect(() => { setForm({ enabled: tpl.enabled, title: tpl.title, body: tpl.body }) }, [tpl.key])

  const meta = TEMPLATE_LABELS[tpl.key] || { label: tpl.key, hint: '' }
  const mut = useMutation({
    mutationFn: () => api.saveNotifTemplate(tpl.key, form),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notif-templates'] }),
  })

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-100">{meta.label}</p>
            <p className="text-xs text-gray-500">{meta.hint}</p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4 accent-orange-500" />
            <span className="text-sm text-gray-300">{form.enabled ? 'Ativa' : 'Desativada'}</span>
          </label>
        </div>
        <Input label="Título" value={form.title} maxLength={120}
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea label="Mensagem" rows={2} value={form.body} maxLength={400}
          onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="flex items-center gap-3">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <Save size={16} /> {mut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
          {mut.isSuccess && <span className="text-xs text-emerald-400">Salvo!</span>}
          {mut.isError && <span className="text-xs text-red-400">Erro ao salvar</span>}
        </div>
      </CardBody>
    </Card>
  )
}

export default function Notificacoes() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['notif-templates'],
    queryFn:  () => api.getNotifTemplates(),
  })

  const qc = useQueryClient()
  const { data: history } = useQuery({ queryKey: ['notif-broadcasts'], queryFn: () => api.getBroadcasts() })

  const [msg, setMsg] = useState({ title: 'Turiva', body: '', target: 'turista', audience: 'all' })
  const [result, setResult] = useState('')
  const broadcast = useMutation({
    mutationFn: () => api.broadcastNotif(msg),
    onSuccess:  (r) => { setResult(`Enviado para ${r?.alvo ?? 0} usuário(s).`); qc.invalidateQueries({ queryKey: ['notif-broadcasts'] }) },
    onError:    (e) => setResult(e?.message || 'Falha ao enviar.'),
  })
  // Histórico grava "target:audience"; mostra um rótulo amigável.
  const audienceLabel = (v) => {
    const [tgt, aud] = String(v || '').includes(':') ? v.split(':') : ['turista', v]
    const t = TARGETS.find((x) => x.value === tgt)?.label || tgt
    if (tgt !== 'turista') return t
    return `${t} · ${AUDIENCES.find((a) => a.value === aud)?.label || aud}`
  }

  function destinoLabel() {
    const t = TARGETS.find((x) => x.value === msg.target)?.label || msg.target
    if (msg.target !== 'turista') return t
    return `${t} · ${AUDIENCES.find((a) => a.value === msg.audience)?.label}`
  }

  function enviar() {
    if (!msg.body.trim()) { setResult('Escreva a mensagem.'); return }
    if (!confirm(`Enviar esta notificação para "${destinoLabel()}"?`)) return
    setResult('')
    broadcast.mutate()
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Notificações</h1>
        <p className="text-sm text-gray-500">Envie avisos manuais e configure as mensagens automáticas.</p>
      </div>

      {/* Envio manual */}
      <Card>
        <CardBody className="space-y-3">
          <p className="font-semibold text-gray-100 flex items-center gap-2"><Send size={16} className="text-orange-400" /> Envio manual</p>
          <Input label="Título" value={msg.title} maxLength={120}
            onChange={(e) => setMsg({ ...msg, title: e.target.value })} />
          <Textarea label="Mensagem" rows={3} value={msg.body} maxLength={400}
            placeholder="Ex: Promoção de feriado! Passeios com 10% OFF hoje."
            onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
          <Select label="Destino (qual app)" value={msg.target}
            onChange={(e) => setMsg({ ...msg, target: e.target.value })}>
            {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          {msg.target === 'turista' && (
            <Select label="Público" value={msg.audience}
              onChange={(e) => setMsg({ ...msg, audience: e.target.value })}>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={enviar} disabled={broadcast.isPending}>
              <Send size={16} /> {broadcast.isPending ? 'Enviando…' : 'Enviar agora'}
            </Button>
            {result && <span className="text-xs text-gray-300">{result}</span>}
          </div>
          <p className="text-[11px] text-gray-500">Só chega no aparelho de quem ativou as notificações; todos veem na central (sininho).</p>
        </CardBody>
      </Card>

      {/* Histórico de envios manuais */}
      {(history || []).length > 0 && (
        <Card>
          <CardBody className="space-y-2">
            <p className="font-semibold text-gray-100">Últimos envios</p>
            <div className="divide-y divide-gray-800">
              {history.map((h) => (
                <div key={h.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{h.title}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{h.body}</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {audienceLabel(h.audience)} · {new Date(h.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{h.sent_count} envio(s)</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Automáticas */}
      <div>
        <p className="font-semibold text-gray-100 flex items-center gap-2 mb-3"><Bell size={16} className="text-orange-400" /> Automáticas</p>
        <div className="space-y-3">
          {(templates || []).map((tpl) => <TemplateCard key={tpl.key} tpl={tpl} />)}
        </div>
      </div>
    </div>
  )
}
