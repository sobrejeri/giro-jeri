import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Bell, Save, ChevronRight, ChevronDown, History } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Input, { Textarea, Select } from '../components/ui/Input'
import Card from '../components/ui/Card'

const TEMPLATE_LABELS = {
  welcome:       { label: 'Boas-vindas', hint: 'Enviada quando o usuário cria a conta.' },
  birthday:      { label: 'Feliz aniversário', hint: 'Enviada no dia do aniversário (varredura diária ~9h).' },
  cart_reminder: { label: 'Reserva aguardando pagamento', hint: 'Lembrete ~3h após a reserva ficar sem pagamento.' },
  cart_pending:  { label: 'Carrinho não finalizado', hint: 'Lembrete ~3h após o cliente deixar itens no carrinho sem solicitar a reserva.' },
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

// Seção que recolhe e expande. Recolhidas, as três seções da tela cabem numa
// olhada só, cada uma com um resumo; o aparelho lembra como o admin deixou cada
// uma (é só conveniência: sem armazenamento, apenas começa recolhida).
function Secao({ id, icone: Icone, titulo, resumo, children }) {
  const chave = `admin_envios_secao_${id}`
  const [aberta, setAberta] = useState(() => {
    try { return localStorage.getItem(chave) === '1' } catch { return false }
  })
  function alternar() {
    const nova = !aberta
    setAberta(nova)
    try { localStorage.setItem(chave, nova ? '1' : '0') } catch { /* sem armazenamento: só não lembra */ }
  }
  return (
    <Card>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        aria-controls={`secao-${id}`}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 min-h-11 text-left rounded-xl hover:bg-gray-700/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Icone size={16} className="text-orange-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-gray-100">{titulo}</span>
          {resumo && <span className="block text-xs text-gray-500 truncate">{resumo}</span>}
        </span>
        <span className="hidden sm:inline text-xs text-gray-500 shrink-0">{aberta ? 'Recolher' : 'Expandir'}</span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
      </button>
      {aberta && (
        <div id={`secao-${id}`} className="px-4 sm:px-5 pt-4 pb-5 space-y-3 border-t border-gray-700/60">
          {children}
        </div>
      )}
    </Card>
  )
}

function TemplateCard({ tpl }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ enabled: tpl.enabled, title: tpl.title, body: tpl.body })
  // Recolhida por padrão: mostra só o nome e o liga/desliga; o conteúdo
  // (título/mensagem) aparece ao clicar para expandir. Cada card é independente.
  const [aberto, setAberto] = useState(false)
  useEffect(() => { setForm({ enabled: tpl.enabled, title: tpl.title, body: tpl.body }) }, [tpl.key])

  const meta = TEMPLATE_LABELS[tpl.key] || { label: tpl.key, hint: '' }
  const mut = useMutation({
    mutationFn: (payload) => api.saveNotifTemplate(tpl.key, payload || form),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notif-templates'] }),
  })

  // Liga/desliga salva na hora — assim funciona mesmo com o card recolhido.
  function toggleAtiva(enabled) {
    const next = { ...form, enabled }
    setForm(next)
    mut.mutate(next)
  }

  // Linha leve (não um cartão): fica dentro da seção "Automáticas", e um
  // cartão dentro de outro dobrava a margem e cortava os nomes no celular.
  return (
    <div className="rounded-xl border border-gray-700/70 bg-gray-900/40">
      <div className="px-3 sm:px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left group"
            aria-expanded={aberto}
          >
            <ChevronRight size={16} className={`text-gray-500 shrink-0 transition-transform group-hover:text-gray-300 ${aberto ? 'rotate-90' : ''}`} />
            <span className="min-w-0">
              <span className="block font-semibold text-gray-100 leading-snug">{meta.label}</span>
              <span className="block text-xs text-gray-500 truncate">{meta.hint}</span>
            </span>
          </button>
          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input type="checkbox" checked={form.enabled}
              onChange={(e) => toggleAtiva(e.target.checked)}
              className="w-4 h-4 accent-orange-500" />
            <span className="text-sm text-gray-300">{form.enabled ? 'Ativa' : 'Desativada'}</span>
          </label>
        </div>
        {aberto && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

export default function Notificacoes() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ['notif-templates'],
    queryFn:  () => api.getNotifTemplates(),
  })

  const qc = useQueryClient()
  const { data: history } = useQuery({ queryKey: ['notif-broadcasts'], queryFn: () => api.getBroadcasts() })

  const [msg, setMsg] = useState({ title: 'Turiva', body: '', target: 'turista', audience: 'all', image: '', url: '' })
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

  const listaHistorico = history || []
  const ultimoEnvio = listaHistorico.reduce((max, h) => (h.created_at > max ? h.created_at : max), '')
  const listaAutomaticas = templates || []
  const ativas = listaAutomaticas.filter((tpl) => tpl.enabled).length

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Envios e automações</h2>
        <p className="text-sm text-gray-500">Envie avisos manuais e configure as mensagens automáticas.</p>
      </div>

      {/* Envio manual */}
      <Secao id="manual" icone={Send} titulo="Envio manual" resumo="Avise turistas, operadores ou admins agora.">
          <Input label="Título" value={msg.title} maxLength={120}
            onChange={(e) => setMsg({ ...msg, title: e.target.value })} />
          <Textarea label="Mensagem" rows={3} value={msg.body} maxLength={400}
            placeholder="Ex: Promoção de feriado! Passeios com 10% OFF hoje."
            onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
          <Input label="Imagem (opcional — prévia estilo Instagram)" value={msg.image} maxLength={1000}
            placeholder="https://… (link da imagem do post)"
            onChange={(e) => setMsg({ ...msg, image: e.target.value })} />
          {msg.image?.startsWith('http') && (
            <img src={msg.image} alt="" className="w-full max-h-40 object-cover rounded-xl border border-gray-700" />
          )}
          <Input label="Abrir ao tocar (opcional)" value={msg.url} maxLength={300}
            placeholder="Ex: descubra  (deixe em branco para o padrão)"
            onChange={(e) => setMsg({ ...msg, url: e.target.value })} />
          <p className="text-[11px] text-gray-500">A prévia da imagem aparece em Android/Chrome. No iPhone o push mostra só título e texto (limitação do iOS).</p>
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
      </Secao>

      {/* Histórico de envios manuais */}
      {listaHistorico.length > 0 && (
        <Secao id="historico" icone={History} titulo="Últimos envios"
          resumo={`${listaHistorico.length} envio${listaHistorico.length !== 1 ? 's' : ''}${ultimoEnvio ? ` · último em ${new Date(ultimoEnvio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`}>
            <div className="divide-y divide-gray-700/60 -mt-2">
              {listaHistorico.map((h) => (
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
        </Secao>
      )}

      {/* Automáticas */}
      <Secao id="automaticas" icone={Bell} titulo="Automáticas"
        resumo={`${listaAutomaticas.length} mensage${listaAutomaticas.length !== 1 ? 'ns' : 'm'} · ${ativas} ativa${ativas !== 1 ? 's' : ''}`}>
        {listaAutomaticas.map((tpl) => <TemplateCard key={tpl.key} tpl={tpl} />)}
      </Secao>
    </div>
  )
}
