import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BellRing } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { enablePush, pushSupported, pushPermission } from '../lib/push'

// Banner flutuante que convida a ativar as notificações. Aparece quando:
// dá para receber push (Android no navegador OU PWA instalado no iPhone),
// o usuário está logado e ainda não decidiu (permissão "default"). Se tocar
// em "Agora não", some por alguns dias em vez de sumir para sempre.
const KEY = 'push_prompt_dismissed_at'
const SNOOZE = 3 * 24 * 60 * 60 * 1000 // 3 dias

export default function PushPrompt() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !pushSupported() || pushPermission() !== 'default') { setShow(false); return }
    let dismissed = 0
    try { dismissed = Number(localStorage.getItem(KEY)) || 0 } catch { /* ignore */ }
    if (Date.now() - dismissed < SNOOZE) { setShow(false); return }
    // Pequeno atraso: não competir com o carregamento da tela.
    const tmr = setTimeout(() => setShow(true), 1200)
    return () => clearTimeout(tmr)
  }, [user])

  if (!show) return null

  const snooze = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ } }

  async function ativar() {
    setBusy(true)
    try { await enablePush() } finally { setBusy(false); snooze(); setShow(false) }
  }
  function agoraNao() { snooze(); setShow(false) }

  return createPortal(
    <div className="fixed bottom-[84px] left-1/2 -translate-x-1/2 w-full max-w-[430px] px-3 z-[60] lg:hidden">
      <div className="bg-white rounded-2xl shadow-[0_10px_34px_rgba(0,0,0,0.18)] border border-gray-100 p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <BellRing size={20} className="text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-extrabold text-gray-900 leading-tight">Ative as notificações</p>
          <p className="text-[11.5px] text-gray-500 leading-snug mt-0.5">
            Receba avisos de reservas, pagamentos e ofertas na hora.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1 shrink-0">
          <button onClick={ativar} disabled={busy}
            className="bg-brand text-white text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-60">
            {busy ? '…' : 'Ativar'}
          </button>
          <button onClick={agoraNao} className="text-[11px] text-gray-400 px-2 py-0.5">Agora não</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
