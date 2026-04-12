import { NavLink, useLocation } from 'react-router-dom'
import { Home, Compass, Car, CalendarDays } from 'lucide-react'

const NAV = [
  { to: '/',                icon: Home,        label: 'Início',    exact: true },
  { to: '/passeios',        icon: Compass,     label: 'Passeios' },
  { to: '/transfers',       icon: Car,         label: 'Transfers' },
  { to: '/minhas-reservas', icon: CalendarDays, label: 'Reservas'  },
]

export default function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur border-t border-gray-100 z-50 md:hidden">
      <div className="flex items-center h-16">
        {NAV.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className="flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors tap-highlight-none"
            >
              <div className={`relative flex items-center justify-center transition-all ${active ? 'scale-110' : ''}`}>
                <Icon
                  size={22}
                  className={active ? 'text-brand' : 'text-gray-400'}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                {active && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
                )}
              </div>
              <span className={`text-[10px] font-semibold ${active ? 'text-brand' : 'text-gray-400'}`}>
                {label}
              </span>
            </NavLink>
          )
        })}
      </div>
      {/* iOS safe area */}
      <div className="h-safe-bottom bg-white/95" />
    </nav>
  )
}
