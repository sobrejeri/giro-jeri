import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { setAffiliate } from '../lib/affiliate'

// /a/<CÓDIGO> — entrada do link de indicação de um afiliado. Resolve o código,
// grava a atribuição (30 dias) e manda para a Home. Código inválido → segue
// para a Home sem atribuição (não bloqueia o cliente).
export default function AffiliateLink() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let active = true
    api.resolveAffiliate(code)
      .then((a) => {
        if (!active) return
        if (a?.code) setAffiliate(a)
        navigate('/', { replace: true })
      })
      .catch(() => {
        if (!active) return
        setErro(true)
        setTimeout(() => navigate('/', { replace: true }), 1800)
      })
    return () => { active = false }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-[14px] font-semibold text-gray-700">
        {erro ? 'Link não encontrado — abrindo o app…' : 'Abrindo o app…'}
      </p>
    </div>
  )
}
