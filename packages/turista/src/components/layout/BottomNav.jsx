import { NavLink, useLocation } from 'react-router-dom'
import { Home, Compass, Car, CalendarDays } from 'lucide-react'

const NAV = [
  { to: '/',               icon: Home,        label: 'Início',    exact: true },
  { to: '/passeios',       icon: Compass,     label: 'Passeios' },
  { to: '/transfers',      icon: Car,         label: 'Transfers' },
  { to: '/minhas-reservas',icon: CalendarDays,label: 'Reservas'  },
]

export default function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-50">
      <div className="flex items-center">
        {NAV.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors"
            >
              <Icon
                size={22}
                className={active ? 'text-brand' : 'text-gray-400'}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-brand' : 'text-gray-400'}`}>
                {label}
              </span>
            </NavLink>
          )
        })}
      </div>
      {/* safe area for iOS */}
      <div className="h-safe-bottom bg-white" />
    </nav>
  )
}
