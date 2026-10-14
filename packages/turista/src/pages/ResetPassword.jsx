import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/api'

// Página do link de reset (enviado por WhatsApp): valida o token e troca a senha.
export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [pwd, setPwd]       = useState('')
  const [pwd2, setPwd2]     = useState('')
  const [show, setShow]     = useState(false)
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState(null)
  const [done, setDone]     = useState(false)
  // Identifica PARA QUEM é a senha (nome + e-mail mascarado), a partir do token —
  // para o usuário confirmar que está atualizando a conta certa.
  const [info, setInfo]           = useState(null)
  // Tempo restante do link (segundos) para a barra de contagem regressiva.
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!token) return
    let vivo = true
    api.resetInfo(token)
      .then((d) => {
        if (!vivo) return
        setInfo(d)
        if (typeof d.expires_in === 'number') setRemaining(d.expires_in)
      })
      .catch(() => { /* token inválido/expirado: o envio mostra o erro */ })
    return () => { vivo = false }
  }, [token])

  // Conta regressiva: 1 tick por segundo até zerar.
  useEffect(() => {
    if (remaining == null) return undefined
    const id = setInterval(() => setRemaining((r) => (r != null && r > 0 ? r - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [remaining == null])

  const expired = remaining === 0
  const fmtMMSS = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (pwd.length < 8)   { setErr('A senha deve ter pelo menos 8 caracteres.'); return }
    if (pwd !== pwd2)     { setErr('As senhas não coincidem.'); return }
    setBusy(true)
    try {
      await api.resetPassword({ token, new_password: pwd })
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (e2) {
      setErr(e2?.message || 'Não foi possível redefinir a senha.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
        <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-brand" />
        </div>
        <h1 className="text-[19px] font-extrabold text-gray-900 text-center">Redefinir senha</h1>

        {!token ? (
          <p className="text-[13px] text-red-500 text-center mt-3">
            Link inválido. Peça um novo pelo "Esqueci minha senha".
          </p>
        ) : done ? (
          <div className="text-center mt-4">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-[14px] font-semibold text-gray-800">Senha redefinida! ✅</p>
            <p className="text-[12px] text-gray-400 mt-1">Redirecionando para o login…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            {info ? (
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-3 py-2.5">
                <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-[15px] shrink-0 overflow-hidden">
                  {info.photo
                    ? <img src={info.photo} alt="" className="w-full h-full object-cover" />
                    : String(info.name || info.username || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">
                    {info.name || (info.username ? `@${info.username}` : 'Sua conta')}
                  </p>
                  {(info.email || info.username) && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {info.email || `@${info.username}`}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-gray-500 text-center">Crie uma nova senha para sua conta.</p>
            )}

            {/* Barra de validade do link (contagem regressiva dos 30 min) */}
            {remaining != null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-400">
                    {expired ? 'Link expirado' : 'Este link expira em'}
                  </span>
                  <span className={`text-[11px] font-bold tabular-nums ${
                    expired || remaining <= 60 ? 'text-red-500' : remaining <= 300 ? 'text-amber-500' : 'text-emerald-500'
                  }`}>
                    {expired ? '0:00' : fmtMMSS(remaining)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                      expired || remaining <= 60 ? 'bg-red-500' : remaining <= 300 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, (remaining / 1800) * 100))}%` }}
                  />
                </div>
                {expired && (
                  <p className="text-[11px] text-red-500 mt-1.5">
                    Peça um novo link pelo "Esqueci minha senha".
                  </p>
                )}
              </div>
            )}

            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => { setPwd(e.target.value); setErr(null) }}
                placeholder="Nova senha (mín. 8 caracteres)"
                className="w-full h-12 px-4 pr-11 rounded-2xl border border-gray-200 text-[14px] outline-none focus:ring-2 focus:ring-brand/30"
              />
              <button type="button" onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <input
              type={show ? 'text' : 'password'}
              value={pwd2}
              onChange={(e) => { setPwd2(e.target.value); setErr(null) }}
              placeholder="Repita a nova senha"
              className="w-full h-12 px-4 rounded-2xl border border-gray-200 text-[14px] outline-none focus:ring-2 focus:ring-brand/30"
            />
            {err && <p className="text-[12px] text-red-500 bg-red-50 rounded-xl px-3 py-2">{err}</p>}
            <button
              type="submit"
              disabled={busy || expired}
              className="w-full h-12 bg-brand text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {busy ? <><Loader2 size={16} className="animate-spin" /> Salvando…</>
                : expired ? 'Link expirado' : 'Redefinir senha'}
            </button>
          </form>
        )}

        <p className="text-center text-[12px] text-gray-400 mt-4">
          <Link to="/login" className="text-brand font-semibold">Voltar ao login</Link>
        </p>
      </div>
    </div>
  )
}
