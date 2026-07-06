import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

function formatCNPJ(v) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  // Destino após login: state do PrivateRoute (deep link), ?next= (sessão
  // expirada) ou o dashboard. Só aceita caminho interno (anti open-redirect).
  const rawNext = location.state?.from || new URLSearchParams(location.search).get('next')
  const from    = (rawNext && /^\/(?!\/)/.test(rawNext)) ? rawNext : '/dashboard'
  const [form, setForm]       = useState({ cnpj: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  function handleCNPJ(e) {
    setForm({ ...form, cnpj: formatCNPJ(e.target.value) })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login({ cnpj: form.cnpj, password: form.password })
      if (!data) throw new Error('Credenciais inválidas')

      const user = data.user
      if (!user) {
        throw new Error('Perfil não encontrado. Contate o administrador.')
      }
      if (!['operator', 'admin'].includes(user.user_type)) {
        throw new Error(`Acesso restrito a operadores. (tipo atual: ${user.user_type})`)
      }

      login(user, data.token, data.refresh_token)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-2">
          <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-16 h-16 rounded-2xl" />
          <div className="text-center">
            <p className="font-giro font-semibold text-[24px] text-gray-900 leading-tight tracking-[0.09em]">TURIVA</p>
            <p className="text-gray-500 text-sm mt-0.5">Painel da Cooperativa</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="CNPJ"
              value={form.cnpj}
              onChange={handleCNPJ}
              placeholder="00.000.000/0001-00"
              inputMode="numeric"
              required
              autoFocus
            />
            <Input
              label="Senha"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-gray-400">
            Acesso com CNPJ cadastrado pelo administrador da plataforma.
          </p>

          <button
            type="button"
            onClick={() => {
              const phone = import.meta.env.VITE_ADMIN_WHATSAPP || '5588999999999'
              const cnpj  = form.cnpj || '____________'
              const msg = encodeURIComponent(
                `Olá! Preciso redefinir a senha da minha cooperativa.\n\nCNPJ: ${cnpj}`
              )
              window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
            }}
            className="block mx-auto mt-2 text-xs text-brand hover:underline"
          >
            Esqueci minha senha → falar com o administrador
          </button>
        </div>
      </div>
    </div>
  )
}
