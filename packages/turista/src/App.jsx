import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout          from './components/layout/Layout'
import CheckoutLayout  from './components/layout/CheckoutLayout'
import Home            from './pages/Home'
import Tours           from './pages/Tours'
import TourDetail      from './pages/TourDetail'
import Transfers       from './pages/Transfers'
import Bookings        from './pages/Bookings'
import BookingDetail   from './pages/BookingDetail'
import Login           from './pages/Login'
import Register        from './pages/Register'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Auth — full screen, sem layout */}
      <Route path="/login"    element={<Login />} />
      <Route path="/cadastro" element={<Register />} />

      {/* Checkout — frame 430px, sem nav bars */}
      <Route path="/checkout" element={<PrivateRoute><CheckoutLayout /></PrivateRoute>}>
        {/* telas de checkout serão adicionadas aqui */}
      </Route>

      {/* App — layout responsivo com nav */}
      <Route path="/" element={<Layout />}>
        <Route index                      element={<Home />} />
        <Route path="passeios"            element={<Tours />} />
        <Route path="passeios/:id"        element={<TourDetail />} />
        <Route path="transfers"           element={<Transfers />} />
        <Route path="minhas-reservas"     element={<PrivateRoute><Bookings /></PrivateRoute>} />
        <Route path="minhas-reservas/:id" element={<PrivateRoute><BookingDetail /></PrivateRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
