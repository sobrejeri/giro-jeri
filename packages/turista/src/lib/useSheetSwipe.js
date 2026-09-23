import { useEffect, useRef, useState } from 'react'

// Arrastar a folha (bottom sheet) para baixo pela área de "puxar" — o
// cabeçalho/imagem — para fechar, sem precisar do X. Segue o dedo; ao soltar,
// se passou do limite desliza para fora e chama onClose, senão volta ao lugar.
//
// Uso:
//   const { dragRef, sheetStyle, backdropStyle } = useSheetSwipe(onClose)
//   <div style={backdropStyle} onClick={onClose} />
//   <div style={sheetStyle}> <div ref={dragRef}>…imagem/topo…</div> …conteúdo… </div>
//
// Listeners nativos com passive:false (igual ao PullToRefresh/SwipeTabs) para
// poder preventDefault e não rolar a página durante o arrasto.
const THRESHOLD = 110  // px arrastados para efetivar o fechamento
const CLOSE_MS  = 220

export function useSheetSwipe(onClose) {
  const dragRef = useRef(null)
  const [dragY, setDragY] = useState(0)
  const st = useRef({ y: 0, active: false, dragging: false })
  const timer = useRef(null)

  useEffect(() => {
    const el = dragRef.current
    if (!el) return

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      st.current = { y: e.touches[0].clientY, active: true, dragging: true }
    }
    const onMove = (e) => {
      const s = st.current
      if (!s.active) return
      const dy = e.touches[0].clientY - s.y
      if (dy > 0) {
        if (e.cancelable) e.preventDefault()
        setDragY(dy)
      } else {
        setDragY(0)  // arrastou para cima: sem efeito
      }
    }
    const onEnd = () => {
      const s = st.current
      if (!s.active) return
      s.active = false
      s.dragging = false
      setDragY((cur) => {
        if (cur > THRESHOLD) {
          timer.current = setTimeout(() => { timer.current = null; onClose?.() }, CLOSE_MS - 20)
          return (typeof window !== 'undefined' ? window.innerHeight : 800)
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
  }, [onClose])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const dragging   = st.current.dragging
  const transition = dragging ? 'none' : `transform ${CLOSE_MS}ms cubic-bezier(0.22,1,0.36,1)`
  const sheetStyle = { transform: `translateY(${dragY}px)`, transition, willChange: 'transform' }
  // A cortina clareia conforme o arrasto — dá a sensação de estar fechando.
  const progress = Math.min(1, dragY / 400)
  const backdropStyle = { opacity: 1 - progress * 0.8, transition: dragging ? 'none' : `opacity ${CLOSE_MS}ms` }

  return { dragRef, sheetStyle, backdropStyle }
}
