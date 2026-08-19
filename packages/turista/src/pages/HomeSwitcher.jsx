import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, RotateCcw } from 'lucide-react'
import Home from './Home'
import HomeV2 from './HomeV2'

// ── Home em avaliação: duas versões lado a lado ─────────────────────────────
// O dono está comparando o layout atual com uma proposta nova antes de decidir.
// Em vez de trocar a tela de vez, as duas convivem e um botão alterna na hora.
//
// A escolha fica no aparelho (localStorage), então dá para deixar numa versão,
// usar o app normalmente por uns dias e voltar quando quiser. Também aceita
// ?home=nova / ?home=atual na URL — útil para mandar o link já na versão certa
// para outra pessoa opinar.
//
// Quando a decisão sair: manter só a vencedora e apagar este arquivo (e o
// perdedor). Enquanto isso, NENHUMA das duas é alterada por causa da outra —
// as duas usam as mesmas consultas de dados.
const CHAVE = 'turiva_home_versao'

export default function HomeSwitcher() {
  const { search } = useLocation()
  const [versao, setVersao] = useState(() => {
    const daUrl = new URLSearchParams(window.location.search).get('home')
    if (daUrl === 'nova' || daUrl === 'atual') return daUrl
    return localStorage.getItem(CHAVE) || 'atual'
  })

  // Link com ?home=... tem prioridade e passa a valer para as próximas visitas.
  useEffect(() => {
    const daUrl = new URLSearchParams(search).get('home')
    if (daUrl === 'nova' || daUrl === 'atual') setVersao(daUrl)
  }, [search])

  useEffect(() => { localStorage.setItem(CHAVE, versao) }, [versao])

  const nova = versao === 'nova'

  return (
    <>
      {nova ? <HomeV2 /> : <Home />}

      {/* Alternador — some quando a decisão for tomada e este arquivo sair.
          Fica acima da barra de navegação para não cobrir os botões. */}
      <button
        onClick={() => setVersao(nova ? 'atual' : 'nova')}
        className={`lg:hidden fixed right-4 bottom-24 z-40 flex items-center gap-2 rounded-full pl-3.5 pr-4 py-2.5 shadow-lg text-[12px] font-bold transition-colors ${
          nova ? 'bg-gray-900 text-white' : 'bg-brand text-white'
        }`}
        aria-label="Alternar entre a home atual e a nova"
      >
        {nova ? <RotateCcw size={14} /> : <Sparkles size={14} />}
        {nova ? 'Ver home atual' : 'Ver home nova'}
      </button>
    </>
  )
}
