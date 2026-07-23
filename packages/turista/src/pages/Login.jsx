import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { MapPin } from 'lucide-react'

export default function Login() {
  const { t }     = useTranslation()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { login } = useAuth()
  const from      = location.state?.from || '/'

  const [form,    setForm]    = useState({ email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotMsg,  setForgotMsg]  = useState('')
  const [forgotLoad, setForgotLoad] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(form)
      login(data.user, data.token, data.refresh_token)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || t('miscPg.login.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot() {
    if (!form.email) {
      setForgotMsg(t('miscPg.login.forgotEmailRequired'))
      return
    }
    setForgotLoad(true)
    setForgotMsg('')
    try {
      await api.forgotPassword({
        email: form.email,
        redirect_url: `${window.location.origin}${import.meta.env.BASE_URL || '/'}login`,
      })
      setForgotMsg(t('miscPg.login.forgotSent'))
    } catch {
      setForgotMsg(t('miscPg.login.forgotSent'))
    } finally {
      setForgotLoad(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-3">
            <MapPin size={22} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-2xl text-gray-900">Turiva</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('miscPg.login.subtitle')}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('miscPg.login.emailLabel')}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder={t('miscPg.login.emailPlaceholder')}
              required
              autoFocus
            />
            <Input
              label={t('miscPg.login.passwordLabel')}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? t('miscPg.login.submitting') : t('miscPg.login.submit')}
            </Button>

            <button
              type="button"
              onClick={handleForgot}
              disabled={forgotLoad}
              className="block w-full text-center text-xs text-gray-500 hover:text-brand"
            >
              {forgotLoad ? t('miscPg.login.forgotSending') : t('miscPg.login.forgotPassword')}
            </button>
            {forgotMsg && (
              <p className="text-xs text-center text-gray-600 bg-amber-50 px-3 py-2 rounded-lg">
                {forgotMsg}
              </p>
            )}
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {t('miscPg.login.noAccount')}{' '}
            <Link to="/cadastro" className="text-brand font-medium hover:underline">
              {t('miscPg.login.signUp')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
