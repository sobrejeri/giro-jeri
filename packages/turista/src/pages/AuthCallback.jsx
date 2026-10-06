import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// Retorno do login com Google (OAuth via Supabase). A sessão volta no fragmento
// da URL (#access_token=…&refresh_token=…). Garantimos o perfil no backend
// (vínculo por e-mail / criação de turista) e entramos.
export default function AuthCallback() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
        const p = new URLSearchParams(raw)
        const errDesc = p.get('error_description') || p.get('error')
        if (errDesc) { if (vivo) setErro(decodeURIComponent(errDesc)); return }
        const access_token  = p.get('access_token')
        const refresh_token = p.get('refresh_token')
        if (!access_token) { if (vivo) setErro('Não foi possível concluir o login com Google.'); return }

        const { user, needs_phone } = await api.googleSync(access_token)
        if (!vivo) return
        login(user, access_token, refresh_token)
        // Limpa o fragmento da URL (tokens fora do histórico).
        window.history.replaceState({}, '', window.location.pathname)
        navigate(needs_phone ? '/perfil?completar=1' : '/', { replace: true })
      } catch (e) {
        if (vivo) setErro(e?.message || 'Falha ao entrar com Google.')
      }
    })()
    return () => { vivo = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      {erro ? (
        <div className="text-center max-w-xs">
          <p className="text-sm text-red-500 mb-3">{erro}</p>
          <button onClick={() => navigate('/login', { replace: true })} className="text-brand font-semibold">Voltar ao login</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Entrando com Google…</p>
        </div>
      )}
    </div>
  )
}
