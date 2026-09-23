import { useState, useEffect } from 'react'
import { BellRing } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { enablePush, pushSupported, pushPermission } from '../lib/push'

// Banner flutuante que convida o operador a ativar as notificações — sem elas
// ele não recebe no celular os avisos de nova corrida, pagamento, etc. Aparece
// quando dá para receber push, está logado e ainda não decidiu. "Agora não"
// silencia por 3 dias.
const KEY = 'op_push_prompt_dismissed_at'
const SNOOZE = 3 * 24 * 60 * 60 * 1000

// Retorno do enablePush() → mensagem clara pro operador.
const MENSAGENS = {
  ok:                    { titulo: 'Notificações ativadas! 🔔', texto: 'Enviamos um teste — você deve recebê-lo agora. Se não chegar, confira as notificações do app nos Ajustes do celular.', bg: 'bg-emerald-50 border-emerald-100', fg: 'text-emerald-700' },
  denied:                { titulo: 'Permissão negada', texto: 'Você bloqueou as notificações. Ative em Ajustes › Notificações › Turiva (ou no cadeado ao lado do endereço, no navegador).', bg: 'bg-amber-50 border-amber-100', fg: 'text-amber-700' },
  unsupported:           { titulo: 'Não dá pra ativar aqui', texto: 'No iPhone, primeiro adicione o app à Tela de Início (Compartilhar › Adicionar à Tela de Início) e abra por lá.', bg: 'bg-amber-50 border-amber-100', fg: 'text-amber-700' },
  server_not_configured: { titulo: 'Ativado neste aparelho', texto: 'Mas o servidor ainda não está configurado para enviar (falta a chave de push). Avise o suporte para habilitar.', bg: 'bg-amber-50 border-amber-100', fg: 'text-amber-700' },
  server:                { titulo: 'Servidor sem push', texto: 'A chave de notificação não está configurada no servidor. Avise o suporte.', bg: 'bg-amber-50 border-amber-100', fg: 'text-amber-700' },
  error:                 { titulo: 'Não deu pra ativar agora', texto: 'Tente de novo em instantes. Se persistir, feche e reabra o app.', bg: 'bg-red-50 border-red-100', fg: 'text-red-700' },
}

export default function PushPrompt() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!user || !pushSupported() || pushPermission() !== 'default') { setShow(false); return }
    let dismissed = 0
    try { dismissed = Number(localStorage.getItem(KEY)) || 0 } catch { /* ignore */ }
    if (Date.now() - dismissed < SNOOZE) { setShow(false); return }
    const tmr = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(tmr)
  }, [user])

  if (!show) return null
  const snooze = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ } }
  async function ativar() {
    setBusy(true)
    let r
    try { r = await enablePush() } finally { setBusy(false) }
    snooze()
    // Feedback claro em vez de fechar no escuro: deu certo, permissão negada,
    // servidor sem VAPID, etc. Só some sozinho quando dá certo.
    setResult(r || { ok: false, reason: 'error' })
    if (r?.ok) setTimeout(() => setShow(false), 4000)
  }

  if (result) {
    const m = MENSAGENS[result.reason] || (result.ok ? MENSAGENS.ok : MENSAGENS.error)
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md px-3 z-[70]">
        <div className={`rounded-2xl shadow-[0_10px_34px_rgba(0,0,0,0.2)] border p-3.5 flex items-start gap-3 ${m.bg}`}>
          <div className="flex-1 min-w-0">
            <p className={`text-[13px] font-extrabold leading-tight ${m.fg}`}>{m.titulo}</p>
            <p className="text-[11.5px] text-gray-600 leading-snug mt-0.5">{m.texto}</p>
          </div>
          <button onClick={() => setShow(false)} className="text-[11px] font-bold text-gray-500 px-2 py-1 shrink-0">OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md px-3 z-[70]">
      <div className="bg-white rounded-2xl shadow-[0_10px_34px_rgba(0,0,0,0.2)] border border-gray-100 p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <BellRing size={20} className="text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-extrabold text-gray-900 leading-tight">Ative as notificações</p>
          <p className="text-[11.5px] text-gray-500 leading-snug mt-0.5">
            Receba no celular os avisos de novas corridas e pagamentos na hora.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1 shrink-0">
          <button onClick={ativar} disabled={busy}
            className="bg-orange-500 text-white text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-60">
            {busy ? '…' : 'Ativar'}
          </button>
          <button onClick={() => { snooze(); setShow(false) }} className="text-[11px] text-gray-400 px-2 py-0.5">Agora não</button>
        </div>
      </div>
    </div>
  )
}
