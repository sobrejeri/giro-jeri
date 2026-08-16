import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Despacho from './pages/Despacho'
import Veiculos from './pages/Veiculos'
import Financeiro from './pages/Financeiro'
import Passeios from './pages/Passeios'
import Rotas from './pages/Rotas'
import Perfil from './pages/Perfil'
import Reservas from './pages/Reservas'
import Reputacao from './pages/Reputacao'
import OsPublica from './pages/OsPublica'
import UpdateGate from './components/UpdateGate'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  const location = useLocation()
  // Guarda o destino para voltar após login (deep link do WhatsApp deslogado).
  if (!token) {
    const next = location.pathname + location.search
    return <Navigate to="/login" replace state={{ from: next }} />
  }
  return children
}

// Deep link direto (WhatsApp): 404.html salva o caminho em sessionStorage e
// redireciona pra raiz do app; aqui recuperamos e navegamos pra ele.
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
    <UpdateGate />
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* PÚBLICA: link da OS enviado no WhatsApp do cliente e do motorista —
          eles não têm conta, então fica FORA do PrivateRoute. */}
      <Route path="/os/:token" element={<OsPublica />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<Dashboard />} />
        <Route path="reservas"   element={<Reservas />} />
        <Route path="cotacoes"   element={<Navigate to="/reservas" replace />} />
        <Route path="despacho"   element={<Despacho />} />
        <Route path="veiculos"   element={<Veiculos />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="passeios"   element={<Passeios />} />
        <Route path="rotas"      element={<Rotas />} />
        <Route path="reputacao"  element={<Reputacao />} />
        <Route path="perfil"     element={<Perfil />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  )
}
