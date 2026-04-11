import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { MapPin } from 'lucide-react'

export default function Register() {
  const navigate  = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    setLoading(true)
    try {
      const data = await api.register({
        full_name: form.full_name,
        email:     form.email,
        password:  form.password,
        phone:     form.phone || undefined,
      })
      login(data.user, data.token, data.refresh_token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-3">
            <MapPin size={22} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-2xl text-gray-900">Giro Jeri</h1>
          <p className="text-gray-500 mt-1 text-sm">Crie sua conta gratuita</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nome completo"
              type="text"
              value={form.full_name}
              onChange={set('full_name')}
              placeholder="Seu nome"
              required
              autoFocus
            />
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="seu@email.com"
              required
            />
            <Input
              label="WhatsApp (opcional)"
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="(88) 9 9999-9999"
            />
            <Input
              label="Senha"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="Mínimo 8 caracteres"
              required
            />
            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Criando conta…' : 'Criar conta'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Já tem conta?{' '}
            <Link to="/login" className="text-brand font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
