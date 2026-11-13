import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Empresa() {
  const { user, token, logout } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type !== 'company') return <Navigate to="/" replace />
  return <main className="min-h-screen bg-gray-50 p-4 flex justify-center">
    <section className="w-full max-w-xl mt-8">
      <div className="flex items-center justify-between gap-4"><h1 className="text-xl font-bold text-gray-900">Olá, {user.full_name}</h1><button onClick={logout} className="text-sm text-orange-600">Sair</button></div>
      <div className="bg-white border rounded-xl p-5 mt-5"><h2 className="font-semibold">Painel da empresa</h2><p className="text-sm text-gray-600 mt-2">O acesso foi criado. O cadastro da conta de recebimento, a equipe e as reservas ainda estão em desenvolvimento.</p></div>
    </section>
  </main>
}
