import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Compass, Car, CalendarCheck, User } from 'lucide-react'

export default function BottomNav() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const { t }        = useTranslation()

  const NAV = [
    { to: '/',                icon: Home,          label: t('nav.home'),      exact: true },
    { to: '/passeios',        icon: Compass,       label: t('nav.tours') },
    { to: '/transfers',       icon: Car,           label: t('nav.transfers') },
    { to: '/minhas-reservas', icon: CalendarCheck, label: t('nav.bookings') },
    { to: '/perfil',          icon: User,          label: t('nav.profile') },
  ]

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white z-50 border-t border-gray-100">
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
