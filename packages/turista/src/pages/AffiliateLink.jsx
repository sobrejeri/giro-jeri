import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setAffiliate } from '../lib/affiliate'
import { useAuth } from '../contexts/AuthContext'

// /a/<CÓDIGO> — entrada do link de indicação de um afiliado. Resolve o código,
// grava a atribuição (30 dias) e manda para a Home.
// • Código inválido → segue para a Home sem atribuição (não bloqueia).
// • PRÓPRIO link: quem compartilha não pode usar o próprio código — se o
//   usuário logado abrir o próprio link, nada é gravado e ele vê o aviso.
//   (O servidor também ignora autoindicação — esta é só a camada de UX.)
export default function AffiliateLink() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let active = true

    async function run() {
      try {
        const a = await api.resolveAffiliate(code)
        if (!active) return
        if (a?.code) {
          // Logado? Confere se o código é do próprio usuário antes de gravar.
          if (token) {
            try {
              const me = await api.affiliateMe()
              if (!active) return
              if (me?.code && me.code.toUpperCase() === String(a.code).toUpperCase()) {
                setMsg('Este link é seu 😉 Ele vale para amigos e seguidores — não para as suas próprias reservas.')
                setTimeout(() => navigate('/afiliado', { replace: true }), 2600)
                return
              }
            } catch { /* segue e grava — o servidor trava autoindicação */ }
          }
          setAffiliate(a)
        }
        navigate('/', { replace: true })
      } catch {
        if (!active) return
        setMsg('Link não encontrado — abrindo o app…')
        setTimeout(() => navigate('/', { replace: true }), 1800)
      }
    }
    run()
    return () => { active = false }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-[14px] font-semibold text-gray-700">{msg || 'Abrindo o app…'}</p>
    </div>
  )
}
