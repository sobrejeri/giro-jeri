// Painel da EMPRESA: equipe de operadores, comissões e conta de recebimento.
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Users, Wallet, Landmark, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Equipe from './empresa/Equipe'
import Comissoes from './empresa/Comissoes'
import Conta from './empresa/Conta'

const ABAS = [
  { id: 'equipe',    rotulo: 'Equipe',    Icone: Users,    Tela: Equipe },
  { id: 'comissoes', rotulo: 'Comissões', Icone: Wallet,   Tela: Comissoes },
  { id: 'conta',     rotulo: 'Conta',     Icone: Landmark, Tela: Conta },
]
const CHAVE = 'empresa_aba'
const abaSalva = () => { try { return sessionStorage.getItem(CHAVE) } catch { return null } }

export default function Empresa() {
  const { user, token, logout } = useAuth()
  const [aba, setAba] = useState(() => (ABAS.some((a) => a.id === abaSalva()) ? abaSalva() : 'equipe'))
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type !== 'company') return <Navigate to="/" replace />

  const trocar = (id) => { setAba(id); try { sessionStorage.setItem(CHAVE, id) } catch { /* sem armazenamento */ } }
  const { Tela } = ABAS.find((a) => a.id === aba)

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-brand uppercase tracking-wide">Empresa</p>
              <h1 className="text-lg font-bold text-gray-900 truncate">{user.full_name}</h1>
            </div>
            <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 shrink-0">
              <LogOut size={16} /> Sair
            </button>
          </div>
          <nav className="flex gap-1 mt-3 -mb-px" role="tablist" aria-label="Seções da empresa">
            {ABAS.map(({ id, rotulo, Icone }) => (
              <button key={id} role="tab" aria-selected={aba === id} onClick={() => trocar(id)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  aba === id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                <Icone size={16} /> {rotulo}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <section className="max-w-3xl mx-auto p-4" role="tabpanel">
        <Tela />
      </section>
    </main>
  )
}
