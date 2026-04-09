import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Usuarios from './pages/Usuarios'
import Catalogo from './pages/Catalogo'
import Precos from './pages/Precos'
import Regioes from './pages/Regioes'
import Cupons from './pages/Cupons'
import Temporada from './pages/Temporada'
import Financeiro from './pages/Financeiro'
import Auditoria from './pages/Auditoria'
import Configuracoes from './pages/Configuracoes'

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
        <Route path="dashboard"    element={<Dashboard />} />
        <Route path="usuarios"     element={<Usuarios />} />
        <Route path="catalogo"     element={<Catalogo />} />
        <Route path="precos"       element={<Precos />} />
        <Route path="regioes"      element={<Regioes />} />
        <Route path="cupons"       element={<Cupons />} />
        <Route path="temporada"    element={<Temporada />} />
        <Route path="financeiro"   element={<Financeiro />} />
        <Route path="auditoria"    element={<Auditoria />} />
        <Route path="configuracoes" element={<Configuracoes />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
