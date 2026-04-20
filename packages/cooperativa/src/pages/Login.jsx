import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm]       = useState({ email: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email:    form.email,
        password: form.password,
      })
      if (authError) throw new Error('Credenciais inválidas')

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, user_type, preferred_region_id, profile_photo_url')
        .eq('auth_id', data.user.id)
        .single()

      if (profileError || !profile) throw new Error('Perfil não encontrado. Contate o administrador.')
      if (!['operator', 'admin'].includes(profile.user_type)) {
        throw new Error('Acesso restrito a operadores e administradores.')
      }

      login(profile, data.session.access_token, data.session.refresh_token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-3xl text-brand">Giro Jeri</h1>
          <p className="text-gray-500 mt-1">Painel da Cooperativa</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="operador@girojeri.com"
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
        </div>
      </div>
    </div>
  )
}
