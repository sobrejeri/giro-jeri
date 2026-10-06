import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// Retorno do login com Google (OAuth via Supabase). A sessão volta no fragmento
// da URL (#access_token=…&refresh_token=…). Garantimos o perfil no backend
// (vínculo por e-mail / criação de turista) e entramos.
//
// A URL pode chegar de duas formas:
//  1. Direto em /auth/callback#… — quando o Pages serve a página real (ideal).
//  2. Via 404.html → sessionStorage('spa_redirect') → raiz → re-navegação —
//     quando /auth/callback 404a no Pages. Aí o fragmento pode já ter saído do
//     window.location, então também olhamos o destino salvo.
function lerParametros() {
  // Tenta o fragmento atual.
  const hash = window.location.hash || ''
  let raw = hash.startsWith('#') ? hash.slice(1) : hash

  // Fallback: destino salvo pelo roteador 404 do GitHub Pages (traz o #token).
  if (!raw || raw.indexOf('access_token') === -1) {
    try {
      const saved = sessionStorage.getItem('spa_redirect') || ''
      const i = saved.indexOf('#')
      if (i !== -1) { raw = saved.slice(i + 1); sessionStorage.removeItem('spa_redirect') }
    } catch { /* storage indisponível */ }
  }

  const p = new URLSearchParams(raw)
  // Erros do provedor às vezes voltam na query (?error=…), não no fragmento.
  const q = new URLSearchParams(window.location.search || '')
  return {
    access_token:  p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    error: p.get('error_description') || p.get('error') ||
           q.get('error_description') || q.get('error'),
  }
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const { access_token, refresh_token, error } = lerParametros()
        if (error) { if (vivo) setErro(decodeURIComponent(error)); return }
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
