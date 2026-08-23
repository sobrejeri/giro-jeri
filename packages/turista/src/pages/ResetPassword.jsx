import { useState } from 'react'
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
            <p className="text-[12px] text-gray-500 text-center">Crie uma nova senha para sua conta.</p>
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
              disabled={busy}
              className="w-full h-12 bg-brand text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {busy ? <><Loader2 size={16} className="animate-spin" /> Salvando…</> : 'Redefinir senha'}
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
