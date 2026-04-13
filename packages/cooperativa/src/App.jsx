import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Cotacoes from './pages/Cotacoes'
import Despacho from './pages/Despacho'
import Veiculos from './pages/Veiculos'
import Financeiro from './pages/Financeiro'
import Passeios from './pages/Passeios'
import Rotas from './pages/Rotas'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<Dashboard />} />
        <Route path="cotacoes"   element={<Cotacoes />} />
        <Route path="despacho"   element={<Despacho />} />
        <Route path="veiculos"   element={<Veiculos />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="passeios"   element={<Passeios />} />
        <Route path="rotas"      element={<Rotas />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
