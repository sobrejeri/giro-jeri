import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, AlertTriangle, CheckCircle2, Loader2, Users } from 'lucide-react'
import { api } from '../lib/api'
import Modal from './ui/Modal'
import Button from './ui/Button'

// ── Divulgar cupom por WhatsApp ──────────────────────────────────────────────
// Envio para a base de clientes. A tela existe para que o disparo NUNCA seja um
// clique só: mostra o texto exato que vai sair, para quantas pessoas, e exige
// confirmação digitada. Depois de enviado não há como recolher a mensagem.
export default function DivulgarCupom({ cupom, onClose }) {
  const qc = useQueryClient()
  const [confirmacao, setConfirmacao] = useState('')
  const [disparoId, setDisparoId]     = useState(null)
  const [erro, setErro]               = useState('')

  const { data: previa, isLoading } = useQuery({
    queryKey: ['broadcast-previa', cupom?.id],
    queryFn:  () => api.getCouponBroadcast(cupom.id),
    enabled:  !!cupom?.id,
  })

  // Se já havia um envio rodando quando a tela abriu, acompanha esse.
  useEffect(() => {
    if (previa?.em_andamento?.id) setDisparoId(previa.em_andamento.id)
  }, [previa?.em_andamento?.id])

  // Enquanto envia, consulta o andamento. Para sozinho ao terminar — sem isso
  // a tela ficaria pedindo status para sempre depois do fim.
  const { data: andamento } = useQuery({
    queryKey: ['broadcast', disparoId],
    queryFn:  () => api.getBroadcast(disparoId),
    enabled:  !!disparoId,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 3000 : false),
  })

  const enviarMut = useMutation({
    mutationFn: () => api.sendCouponBroadcast(cupom.id),
    onSuccess: (r) => {
      setErro('')
      setDisparoId(r.id)
      qc.invalidateQueries({ queryKey: ['broadcast-previa', cupom.id] })
    },
    onError: (e) => setErro(e?.message || 'Falha ao iniciar o envio.'),
  })

  const total     = previa?.destinatarios ?? 0
  const rodando   = andamento?.status === 'running'
  const terminou  = andamento?.status === 'done'
  const falhou    = andamento?.status === 'failed'
  const podeEnviar = confirmacao.trim().toUpperCase() === 'ENVIAR' && total > 0 && !disparoId

  return (
    <Modal open={!!cupom} onClose={onClose} title={`Divulgar ${cupom?.code || ''} no WhatsApp`}>
      {isLoading ? (
        <p className="text-sm text-gray-500 py-6 text-center">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {previa?.whatsapp_ativo === false && (
            <div className="flex items-start gap-2 bg-red-900/20 border border-red-800/40 rounded-xl p-3">
              <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">
                WhatsApp não configurado nesta instalação. O envio está indisponível.
              </p>
            </div>
          )}

          {/* Destinatários */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand" />
              <p className="text-sm font-semibold text-gray-200">
                {total} {total === 1 ? 'cliente vai receber' : 'clientes vão receber'}
              </p>
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
              Clientes ativos, com telefone, que não pediram para sair das ofertas e que
              ainda não receberam este cupom. Quem já recebeu não recebe de novo.
              {previa?.teto_por_disparo && total > previa.teto_por_disparo && (
                <> Este envio cobre os primeiros {previa.teto_por_disparo}; repita depois para o restante.</>
              )}
            </p>
          </div>

          {/* Prévia da mensagem */}
          <div>
            <p className="text-xs font-semibold text-gray-400 mb-1.5">Mensagem que o cliente recebe</p>
            <pre className="bg-[#0b141a] text-gray-200 text-[12px] leading-relaxed rounded-xl p-3 whitespace-pre-wrap font-sans border border-gray-700">
{previa?.mensagem_exemplo}
{'\n\n'}<span className="text-gray-500">_Não quer mais ofertas? (link de descadastro)_</span>
            </pre>
            <p className="text-[11px] text-gray-500 mt-1.5">
              Vai com um botão <strong className="text-gray-400">Quero a oferta</strong>, que abre o app
              com o cupom já guardado.
            </p>
          </div>

          {/* Andamento */}
          {disparoId && (
            <div className={`rounded-xl p-3 border ${
              falhou ? 'bg-red-900/20 border-red-800/40'
              : terminou ? 'bg-emerald-900/20 border-emerald-800/40'
              : 'bg-gray-800 border-gray-700'
            }`}>
              <div className="flex items-center gap-2">
                {rodando  && <Loader2 size={15} className="text-brand animate-spin" />}
                {terminou && <CheckCircle2 size={15} className="text-emerald-400" />}
                {falhou   && <AlertTriangle size={15} className="text-red-400" />}
                <p className="text-sm font-semibold text-gray-200">
                  {rodando  && 'Enviando…'}
                  {terminou && 'Envio concluído'}
                  {falhou   && 'O envio parou'}
                  {!andamento && 'Iniciando…'}
                </p>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {(andamento?.sent_count ?? 0)} enviadas
                {andamento?.failed_count > 0 && ` · ${andamento.failed_count} falharam`}
                {andamento?.total_recipients ? ` de ${andamento.total_recipients}` : ''}
              </p>
              {rodando && (
                <p className="text-[11px] text-gray-500 mt-1.5">
                  As mensagens saem uma a uma, com pausa entre elas. Isso é de propósito:
                  disparo em rajada faz o WhatsApp bloquear o número da empresa. Pode fechar
                  esta janela — o envio continua.
                </p>
              )}
              {falhou && andamento?.error_text && (
                <p className="text-[11px] text-red-300 mt-1.5 break-words">{andamento.error_text}</p>
              )}
            </div>
          )}

          {erro && <p className="text-xs text-red-400">{erro}</p>}

          {/* Confirmação */}
          {!disparoId && (
            <>
              <div className="flex items-start gap-2 bg-amber-900/15 border border-amber-800/30 rounded-xl p-3">
                <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Mensagem enviada não volta atrás. Confira o texto acima antes de disparar.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  Digite <span className="font-mono text-gray-200">ENVIAR</span> para liberar o botão
                </label>
                <input
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="ENVIAR"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 outline-none focus:border-brand"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {disparoId ? 'Fechar' : 'Cancelar'}
            </Button>
            {!disparoId && (
              <Button
                type="button"
                onClick={() => enviarMut.mutate()}
                disabled={!podeEnviar || enviarMut.isPending || previa?.whatsapp_ativo === false}
              >
                <Send size={14} /> {enviarMut.isPending ? 'Iniciando…' : `Enviar para ${total}`}
              </Button>
            )}
          </div>

          {/* Histórico */}
          {previa?.historico?.length > 0 && (
            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs font-semibold text-gray-400 mb-2">Envios anteriores</p>
              <ul className="space-y-1">
                {previa.historico.map((d) => (
                  <li key={d.id} className="text-[11px] text-gray-500">
                    {new Date(d.created_at).toLocaleString('pt-BR')} — {d.sent_count} enviadas
                    {d.failed_count > 0 && `, ${d.failed_count} falhas`} ({d.status})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
