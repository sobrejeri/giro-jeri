import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, X, Share, Plus, ArrowUpFromLine } from 'lucide-react'
import { isIOS, isStandalone } from '../lib/push'

// Atalho na Home para instalar o PWA. Em Android/desktop (Chrome/Edge) usa o
// instalador nativo capturado do evento `beforeinstallprompt`. No iPhone não
// existe instalação por código — mostra o passo a passo (Compartilhar →
// Adicionar à Tela de Início). Some quando o app já está instalado (standalone)
// ou quando o cliente fecha (guarda por alguns dias).
const KEY = 'install_card_dismissed_at'
const SNOOZE = 7 * 24 * 60 * 60 * 1000 // 7 dias

export default function InstallAppCard() {
  const [deferred, setDeferred] = useState(null) // evento nativo (Android/desktop)
  const [show, setShow] = useState(false)
  const [guiaIOS, setGuiaIOS] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    let dismissed = 0
    try { dismissed = Number(localStorage.getItem(KEY)) || 0 } catch { /* ignore */ }
    const snoozed = Date.now() - dismissed < SNOOZE

    // Android/desktop: o navegador avisa que dá para instalar.
    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      if (!snoozed) setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iPhone/iPad: não há evento; se estiver no Safari (não instalado), oferece
    // o passo a passo.
    if (!snoozed && isIOS()) setShow(true)

    // Instalou pelo caminho nativo → some.
    const onInstalled = () => setShow(false)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const snooze = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignore */ } }
  const fechar = () => { snooze(); setShow(false) }

  async function instalar() {
    if (deferred) {
      // Android/desktop: dispara o instalador nativo do navegador.
      deferred.prompt()
      try { await deferred.userChoice } catch { /* ignore */ }
      setDeferred(null)
      setShow(false)
      return
    }
    // iPhone: abre o guia com os passos.
    setGuiaIOS(true)
  }

  if (!show) return null

  return (
    <>
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-brand to-orange-400 text-white p-3.5 shadow-sm flex items-center gap-3 relative overflow-hidden">
        <button onClick={fechar} aria-label="Fechar"
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
          <X size={13} />
        </button>
        <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Download size={22} />
        </div>
        <div className="flex-1 min-w-0 pr-5">
          <p className="text-[14px] font-extrabold leading-tight">Instale o app da Turiva</p>
          <p className="text-[11.5px] text-white/90 leading-snug mt-0.5">
            Acesso rápido na tela do celular e avisos de reservas em tempo real.
          </p>
        </div>
        <button onClick={instalar}
          className="bg-white text-brand text-[12.5px] font-extrabold px-3.5 py-2 rounded-xl active:scale-95 transition-transform shrink-0">
          Instalar
        </button>
      </div>

      {/* Guia de instalação no iPhone/iPad */}
      {guiaIOS && createPortal(
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-end lg:items-center justify-center" onClick={() => setGuiaIOS(false)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl lg:rounded-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[16px] font-extrabold text-gray-900">Instalar no iPhone</p>
              <button onClick={() => setGuiaIOS(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <p className="text-[13px] text-gray-500 mb-4">Em 3 passos, no Safari:</p>
            <ol className="space-y-3">
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center shrink-0">1</span>
                <span className="text-[13.5px] text-gray-700 flex items-center gap-1.5 flex-wrap">
                  Toque no botão <ArrowUpFromLine size={16} className="text-brand" /> <b>Compartilhar</b>, na barra do Safari.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center shrink-0">2</span>
                <span className="text-[13.5px] text-gray-700 flex items-center gap-1.5 flex-wrap">
                  Escolha <Plus size={16} className="text-brand" /> <b>Adicionar à Tela de Início</b>.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center shrink-0">3</span>
                <span className="text-[13.5px] text-gray-700">Confirme em <b>Adicionar</b>. Pronto — o ícone aparece na tela! 🎉</span>
              </li>
            </ol>
            <div className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
              <Share size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-amber-700 leading-snug">
                Não achou o botão Compartilhar? Ele fica na barra de baixo (ou de cima) do Safari. Se estiver usando outro navegador, abra este site no <b>Safari</b> primeiro.
              </p>
            </div>
            <button onClick={() => { setGuiaIOS(false); fechar() }}
              className="mt-5 w-full bg-brand text-white font-bold py-3 rounded-xl active:scale-[0.99] transition-transform">
              Entendi
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
