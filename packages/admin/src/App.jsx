import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Usuarios from './pages/Usuarios'
import Catalogo from './pages/Catalogo'
import Precos from './pages/Precos'
import Regioes from './pages/Regioes'
import Cupons from './pages/Cupons'
import Afiliados from './pages/Afiliados'
import Temporada from './pages/Temporada'
import Financeiro from './pages/Financeiro'
import Auditoria from './pages/Auditoria'
import Configuracoes from './pages/Configuracoes'
import Reservas from './pages/Reservas'
import Feed from './pages/Feed'
import Estabelecimentos from './pages/Estabelecimentos'
import Stories from './pages/Stories'
import Perfil from './pages/Perfil'
import Repasses from './pages/Repasses'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  const location = useLocation()
  // Guarda o destino para voltar após login (se a sessão cair no meio da tela).
  if (!token) {
    const next = location.pathname + location.search
    return <Navigate to="/login" replace state={{ from: next }} />
  }
  return children
}

// Deep link direto: 404.html salva o caminho em sessionStorage; recupera aqui.
function SpaRedirectHandler() {
  const navigate = useNavigate()
  useEffect(() => {
    const saved = sessionStorage.getItem('spa_redirect')
    if (!saved) return
    sessionStorage.removeItem('spa_redirect')
    const base = import.meta.env.BASE_URL || '/'
    const rel  = saved.startsWith(base) ? '/' + saved.slice(base.length) : saved
    if (rel && rel !== '/' && !rel.startsWith('//')) navigate(rel, { replace: true })
  }, [navigate])
  return null
}

export default function App() {
  return (
    <>
    <SpaRedirectHandler />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="usuarios"     element={<Usuarios />} />
        <Route path="reservas"     element={<Reservas />} />
        <Route path="catalogo"     element={<Catalogo />} />
        <Route path="precos"       element={<Precos />} />
        <Route path="regioes"      element={<Regioes />} />
        <Route path="cupons"       element={<Cupons />} />
        <Route path="afiliados"    element={<Afiliados />} />
        <Route path="temporada"    element={<Temporada />} />
        <Route path="feed"         element={<Feed />} />
        <Route path="stories"      element={<Stories />} />
        <Route path="estabelecimentos" element={<Estabelecimentos />} />
        <Route path="financeiro"   element={<Financeiro />} />
        <Route path="repasses"     element={<Repasses />} />
        <Route path="auditoria"    element={<Auditoria />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="perfil"        element={<Perfil />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  )
}
