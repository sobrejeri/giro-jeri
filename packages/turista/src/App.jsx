import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout              from './components/layout/Layout'
import CheckoutLayout      from './components/layout/CheckoutLayout'
import CheckoutSummary     from './pages/checkout/CheckoutSummary'
import CheckoutSolicitado  from './pages/checkout/CheckoutSolicitado'
import CheckoutPayment     from './pages/checkout/CheckoutPayment'
import CheckoutProcessando from './pages/checkout/CheckoutProcessando'
import CheckoutSucesso     from './pages/checkout/CheckoutSucesso'
import Home            from './pages/Home'
import Feed            from './pages/Feed'
import Tours           from './pages/Tours'
import TourDetail      from './pages/TourDetail'
import Transfers       from './pages/Transfers'
import Bookings        from './pages/Bookings'
import BookingDetail   from './pages/BookingDetail'
import Profile         from './pages/Profile'
import Auth            from './pages/Auth'
import Legal           from './pages/Legal'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  const location = useLocation()
  // Guarda o destino (path + query) para voltar após o login — ex.: cliente
  // clica no link do WhatsApp deslogado, loga, e cai direto na reserva.
  if (!token) {
    const next = location.pathname + location.search
    return <Navigate to="/login" replace state={{ from: next }} />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Auth — full screen, sem layout */}
      <Route path="/login"    element={<Auth defaultTab="login" />} />
      <Route path="/cadastro" element={<Auth defaultTab="register" />} />

      {/* Checkout — frame 430px, sem nav bars */}
      <Route path="/checkout" element={<PrivateRoute><CheckoutLayout /></PrivateRoute>}>
        <Route path="resumo"      element={<CheckoutSummary />} />
        <Route path="solicitado"  element={<CheckoutSolicitado />} />
        <Route path="pagamento"   element={<CheckoutPayment />} />
        <Route path="processando" element={<CheckoutProcessando />} />
        <Route path="sucesso"     element={<CheckoutSucesso />} />
      </Route>

      {/* App — layout responsivo com nav */}
      <Route path="/" element={<Layout />}>
        <Route index                      element={<Home />} />
        <Route path="eventos"             element={<Feed />} />
        <Route path="passeios"            element={<Tours />} />
        <Route path="passeios/:id"        element={<TourDetail />} />
        <Route path="transfers"           element={<Transfers />} />
        <Route path="minhas-reservas"     element={<PrivateRoute><Bookings /></PrivateRoute>} />
        <Route path="minhas-reservas/:id" element={<PrivateRoute><BookingDetail /></PrivateRoute>} />
        <Route path="perfil"              element={<Profile />} />
        <Route path="termos"              element={<Legal />} />
        <Route path="privacidade"         element={<Legal />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
