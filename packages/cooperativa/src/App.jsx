import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
        <Route path="perfil"     element={<Perfil />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
