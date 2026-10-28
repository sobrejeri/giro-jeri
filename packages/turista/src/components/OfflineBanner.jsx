import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Aviso global de conexão. Fixo no topo enquanto o navegador reporta que está
// offline, para o cliente saber NA HORA que o problema é a internet dele — e não
// achar que a plataforma quebrou. Reage aos eventos online/offline do navegador.
export default function OfflineBanner() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  )

  useEffect(() => {
    const up   = () => setOffline(false)
    const down = () => setOffline(true)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 text-sm font-semibold px-4 py-2 flex items-center justify-center gap-2 shadow-md"
    >
      <WifiOff size={16} className="shrink-0" />
      {t('errors.offlineBanner')}
    </div>
  )
}
