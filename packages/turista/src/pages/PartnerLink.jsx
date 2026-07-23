import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { setPartner } from '../lib/partner'

// /c/<slug> — entrada do link direto de uma cooperativa. Resolve o slug,
// grava a atribuição e manda para a Home com o selo "Reservando com X".
// Slug inválido → segue para a Home sem atribuição (não bloqueia o cliente).
export default function PartnerLink() {
  const { t } = useTranslation()
  const { slug } = useParams()
  const navigate = useNavigate()
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let active = true
    api.getPartner(slug)
      .then((p) => {
        if (!active) return
        if (p?.slug) setPartner(p)
        navigate('/', { replace: true })
      })
      .catch(() => {
        if (!active) return
        setErro(true)
        setTimeout(() => navigate('/', { replace: true }), 1800)
      })
    return () => { active = false }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-[14px] font-semibold text-gray-700">
        {erro ? t('miscPg.notFoundLinkOpening') : t('miscPg.partnerLink.openingReservation')}
      </p>
    </div>
  )
}
