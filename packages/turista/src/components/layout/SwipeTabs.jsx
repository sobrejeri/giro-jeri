import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// Troca de aba arrastando para o lado (estilo Instagram/apps de abas). Só vale
// nas telas do menu inferior — em qualquer outra rota o gesto é ignorado e a
// tela funciona normal. A ordem segue exatamente o menu de cada perfil.
//
// Turista: Lojinha · Afiliado · Descubra · Reservas · Perfil.
// Criador (admin/operador): Lojinha · Descubra · Reservas · Perfil (o botão
// "Publicar" é uma ação, não uma tela, então fica de fora do arrasto).
const TOURIST = ['/passeios', '/afiliado', '/eventos', '/minhas-reservas', '/perfil']
const CREATOR = ['/passeios', '/eventos', '/minhas-reservas', '/perfil']

const THRESHOLD  = 60   // distância mínima (px) para efetivar a troca de aba
const MAX_DRAG   = 150  // quanto o conteúdo acompanha o dedo
const START_SLOP = 12   // zona morta inicial antes de decidir o eixo do gesto

export default function SwipeTabs({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isCreator = user?.user_type === 'admin' || user?.user_type === 'operator'
  const TABS = isCreator ? CREATOR : TOURIST

  const wrapRef = useRef(null)
  const [dx, setDx]       = useState(0)
  const [phase, setPhase] = useState('idle') // 'idle' | 'drag' | 'snap'
  const st = useRef({ x: 0, y: 0, active: false, decided: false, bail: false })
  const snapTimer = useRef(null)

  const index   = TABS.indexOf(pathname)
  const enabled = index !== -1

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !enabled) return

    // Ignora o arrasto quando ele começa dentro de um carrossel horizontal
    // (favoritos, pastilhas, stories) ou de uma camada sobreposta (modais,
    // detalhe do passeio) — assim o gesto rola o carrossel / fica na camada,
    // em vez de trocar de aba.
    const startedInException = (target) => {
      let n = target
      while (n && n !== el && n.nodeType === 1) {
        const s = getComputedStyle(n)
        if (s.position === 'fixed') return true
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true
        n = n.parentNode
      }
      return false
    }

    const onStart = (e) => {
      if (e.touches.length !== 1) { st.current.active = false; return }
      if (snapTimer.current) { clearTimeout(snapTimer.current); snapTimer.current = null }
      const t = e.touches[0]
      st.current = { x: t.clientX, y: t.clientY, active: true, decided: false, bail: startedInException(e.target) }
    }
    const onMove = (e) => {
      const s = st.current
      if (!s.active || s.bail) return
      const t  = e.touches[0]
      const mx = t.clientX - s.x
      const my = t.clientY - s.y
      if (!s.decided) {
        if (Math.abs(mx) < START_SLOP && Math.abs(my) < START_SLOP) return
        // Gesto vertical → deixa a rolagem / pull-to-refresh cuidarem.
        if (Math.abs(my) >= Math.abs(mx)) { s.active = false; return }
        s.decided = true
        setPhase('drag')
      }
      if (e.cancelable) e.preventDefault()
      // Resistência nas pontas (primeira/última aba não têm para onde ir).
      let d = mx
      if ((index === 0 && d > 0) || (index === TABS.length - 1 && d < 0)) d *= 0.35
      setDx(Math.max(-MAX_DRAG, Math.min(MAX_DRAG, d)))
    }
    const onEnd = (e) => {
      const s = st.current
      if (!s.active) return
      s.active = false
      if (!s.decided) { setPhase('idle'); return }
      const t  = e.changedTouches && e.changedTouches[0]
      const mx = t ? t.clientX - s.x : 0
      let target = -1
      if      (mx <= -THRESHOLD && index < TABS.length - 1) target = index + 1 // arrastou p/ esquerda → próxima
      else if (mx >=  THRESHOLD && index > 0)               target = index - 1 // arrastou p/ direita → anterior
      if (target !== -1) {
        setPhase('idle'); setDx(0)
        navigate(TABS[target])
      } else {
        // Não passou do limite: volta ao lugar com transição.
        setPhase('snap'); setDx(0)
        snapTimer.current = setTimeout(() => { setPhase('idle'); snapTimer.current = null }, 240)
      }
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
  }, [enabled, index, navigate, TABS])

  // Ao trocar de rota, zera o deslocamento (a tela nova entra centralizada).
  useEffect(() => {
    setDx(0); setPhase('idle')
    if (snapTimer.current) { clearTimeout(snapTimer.current); snapTimer.current = null }
  }, [pathname])

  useEffect(() => () => { if (snapTimer.current) clearTimeout(snapTimer.current) }, [])

  // Só aplica transform enquanto o gesto está ativo — em repouso não há
  // transform algum, para não criar bloco de contêiner que quebraria headers
  // sticky / elementos fixed das páginas.
  const active = phase !== 'idle'
  const style  = (enabled && active)
    ? {
        transform: `translateX(${dx}px)`,
        transition: phase === 'drag' ? 'none' : 'transform 240ms cubic-bezier(0.22,1,0.36,1)',
        willChange: 'transform',
      }
    : undefined

  return <div ref={wrapRef} style={style}>{children}</div>
}
