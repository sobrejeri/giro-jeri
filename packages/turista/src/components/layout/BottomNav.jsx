import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Compass, Car, CalendarCheck, User } from 'lucide-react'

const NAV = [
  { to: '/',                icon: Home,         label: 'Início',    exact: true },
  { to: '/passeios',        icon: Compass,      label: 'Passeios' },
  { to: '/transfers',       icon: Car,          label: 'Translados' },
  { to: '/minhas-reservas', icon: CalendarCheck, label: 'Reservas' },
  { to: '/perfil',          icon: User,         label: 'Perfil' },
]

export default function BottomNav() {
  const navigate  = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 w-full bg-white z-50 border-t border-gray-100 md:hidden">
      <div className="flex items-center justify-around px-2 pt-1.5 pb-2">
        {NAV.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to)
          return (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="flex flex-col items-center gap-[2px] py-1.5 px-3 rounded-xl min-w-[52px] active:scale-95 transition-transform"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-brand/10' : ''}`}>
                <Icon
                  size={20}
                  className={active ? 'text-brand' : 'text-gray-400'}
                  strokeWidth={active ? 2.5 : 1.75}
                />
              </div>
              <span className={`text-[10px] transition-colors ${active ? 'text-brand font-semibold' : 'text-gray-400 font-medium'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
