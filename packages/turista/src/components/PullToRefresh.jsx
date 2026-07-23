import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Pull-to-refresh estilo Instagram: arrasta o topo da tela pra baixo,
// dispara onRefresh ao soltar acima do limite. Captura touch events apenas
// quando o scroll está no topo e o gesto é vertical (não engole carrosséis
// horizontais). Roda só em telas com toque — desktop não dispara.
const THRESHOLD     = 70   // distância para acionar
const MAX_PULL      = 120  // limite visual
const HOLD_DISTANCE = 60   // onde o indicador "fica" enquanto recarrega

export default function PullToRefresh({ onRefresh, children, disabled = false }) {
  const wrapperRef = useRef(null)
  const [pull, setPull]             = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const stateRef = useRef({ startY: 0, startX: 0, dragging: false, ignored: false })

  useEffect(() => {
    if (disabled) return
    const el = wrapperRef.current
    if (!el) return

    function onStart(e) {
      if (refreshing) return
      if (window.scrollY > 0) return
      const t = e.touches[0]
      stateRef.current = { startY: t.clientY, startX: t.clientX, dragging: true, ignored: false }
    }
    function onMove(e) {
      const s = stateRef.current
      if (!s.dragging || s.ignored) return
      const t  = e.touches[0]
      const dy = t.clientY - s.startY
      const dx = t.clientX - s.startX
      // Cancela se virar gesto horizontal (carrossel, swipe lateral)
      if (Math.abs(dx) > Math.abs(dy) + 10) { s.ignored = true; setPull(0); return }
      if (dy <= 0)             { setPull(0); return }
      if (window.scrollY > 0)  { s.ignored = true; setPull(0); return }
      // Resistência (puxar fica progressivamente mais "duro")
      const eased = Math.min(MAX_PULL, dy * 0.5)
      setPull(eased)
      if (eased > 0 && e.cancelable) e.preventDefault()
    }
    function onEnd() {
      const s = stateRef.current
      if (!s.dragging) return
      s.dragging = false
      setPull((current) => {
        if (current >= THRESHOLD) {
          // Mantém o indicador visível e dispara o refresh
          ;(async () => {
            setRefreshing(true)
            try { await onRefresh?.() } catch (_) {}
            setRefreshing(false)
            setPull(0)
          })()
          return HOLD_DISTANCE
        }
        return 0
      })
    }

    el.addEventListener('touchstart',  onStart, { passive: true })
    el.addEventListener('touchmove',   onMove,  { passive: false })
    el.addEventListener('touchend',    onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart',  onStart)
      el.removeEventListener('touchmove',   onMove)
      el.removeEventListener('touchend',    onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [disabled, refreshing, onRefresh])

  // Animar de volta quando o usuário solta. Durante o arrasto, segue o dedo (sem transição).
  const dragging   = stateRef.current.dragging
  const transform  = `translateY(${pull}px)`
  const transition = dragging ? 'none' : 'transform 250ms ease-out'

  return (
    <div ref={wrapperRef} className="relative">
      {/* Indicador no topo (acompanha o arrasto) */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-[60]"
        style={{
          top: -56, height: 56, transform, transition,
          opacity: Math.min(1, pull / 50),
        }}
      >
        <div className="w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100 flex items-center justify-center">
          {refreshing ? (
            <Loader2 size={18} className="text-brand animate-spin" />
          ) : (
            <div
              className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent"
              style={{ transform: `rotate(${pull * 4}deg)` }}
            />
          )}
        </div>
      </div>

      {/* Conteúdo — desce junto com o gesto */}
      <div style={{ transform, transition, willChange: 'transform' }}>
        {children}
      </div>
    </div>
  )
}
