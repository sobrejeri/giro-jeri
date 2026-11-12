import { LayoutDashboard, CalendarCheck, Users, BookOpen, Newspaper, BarChart3, Settings } from 'lucide-react'

// Existing URLs remain valid; each screen belongs to one primary area.
export const AREAS = [
  { label: 'Visão geral', icon: LayoutDashboard, links: [
    { to: '/dashboard', label: 'Visão geral' },
  ] },
  { label: 'Reservas', icon: CalendarCheck, links: [
    { to: '/reservas', label: 'Reservas' },
  ] },
  { label: 'Pessoas e empresas', icon: Users, links: [
    { to: '/usuarios', label: 'Usuários e empresas' },
    { to: '/afiliados', label: 'Afiliados' },
  ] },
  { label: 'Catálogo e preços', icon: BookOpen, links: [
    { to: '/catalogo', label: 'Serviços' },
    { to: '/precos', label: 'Preços' },
    { to: '/temporada', label: 'Temporadas' },
    { to: '/estacionamentos', label: 'Estacionamentos' },
  ] },
  { label: 'Conteúdo e campanhas', icon: Newspaper, links: [
    { to: '/conteudo', label: 'Publicações', aliases: ['/feed', '/stories'] },
    { to: '/estabelecimentos', label: 'Estabelecimentos' },
    { to: '/cupons', label: 'Cupons' },
    { to: '/notificacoes', label: 'Envios e automações' },
  ] },
  { label: 'Financeiro', icon: BarChart3, links: [
    { to: '/financeiro', label: 'Receitas' },
    { to: '/repasses', label: 'Repasses' },
  ] },
  { label: 'Configurações', icon: Settings, links: [
    { to: '/configuracoes', label: 'Sistema' },
    { to: '/regioes', label: 'Regiões' },
    { to: '/marketing', label: 'Rastreamento e anúncios' },
    { to: '/auditoria', label: 'Auditoria' },
  ] },
]

export const matchesLink = (link, pathname) =>
  [link.to, ...(link.aliases || [])].includes(pathname.replace(/\/$/, '') || '/')

export const getArea = (pathname) => AREAS.find(area =>
  area.links.some(link => matchesLink(link, pathname)))

// Telas fora das áreas (acessadas pelo cabeçalho/rodapé do menu).
const OUTRAS_TELAS = { '/perfil': 'Meu perfil' }

// Título do cabeçalho: o nome da ÁREA, igual ao do menu lateral. As
// ferramentas da área aparecem como abas logo abaixo (AreaNavigation) — antes
// o cabeçalho tinha uma lista de títulos própria ("Motor de Preços", "Gestão
// de Usuários"…) que não batia com o menu.
export const getTitle = (pathname) =>
  getArea(pathname)?.label || OUTRAS_TELAS[pathname.replace(/\/$/, '')] || 'Admin'
