import { Component, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { Store, Megaphone, Sparkles, CalendarCheck, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import Tours from '../../pages/Tours'
import Affiliate from '../../pages/Affiliate'
import Feed from '../../pages/Feed'
import Bookings from '../../pages/Bookings'
import Profile from '../../pages/Profile'

// Troca de aba arrastando para o lado, estilo pager (Instagram). Enquanto o
// dedo arrasta, a tela vizinha JÁ VEM junto acompanhando o gesto — nada de
// fundo em branco. Vale só nas telas do menu inferior, na ordem do menu; em
// qualquer outra rota o gesto é ignorado e a tela funciona normal.
//
// Turista: Lojinha · Afiliado · Descubra · Reservas · Perfil.
// Criador (admin/operador): Lojinha · Descubra · Reservas · Perfil (o botão
// "Publicar" é uma ação, não uma tela, então fica fora do arrasto).
const TOURIST = ['/passeios', '/afiliado', '/eventos', '/minhas-reservas', '/perfil']
const CREATOR = ['/passeios', '/eventos', '/minhas-reservas', '/perfil']

// Componente de cada aba (para desenhar a vizinha durante o arrasto), se exige
// login, e o rótulo/ícone do painel de reserva (usado quando a vizinha exige
// login e o visitante está deslogado, ou se algo falhar ao pré-desenhar).
const META = {
  '/passeios':        { Comp: Tours,     auth: false, label: 'Lojinha',  Icon: Store },
  '/afiliado':        { Comp: Affiliate, auth: true,  label: 'Afiliado', Icon: Megaphone },
  '/eventos':         { Comp: Feed,      auth: false, label: 'Descubra', Icon: Sparkles },
  '/minhas-reservas': { Comp: Bookings,  auth: true,  label: 'Reservas', Icon: CalendarCheck },
  '/perfil':          { Comp: Profile,   auth: false, label: 'Perfil',   Icon: User },
}

const THRESHOLD  = 60   // px para efetivar a troca
const START_SLOP = 12   // zona morta antes de decidir o eixo
const DURATION   = 260  // ms da animação de encaixe/volta

// Se a tela vizinha (renderizada fora da própria rota) quebrar, cai para o
// painel simples em vez de derrubar o app durante o arrasto.
class PeekBoundary extends Component {
  constructor(p) { super(p); this.state = { err: false } }
  static getDerivedStateFromError() { return { err: true } }
  render() { return this.state.err ? this.props.fallback : this.props.children }
}

function Placeholder({ meta }) {
  const Icon = meta.Icon
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3">
      <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center">
        <Icon size={28} className="text-brand" />
      </div>
      <p className="text-[15px] font-bold text-gray-500">{meta.label}</p>
    </div>
  )
}

export default function SwipeTabs({ children }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, token } = useAuth()
  const isCreator = user?.user_type === 'admin' || user?.user_type === 'operator'
  const TABS = isCreator ? CREATOR : TOURIST

  const wrapRef = useRef(null)
  const [dx, setDx]       = useState(0)
  const [phase, setPhase] = useState('idle')  // 'idle' | 'drag' | 'snap' | 'commit'
  const [peek, setPeek]   = useState(null)    // { side: 1|-1, path } — vizinha visível
  const st = useRef({ x: 0, y: 0, active: false, decided: false, bail: false })
  const timer = useRef(null)

  const index   = TABS.indexOf(pathname)
  const enabled = index !== -1

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !enabled) return

    // Ignora quando o arrasto começa dentro de um carrossel horizontal
    // (favoritos, pastilhas, stories) ou de uma camada sobreposta
    // (fixed/modais) — assim o gesto rola o carrossel / fica na camada.
    const TAP_TAGS = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/
    const startedInException = (target) => {
      let n = target
      while (n && n !== el && n.nodeType === 1) {
        // Toque em um controle (coração, +, link, campo) é toque, nunca arrasto
        // de aba — assim um toque com leve tremida no dedo não vira swipe.
        if (TAP_TAGS.test(n.tagName) || n.getAttribute('role') === 'button') return true
        const s = getComputedStyle(n)
        if (s.position === 'fixed') return true
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true
        n = n.parentNode
      }
      return false
    }

    const peekFor = (delta) => {
      const side = delta < 0 ? 1 : -1            // arrasta p/ esquerda → próxima
      const j = index + side
      if (j < 0 || j >= TABS.length) return null // ponta: não há vizinha
      return { side, path: TABS[j] }
    }

    const onStart = (e) => {
      if (e.touches.length !== 1) { st.current.active = false; return }
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
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
        if (Math.abs(my) >= Math.abs(mx)) { s.active = false; return } // vertical → rolagem
        s.decided = true
        setPhase('drag')
      }
      if (e.cancelable) e.preventDefault()
      const nx = peekFor(mx)
      setPeek((cur) => (cur?.path === nx?.path && cur?.side === nx?.side ? cur : nx))
      // Sem vizinha (ponta) o arrasto tem resistência; com vizinha acompanha 1:1.
      const d = nx ? mx : mx * 0.35
      setDx(d)
    }
    const onEnd = (e) => {
      const s = st.current
      if (!s.active) return
      s.active = false
      if (!s.decided) { setPhase('idle'); return }
      const t  = e.changedTouches && e.changedTouches[0]
      const mx = t ? t.clientX - s.x : 0
      const nx = peekFor(mx)
      if (nx && Math.abs(mx) >= THRESHOLD) {
        // Encaixa a vizinha (desliza até o fim) e então efetiva a rota.
        const w = window.innerWidth
        setPeek(nx)
        setPhase('commit')
        setDx(-nx.side * w)
        timer.current = setTimeout(() => { timer.current = null; navigate(nx.path) }, DURATION)
      } else {
        // Não passou do limite: volta ao lugar.
        setPhase('snap')
        setDx(0)
        timer.current = setTimeout(() => { timer.current = null; setPhase('idle'); setPeek(null) }, DURATION)
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

  // Ao trocar de rota, zera tudo (a tela nova entra centralizada).
  useEffect(() => {
    setDx(0); setPhase('idle'); setPeek(null)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [pathname])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const active     = phase !== 'idle'
  const transition = phase === 'drag' ? 'none' : `transform ${DURATION}ms cubic-bezier(0.22,1,0.36,1)`

  // Só aplica transform enquanto o gesto está ativo — em repouso não há
  // transform algum, para não criar bloco de contêiner que atrapalharia
  // headers sticky / elementos fixed das páginas.
  const paneStyle = active ? { transform: `translateX(${dx}px)`, transition, willChange: 'transform' } : undefined

  let peekNode = null
  if (active && peek) {
    const meta = META[peek.path]
    const needsAuth = meta.auth && !token
    peekNode = createPortal(
      <div
        aria-hidden
        style={{
          position: 'fixed', top: 0, bottom: 0, left: 0, width: '100vw',
          transform: `translateX(calc(${peek.side * 100}vw + ${dx}px))`,
          transition, zIndex: 45, overflow: 'hidden', background: '#f3efe9',
          pointerEvents: 'none',
        }}
      >
        {needsAuth
          ? <Placeholder meta={meta} />
          : <PeekBoundary fallback={<Placeholder meta={meta} />}><meta.Comp /></PeekBoundary>}
      </div>,
      document.body,
    )
  }

  return (
    <div ref={wrapRef}>
      <div style={paneStyle}>{children}</div>
      {peekNode}
    </div>
  )
}
