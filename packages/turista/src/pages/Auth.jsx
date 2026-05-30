import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { MapPin, Eye, EyeOff, ArrowLeft } from 'lucide-react'

function TextField({ label, type = 'text', value, onChange, placeholder, required, autoFocus, hint }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type={isPassword ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand focus:bg-white transition-colors"
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export default function Auth({ defaultTab = 'login' }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { login } = useAuth()
  const { t }     = useTranslation()
  const from      = location.state?.from || '/'

  const [tab,     setTab]     = useState(location.state?.tab || defaultTab)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  /* ── Login form ──────────────────────────────────────── */
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(loginForm)
      login(data.user, data.token, data.refresh_token)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || t('auth.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  /* ── Register form ───────────────────────────────────── */
  const [regForm, setRegForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' })

  function setReg(field) {
    return (e) => { setError(''); setRegForm((f) => ({ ...f, [field]: e.target.value })) }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    if (regForm.password.length < 8) { setError(t('auth.passwordTooShort')); return }
    if (regForm.password !== regForm.confirm) { setError(t('auth.passwordMismatch')); return }
    setLoading(true)
    try {
      const data = await api.register({
        full_name: regForm.full_name,
        email:     regForm.email,
        password:  regForm.password,
        phone:     regForm.phone || undefined,
      })
      if (data.token) {
        login(data.user, data.token, data.refresh_token)
        navigate(from, { replace: true })
      } else {
        setSuccess(t('auth.accountCreated'))
        setTab('login')
        setLoginForm((f) => ({ ...f, email: regForm.email }))
      }
    } catch (err) {
      setError(err.message || t('auth.registerError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col">

      <button
        onClick={() => navigate(-1)}
        className="absolute top-5 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm active:bg-gray-50 z-10"
      >
        <ArrowLeft size={18} className="text-gray-600" />
      </button>

      {/* Hero */}
      <div className="bg-white pt-14 pb-6 px-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="w-14 h-14 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
          <MapPin size={26} className="text-white" />
        </div>
        <h1 className="font-bold text-[22px] text-gray-900 leading-tight">Giro Jeri</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">{t('auth.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="bg-white px-6 pt-2 pb-0">
        <div className="flex border-b border-gray-100">
          {(['login', 'register']).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError(''); setSuccess('') }}
              className={`flex-1 pb-3 text-[14px] font-semibold transition-colors border-b-2 -mb-px ${
                tab === tabKey ? 'text-brand border-brand' : 'text-gray-400 border-transparent'
              }`}
            >
              {tabKey === 'login' ? t('auth.tabLogin') : t('auth.tabRegister')}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 px-6 pt-6 pb-10 max-w-sm mx-auto w-full">
        {success && (
          <p className="text-[13px] text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl mb-4">{success}</p>
        )}
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl mb-4">{error}</p>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <TextField
              label={t('auth.email')}
              type="email"
              value={loginForm.email}
              onChange={(e) => { setError(''); setLoginForm((f) => ({ ...f, email: e.target.value })) }}
              placeholder={t('auth.emailPlaceholder')}
              required
              autoFocus
            />
            <TextField
              label={t('auth.password')}
              type="password"
              value={loginForm.password}
              onChange={(e) => { setError(''); setLoginForm((f) => ({ ...f, password: e.target.value })) }}
              placeholder={t('auth.passwordPlaceholder')}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-brand text-white rounded-xl font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60 shadow-sm shadow-brand/30 mt-2"
            >
              {loading ? t('auth.loginLoading') : t('auth.loginBtn')}
            </button>
            <p className="text-center text-[12px] text-gray-400 pt-1">
              {t('auth.noAccount')}{' '}
              <button type="button" onClick={() => { setTab('register'); setError('') }} className="text-brand font-semibold">
                {t('auth.signupFree')}
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <TextField
              label={t('auth.fullName')}
              value={regForm.full_name}
              onChange={setReg('full_name')}
              placeholder={t('auth.fullNamePlaceholder')}
              required
              autoFocus
            />
            <TextField
              label={t('auth.email')}
              type="email"
              value={regForm.email}
              onChange={setReg('email')}
              placeholder={t('auth.emailPlaceholder')}
              required
            />
            <TextField
              label={t('auth.whatsapp')}
              type="tel"
              value={regForm.phone}
              onChange={setReg('phone')}
              placeholder={t('auth.whatsappPlaceholder')}
              hint={t('auth.whatsappHint')}
            />
            <TextField
              label={t('auth.password')}
              type="password"
              value={regForm.password}
              onChange={setReg('password')}
              placeholder={t('auth.passwordMin')}
              required
            />
            <TextField
              label={t('auth.confirmPassword')}
              type="password"
              value={regForm.confirm}
              onChange={setReg('confirm')}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-brand text-white rounded-xl font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60 shadow-sm shadow-brand/30 mt-2"
            >
              {loading ? t('auth.registerLoading') : t('auth.registerBtn')}
            </button>
            <p className="text-center text-[12px] text-gray-400 pt-1">
              {t('auth.hasAccount')}{' '}
              <button type="button" onClick={() => { setTab('login'); setError('') }} className="text-brand font-semibold">
                {t('auth.loginLink')}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
