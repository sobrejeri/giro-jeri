import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getArea, matchesLink } from './navigation'

// Ferramentas da área atual como abas, numa linha só, logo abaixo do cabeçalho
// (fora da rolagem do conteúdo, então ficam sempre à vista). Antes era um
// cartão dentro da página, com o nome da área repetido e links que quebravam
// em duas linhas no celular. No celular a faixa rola para o lado: a aba ativa
// é trazida para a vista e as bordas esmaecem quando há mais abas escondidas.
export default function AreaNavigation() {
  const { pathname } = useLocation()
  const area = getArea(pathname)
  const trilho = useRef(null)
  const [bordas, setBordas] = useState({ esq: false, dir: false })

  const medir = () => {
    const el = trilho.current
    if (!el) return
    setBordas({ esq: el.scrollLeft > 4, dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }

  useEffect(() => {
    const el = trilho.current
    if (!el) return
    const ativa = el.querySelector('[aria-current="page"]')
    if (ativa) el.scrollLeft = Math.max(0, ativa.offsetLeft - (el.clientWidth - ativa.offsetWidth) / 2)
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [pathname])

  if (!area || area.links.length < 2) return null

  return (
    <nav aria-label={`Ferramentas de ${area.label}`} className="relative flex-shrink-0 bg-gray-900 border-b border-gray-800">
      <div ref={trilho} onScroll={medir} className="flex gap-1 overflow-x-auto scrollbar-hide px-2 sm:px-4">
        {area.links.map(link => {
          const ativa = matchesLink(link, pathname)
          return (
            <Link key={link.to} to={link.to}
              aria-current={ativa ? 'page' : undefined}
              className={`shrink-0 inline-flex items-center min-h-11 px-3 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                ativa ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-100'
              }`}>
              {link.label}
            </Link>
          )
        })}
      </div>
      {bordas.esq && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-gray-900 to-transparent" />}
      {bordas.dir && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-gray-900 to-transparent" />}
    </nav>
  )
}
