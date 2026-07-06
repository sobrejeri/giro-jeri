import { useState, useEffect } from 'react'
import { Download, Share, X, Plus } from 'lucide-react'

// Já está rodando como app instalado? (Android: display-mode standalone; iOS: navigator.standalone)
function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '')
}

/**
 * InstallPrompt — botão "Instalar app" (PWA).
 * - Android/Chrome: dispara o instalador nativo (beforeinstallprompt).
 * - iOS/Safari: abre instruções (Compartilhar → Adicionar à Tela de Início).
 * - Some quando o app já está instalado (modo standalone).
 */
export default function InstallPrompt() {
  const [installed, setInstalled] = useState(isStandalone())
  const [deferred,  setDeferred]  = useState(() => window.deferredInstallPrompt || null)
  const [showHelp,  setShowHelp]  = useState(false)

  useEffect(() => {
    const onPrompt    = (e) => { e.preventDefault(); window.deferredInstallPrompt = e; setDeferred(e) }
    const onInstalled = () => { setInstalled(true); setDeferred(null); window.deferredInstallPrompt = null }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  const ios = isIOS()

  async function handleClick() {
    if (deferred) {
      deferred.prompt()
      const choice = await deferred.userChoice.catch(() => null)
      if (choice?.outcome === 'accepted') setInstalled(true)
      setDeferred(null)
      window.deferredInstallPrompt = null
      return
    }
    setShowHelp(true)
  }

  return (
    <section className="pb-2">
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 bg-brand/10 border border-brand/20 rounded-2xl px-4 py-3.5 active:scale-[0.99] transition-transform"
      >
        <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shrink-0">
          <Download size={20} className="text-white" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-[14px] font-bold text-gray-900">Instalar o app Turiva</p>
          <p className="text-[11px] text-gray-500">Acesso rápido na tela inicial, como um aplicativo</p>
        </div>
      </button>

      {showHelp && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowHelp(false)} />
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[60] pb-8">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-[16px] font-bold text-gray-900">Instalar o app</p>
              <button onClick={() => setShowHelp(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="px-5 space-y-3 text-[14px] text-gray-700">
              {ios ? (
                <>
                  <p className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-brand">1.</span> Toque em
                    <Share size={16} className="text-brand" /> <b>Compartilhar</b>, na barra do Safari.
                  </p>
                  <p><span className="font-bold text-brand">2.</span> Role e escolha <b>“Adicionar à Tela de Início”</b>.</p>
                  <p className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-brand">3.</span> Toque em <b>“Adicionar”</b>
                    <Plus size={15} className="text-brand" /> — pronto, o ícone aparece na tela.
                  </p>
                  <p className="text-[12px] text-gray-400 pt-1">No iPhone, instale pelo <b>Safari</b> (não pelo Chrome).</p>
                </>
              ) : (
                <>
                  <p><span className="font-bold text-brand">1.</span> Abra o menu do navegador (⋮).</p>
                  <p><span className="font-bold text-brand">2.</span> Toque em <b>“Instalar app”</b> ou <b>“Adicionar à tela inicial”</b>.</p>
                  <p><span className="font-bold text-brand">3.</span> Confirme — o ícone aparece na tela inicial.</p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
