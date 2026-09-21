import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, X, Share, Plus, ArrowUpFromLine, ChevronRight } from 'lucide-react'
import { isIOS, isStandalone } from '../lib/push'

// Faixa fina no topo (estilo do selo de operador) convidando a instalar o PWA
// para acompanhar a corrida em tempo real. Ao tocar, dispara o instalador
// nativo (Android/desktop) ou abre o passo a passo (iPhone). Some quando o app
// já está instalado (standalone), quando a instalação conclui, ou quando o
// cliente fecha (guarda por alguns dias).
const KEY = 'install_bar_dismissed_at'
const SNOOZE = 7 * 24 * 60 * 60 * 1000 // 7 dias

export default function InstallBar() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [guiaIOS, setGuiaIOS] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    let dismissed = 0
    try { dismissed = Number(localStorage.getItem(KEY)) || 0 } catch { /* ignore */ }
    const snoozed = Date.now() - dismissed < SNOOZE

    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      if (!snoozed) setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iPhone/iPad no Safari: não há evento; oferece o passo a passo.
    if (!snoozed && isIOS()) setShow(true)

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
      deferred.prompt()
      try { await deferred.userChoice } catch { /* ignore */ }
      setDeferred(null)
      setShow(false)
      return
    }
    setGuiaIOS(true)
  }

  if (!show) return null

  return (
    <>
      <div className="sticky top-0 z-40 bg-brand text-white px-4 py-2 flex items-center gap-2">
        <Download size={15} className="shrink-0" />
        <button onClick={instalar} className="flex-1 min-w-0 text-left flex items-center gap-1">
          <span className="text-[12px] font-semibold truncate">
            Instale o app para acompanhar sua corrida em tempo real
          </span>
          <ChevronRight size={14} className="shrink-0 opacity-90" />
        </button>
        <button
          onClick={fechar}
          aria-label="Fechar"
          className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-95 shrink-0"
        >
          <X size={12} />
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
            <p className="text-[13px] text-gray-500 mb-4">
              Instale para receber o PIN e acompanhar a corrida em tempo real. Em 3 passos, no Safari:
            </p>
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
