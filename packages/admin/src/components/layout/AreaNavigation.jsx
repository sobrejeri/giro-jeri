import { Link, useLocation } from 'react-router-dom'
import { getArea, matchesLink } from './navigation'

export default function AreaNavigation() {
  const { pathname } = useLocation()
  const area = getArea(pathname)
  if (!area || area.links.length < 2) return null

  return (
    <nav aria-label={`Ferramentas de ${area.label}`} className="mb-4 rounded-xl border border-gray-800 bg-gray-900 p-2">
      <p className="px-2 pb-1 text-xs text-gray-400">{area.label}</p>
      <div className="flex flex-wrap gap-1">
        {area.links.map(link => (
          <Link key={link.to} to={link.to}
            aria-current={matchesLink(link, pathname) ? 'page' : undefined}
            className={`inline-flex items-center min-h-11 px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
              matchesLink(link, pathname) ? 'bg-brand/20 text-brand' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
            }`}>
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
