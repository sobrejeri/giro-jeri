import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Aviso de "sem conexão".
 *
 * Sem isto, offline o app apenas falha em silêncio (listas vazias, botões que
 * não respondem) e o usuário acha que quebrou. Aqui ele entende o que houve —
 * e ao voltar a rede as telas em uso se atualizam sozinhas.
 *
 * `navigator.onLine` só garante o negativo (false = offline de verdade);
 * true pode aparecer mesmo sem internet real, então tratamos apenas o caso
 * negativo, que é o confiável.
 */
export default function OfflineBanner() {
  const qc = useQueryClient()
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [reconnected, setReconnected] = useState(false)

  useEffect(() => {
    function goOffline() { setOffline(true); setReconnected(false) }
    function goOnline() {
      setOffline(false)
      setReconnected(true)
      // Voltou a rede: revalida o que está na tela, sem o usuário precisar
      // puxar para atualizar.
      qc.refetchQueries({ type: 'active' }).catch(() => {})
      setTimeout(() => setReconnected(false), 2500)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [qc])

  if (!offline && !reconnected) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-40 px-4 py-2 flex items-center justify-center gap-2 text-white transition-colors ${
        offline ? 'bg-gray-800' : 'bg-emerald-600'
      }`}
    >
      {offline ? (
        <>
          <WifiOff size={14} className="shrink-0" />
          <p className="text-[12px] font-semibold">
            Sem conexão — você pode navegar, mas não dá para reservar agora.
          </p>
        </>
      ) : (
        <p className="text-[12px] font-semibold">Conexão restabelecida ✓</p>
      )}
    </div>
  )
}
