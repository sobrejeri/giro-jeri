// Painel da EMPRESA: equipe de operadores, comissões e conta de recebimento.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, setEmpresaDoAdmin } from '../lib/api'
import { Users, Wallet, Landmark, LogOut, CalendarCheck, Banknote, BarChart3 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Equipe from './empresa/Equipe'
import Reservas from './empresa/Reservas'
import Repasses from './empresa/Repasses'
import Comissoes from './empresa/Comissoes'
import Conta from './empresa/Conta'
import Relatorio from './empresa/Relatorio'

const ABAS = [
  { id: 'equipe',    rotulo: 'Equipe',    Icone: Users,    Tela: Equipe },
  { id: 'reservas',  rotulo: 'Reservas',  Icone: CalendarCheck, Tela: Reservas },
  { id: 'repasses',  rotulo: 'Repasses',  Icone: Banknote, Tela: Repasses },
  { id: 'relatorio', rotulo: 'Relatório', Icone: BarChart3, Tela: Relatorio },
  { id: 'comissoes', rotulo: 'Comissões', Icone: Wallet,   Tela: Comissoes },
  { id: 'conta',     rotulo: 'Conta',     Icone: Landmark, Tela: Conta },
]
const CHAVE = 'empresa_aba'
const abaSalva = () => { try { return sessionStorage.getItem(CHAVE) } catch { return null } }
const CHAVE_EMPRESA = 'giro_coop_admin_empresa'
const empresaSalva = () => { try { return localStorage.getItem(CHAVE_EMPRESA) || '' } catch { return '' } }

export default function Empresa() {
  const { user, token, logout, setAdminPanel } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [aba, setAba] = useState(() => (ABAS.some((a) => a.id === abaSalva()) ? abaSalva() : 'equipe'))
  const ehAdmin = user?.user_type === 'admin'

  // ADMIN: opera o painel de uma empresa que ele escolhe (como já faz com
  // Passeios e Estacionamento). Empresa logada: é sempre a dela.
  const [escolhida, setEscolhida] = useState(empresaSalva)
  const { data: lista, isPending: carregandoLista, isError: erroLista } = useQuery({
    queryKey: ['admin-companies'], queryFn: api.getCompanies, enabled: !!token && ehAdmin,
  })
  const empresas = lista?.companies || []
  // A escolha guardada pode ser de uma empresa que não existe mais.
  const empresaId = ehAdmin ? (empresas.some((e) => e.id === escolhida) ? escolhida : empresas[0]?.id || '') : null
  // Antes de os filhos buscarem dados: o cabeçalho X-Company-Id precisa estar pronto.
  setEmpresaDoAdmin(ehAdmin ? empresaId : null)
  useEffect(() => { if (ehAdmin) setAdminPanel('company') }, [ehAdmin, setAdminPanel])
  useEffect(() => () => setEmpresaDoAdmin(null), [])

  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type !== 'company' && !ehAdmin) return <Navigate to="/" replace />

  const trocar = (id) => { setAba(id); try { sessionStorage.setItem(CHAVE, id) } catch { /* sem armazenamento */ } }
  const trocarEmpresa = (id) => {
    setEscolhida(id); try { localStorage.setItem(CHAVE_EMPRESA, id) } catch { /* sem armazenamento */ }
    // Os dados em memória são da empresa anterior.
    qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('company-') })
  }
  const irPara = (painel) => { setAdminPanel(painel); navigate(painel === 'parking' ? '/estacionamento' : '/dashboard') }
  const { Tela } = ABAS.find((a) => a.id === aba)
  const nome = ehAdmin ? (empresas.find((e) => e.id === empresaId)?.full_name || 'Empresa') : user.full_name

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 pt-4">
          {ehAdmin && (
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Painel (admin)</p>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg max-w-sm">
                {[['tours', 'Passeios'], ['parking', 'Estacionamento'], ['company', 'Empresa']].map(([m, rotulo]) => (
                  <button key={m} onClick={() => m !== 'company' && irPara(m)} aria-pressed={m === 'company'}
                    className={`flex-1 text-xs font-medium px-1.5 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                      m === 'company' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-brand uppercase tracking-wide">Empresa</p>
              {ehAdmin && empresas.length > 0 ? (
                <select aria-label="Empresa" value={empresaId} onChange={(e) => trocarEmpresa(e.target.value)}
                  className="mt-0.5 w-full max-w-xs h-9 px-2 rounded-lg border border-gray-200 bg-white text-base font-bold text-gray-900">
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.is_active ? '' : ' (inativa)'}</option>)}
                </select>
              ) : (
                <h1 className="text-lg font-bold text-gray-900 truncate">{nome}</h1>
              )}
            </div>
            <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0">
              <LogOut size={16} /> Sair
            </button>
          </div>
          <nav className="grid grid-cols-3 sm:flex gap-x-1 mt-3 -mb-px" role="tablist" aria-label="Seções da empresa">
            {ABAS.map(({ id, rotulo, Icone }) => (
              <button key={id} role="tab" aria-selected={aba === id} onClick={() => trocar(id)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-1 sm:px-3 py-2.5 text-[13px] sm:text-sm whitespace-nowrap font-medium border-b-2 transition-colors ${
                  aba === id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                <Icone size={16} className="hidden sm:block shrink-0" /> {rotulo}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <section className="max-w-3xl mx-auto p-4" role="tabpanel">
        {ehAdmin && !empresaId ? (
          <div className="bg-white border border-gray-100 rounded-xl p-5 text-sm text-gray-700">
            {carregandoLista ? 'Carregando empresas…'
              : erroLista ? 'Não foi possível carregar as empresas.'
              : 'Nenhuma empresa cadastrada. Crie uma no painel administrativo, em Usuários, com a função Empresa.'}
          </div>
        ) : (
          // key: trocar de empresa remonta a tela (nada da empresa anterior fica).
          <Tela key={empresaId || 'propria'} empresa={nome} />
        )}
      </section>
    </main>
  )
}
