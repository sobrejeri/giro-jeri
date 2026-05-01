import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout          from './components/layout/Layout'
import CheckoutLayout   from './components/layout/CheckoutLayout'
import CheckoutSummary  from './pages/checkout/CheckoutSummary'
import CheckoutPayment  from './pages/checkout/CheckoutPayment'
import Home            from './pages/Home'
import Tours           from './pages/Tours'
import TourDetail      from './pages/TourDetail'
import Transfers       from './pages/Transfers'
import Bookings        from './pages/Bookings'
import BookingDetail   from './pages/BookingDetail'
import Profile         from './pages/Profile'
import Auth            from './pages/Auth'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Auth — full screen, sem layout */}
      <Route path="/login"    element={<Auth defaultTab="login" />} />
      <Route path="/cadastro" element={<Auth defaultTab="register" />} />

      {/* Checkout — frame 430px, sem nav bars */}
      <Route path="/checkout" element={<PrivateRoute><CheckoutLayout /></PrivateRoute>}>
        <Route path="resumo"    element={<CheckoutSummary />} />
        <Route path="pagamento" element={<CheckoutPayment />} />
        {/* processando, falha — a implementar */}
      </Route>

      {/* App — layout responsivo com nav */}
      <Route path="/" element={<Layout />}>
        <Route index                      element={<Home />} />
        <Route path="passeios"            element={<Tours />} />
        <Route path="passeios/:id"        element={<TourDetail />} />
        <Route path="transfers"           element={<Transfers />} />
        <Route path="minhas-reservas"     element={<PrivateRoute><Bookings /></PrivateRoute>} />
        <Route path="minhas-reservas/:id" element={<PrivateRoute><BookingDetail /></PrivateRoute>} />
        <Route path="perfil"              element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
