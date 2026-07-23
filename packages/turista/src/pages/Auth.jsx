import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { MapPin, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react'
import PhoneInput from '../components/PhoneInput'

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
  // Destino após login: state do PrivateRoute (deep link) ou ?next= (sessão
  // que caiu no meio do uso). Só aceita caminho interno (começa com "/" e não
  // "//") pra evitar open-redirect.
  const rawNext   = location.state?.from || new URLSearchParams(location.search).get('next')
  const from      = (rawNext && /^\/(?!\/)/.test(rawNext)) ? rawNext : '/'

  const [tab,     setTab]     = useState(location.state?.tab || defaultTab)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  // Ativação por código no WhatsApp: { signup_token, dest, email, password }
  const [verif,   setVerif]   = useState(null)

  /* ── Login form ──────────────────────────────────────── */
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [forgotEmail, setForgotEmail] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Campo único aceita e-mail OU nome de usuário: com "@" vai como email,
      // senão vai como username (o backend resolve o e-mail da conta).
      const raw = (loginForm.email || '').trim()
      const payload = raw.includes('@')
        ? { email: raw, password: loginForm.password }
        : { username: raw, password: loginForm.password }
      const data = await api.login(payload)
      login(data.user, data.token, data.refresh_token)
      navigate(from, { replace: true })
    } catch (err) {
      if (err?.payload?.status === 'verification_required') {
        // Conta existe mas ainda não ativou o WhatsApp — retoma o wizard.
        setVerif({
          signup_token: err.payload.signup_token,
          dest:         err.payload.channels?.whatsapp?.destination || 'seu WhatsApp',
          email:        loginForm.email,
          password:     loginForm.password,
          resend:       true, // veio do login: ainda não há código recente
        })
        setError('')
      } else {
        setError(err.message || t('auth.invalidCredentials'))
      }
    } finally {
      setLoading(false)
    }
  }

  /* ── Esqueci minha senha ─────────────────────────────── */
  async function handleForgot(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    setLoading(true)
    try {
      await api.forgotPassword({
        identifier:   forgotEmail,
        redirect_url: window.location.origin + (import.meta.env.BASE_URL || '/'),
      })
      setSuccess('Se a conta existir, enviamos um link para redefinir a senha (WhatsApp ou e-mail).')
      setTab('login')
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o e-mail. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Register form ───────────────────────────────────── */
  const [regForm, setRegForm] = useState({ full_name: '', email: '', phone: '+55 ', password: '', confirm: '' })

  function setReg(field) {
    return (e) => {
      setError('')
      setRegForm((f) => ({ ...f, [field]: e.target.value }))
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    if (regForm.password.length < 8) { setError(t('auth.passwordTooShort')); return }
    if (regForm.password !== regForm.confirm) { setError(t('auth.passwordMismatch')); return }
    if ((regForm.phone || '').replace(/\D/g, '').length < 10) {
      setError('Informe seu WhatsApp com DDD — enviamos um código para ativar a conta.')
      return
    }
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
      } else if (data.status === 'verification_required') {
        // Código já foi enviado no WhatsApp pelo cadastro
        setVerif({
          signup_token: data.signup_token,
          dest:         data.channels?.whatsapp?.destination || 'seu WhatsApp',
          email:        regForm.email,
          password:     regForm.password,
        })
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
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col lg:flex-row">

      <button
        onClick={() => navigate(-1)}
        className="absolute top-5 left-4 w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm active:bg-gray-50 z-10"
      >
        <ArrowLeft size={18} className="text-gray-600" />
      </button>

      {/* ── Desktop: painel da marca ── */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-center gap-6 px-14 text-white relative overflow-hidden bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 -left-12 w-80 h-80 rounded-full bg-white/5" />
        <div className="relative">
          <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mb-6">
            <MapPin size={28} className="text-white" />
          </div>
          <h2 className="text-4xl font-extrabold leading-tight">Sua viagem<br />começa aqui.</h2>
          <p className="text-white/85 text-lg mt-3 max-w-sm">Passeios, transfers e experiências em Jericoacoara — tudo num só lugar.</p>
          <ul className="mt-8 space-y-3 text-white/90 text-[15px]">
            <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-white/80 shrink-0" /> Reserva rápida e segura</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-white/80 shrink-0" /> Operadores e guias verificados</li>
            <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-white/80 shrink-0" /> Suporte no WhatsApp 24h</li>
          </ul>
        </div>
      </div>

      {/* ── Coluna do formulário (mobile: layout original via display:contents) ── */}
      <div className="contents lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:bg-white lg:overflow-y-auto">

      {/* Hero */}
      <div className="lg:hidden bg-white pt-14 pb-6 px-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <img
          src={import.meta.env.BASE_URL + 'logo-icon.jpeg'}
          alt="Turiva"
          className="w-14 h-14 rounded-2xl mx-auto mb-3 shadow-md object-cover"
        />
        <h1 className="font-bold text-[22px] text-gray-900 leading-tight">Turiva</h1>
        <p className="text-[13px] text-gray-400 mt-0.5">{t('auth.subtitle')}</p>
      </div>

      {/* Ativação por código no WhatsApp */}
      {verif ? (
        <VerifyWhatsapp
          verif={verif}
          onDone={async () => {
            // Conta ativada → entra direto com as credenciais do formulário
            try {
              const data = await api.login({ email: verif.email, password: verif.password })
              login(data.user, data.token, data.refresh_token)
              navigate(from, { replace: true })
            } catch {
              setVerif(null)
              setTab('login')
              setSuccess('Conta ativada! Entre com seu e-mail e senha.')
              setLoginForm((f) => ({ ...f, email: verif.email }))
            }
          }}
          onBack={() => { setVerif(null); setError(''); setTab('login') }}
        />
      ) : (
      <>
      {/* Tabs */}
      <div className="bg-white px-6 pt-2 pb-0 lg:max-w-md lg:mx-auto lg:w-full">
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
      <div className="flex-1 lg:flex-none px-6 pt-6 pb-10 max-w-sm mx-auto w-full lg:max-w-md">
        {success && (
          <p className="text-[13px] text-green-700 bg-green-50 border border-green-200 px-4 py-2.5 rounded-xl mb-4">{success}</p>
        )}
        {error && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl mb-4">{error}</p>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <TextField
              label="E-mail ou usuário"
              type="text"
              value={loginForm.email}
              onChange={(e) => { setError(''); setLoginForm((f) => ({ ...f, email: e.target.value })) }}
              placeholder="seu@email.com ou seu_usuario"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
            <p className="text-center pt-1">
              <button type="button" onClick={() => { setTab('forgot'); setError(''); setSuccess('') }} className="text-[12px] text-gray-400 hover:text-brand font-medium">
                Esqueci minha senha
              </button>
            </p>
            <p className="text-center text-[12px] text-gray-400 pt-1">
              {t('auth.noAccount')}{' '}
              <button type="button" onClick={() => { setTab('register'); setError('') }} className="text-brand font-semibold">
                {t('auth.signupFree')}
              </button>
            </p>
          </form>
        ) : tab === 'forgot' ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className="text-[13px] text-gray-500 leading-relaxed">
              Digite seu e-mail ou telefone (WhatsApp) e enviaremos um link para redefinir a senha.
            </p>
            <TextField
              label="E-mail ou telefone (WhatsApp)"
              type="text"
              value={forgotEmail}
              onChange={(e) => { setError(''); setForgotEmail(e.target.value) }}
              placeholder="seu@email.com ou +55 88 99999-9999"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-brand text-white rounded-xl font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60 shadow-sm shadow-brand/30 mt-2"
            >
              {loading ? 'Enviando…' : 'Enviar link de redefinição'}
            </button>
            <p className="text-center text-[12px] text-gray-400 pt-1">
              <button type="button" onClick={() => { setTab('login'); setError(''); setSuccess('') }} className="text-brand font-semibold">
                Voltar para o login
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
            <div>
              <label className="text-[12px] font-semibold text-gray-600 mb-1 block">{t('auth.whatsapp')}</label>
              <PhoneInput
                value={regForm.phone}
                onChange={(v) => { setError(''); setRegForm((f) => ({ ...f, phone: v })) }}
                placeholder={t('auth.whatsappPlaceholder')}
              />
              <p className="text-[11px] text-gray-400 mt-1">{t('auth.whatsappHint')}</p>
            </div>
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
            <p className="text-center text-[11px] text-gray-400 leading-relaxed">
              Ao criar sua conta, você concorda com os{' '}
              <a href={`${import.meta.env.BASE_URL || '/'}termos`} target="_blank" rel="noreferrer" className="text-brand font-semibold underline">Termos de Uso</a>
              {' '}e a{' '}
              <a href={`${import.meta.env.BASE_URL || '/'}privacidade`} target="_blank" rel="noreferrer" className="text-brand font-semibold underline">Política de Privacidade</a>.
            </p>
            <p className="text-center text-[12px] text-gray-400 pt-1">
              {t('auth.hasAccount')}{' '}
              <button type="button" onClick={() => { setTab('login'); setError('') }} className="text-brand font-semibold">
                {t('auth.loginLink')}
              </button>
            </p>
          </form>
        )}
      </div>
      </>
      )}
      </div>
    </div>
  )
}

/* ── Ativação da conta por código no WhatsApp ───────────────────
   O cadastro (ou o login de conta pendente) envia um código de 6 dígitos
   para o WhatsApp informado; a conta só entra depois de confirmar. */
function VerifyWhatsapp({ verif, onDone, onBack }) {
  const [code, setCode]         = useState('')
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState(null)   // { type: 'err'|'ok', text }
  const [cooldown, setCooldown] = useState(0)
  const [token, setToken]       = useState(verif.signup_token)
  const sentOnce = useRef(false)

  // Veio do login (sem código recente) → dispara o envio na entrada
  useEffect(() => {
    if (verif.resend && !sentOnce.current) { sentOnce.current = true; resend() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  async function resend() {
    if (busy || cooldown > 0) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.otpRequest({ signup_token: token, channel: 'whatsapp' })
      setCooldown(Number(r?.retry_after) || 60)
      setMsg({ type: 'ok', text: 'Código enviado no seu WhatsApp.' })
    } catch (err) {
      if (err?.status === 429 && err?.payload?.retry_after) setCooldown(Number(err.payload.retry_after))
      setMsg({ type: 'err', text: err?.message || 'Não foi possível enviar agora — tente de novo.' })
    } finally { setBusy(false) }
  }

  async function verify(e) {
    e?.preventDefault?.()
    if (busy || code.length !== 6) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.otpVerify({ signup_token: token, channel: 'whatsapp', code })
      if (r?.status === 'verified') { await onDone(); return }
      // Cenário raro: outro canal ainda pendente — renova o token e segue
      if (r?.signup_token) setToken(r.signup_token)
      setMsg({ type: 'err', text: 'Verificação incompleta — tente novamente.' })
    } catch (err) {
      const left = err?.payload?.attempts_left
      setMsg({
        type: 'err',
        text: err?.message + (Number.isFinite(left) ? ` (${left} tentativa${left === 1 ? '' : 's'} restante${left === 1 ? '' : 's'})` : ''),
      })
      if (err?.status === 410) setCode('')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex-1 lg:flex-none px-6 pt-8 pb-10 max-w-sm mx-auto w-full lg:max-w-md">
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-[#25D366]/10 flex items-center justify-center mx-auto mb-3">
          <span className="text-[26px]">💬</span>
        </div>
        <h2 className="font-bold text-[19px] text-gray-900">Confirme seu WhatsApp</h2>
        <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
          Enviamos um código de 6 dígitos para <b>{verif.dest}</b>.
          Digite abaixo para ativar sua conta.
        </p>
      </div>

      {msg && (
        <p className={`text-[13px] px-4 py-2.5 rounded-xl mb-4 border ${
          msg.type === 'ok'
            ? 'text-green-700 bg-green-50 border-green-200'
            : 'text-red-600 bg-red-50 border-red-200'
        }`}>
          {msg.text}
        </p>
      )}

      <form onSubmit={verify} className="space-y-4">
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setMsg(null) }}
          placeholder="••••••"
          className="w-full h-14 text-center text-[26px] font-bold tracking-[0.5em] bg-white border border-gray-200 rounded-2xl outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full h-12 bg-brand text-white rounded-xl font-bold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-50 shadow-sm shadow-brand/30"
        >
          {busy ? 'Verificando…' : 'Ativar conta'}
        </button>
      </form>

      <div className="text-center mt-5 space-y-2">
        <button
          onClick={resend}
          disabled={busy || cooldown > 0}
          className="text-[13px] font-semibold text-brand disabled:text-gray-400"
        >
          {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
        </button>
        <p>
          <button onClick={onBack} className="text-[12px] text-gray-400 underline">
            Voltar ao login
          </button>
        </p>
      </div>
    </div>
  )
}
