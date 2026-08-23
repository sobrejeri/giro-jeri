import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { RotateCcw, Sparkles } from 'lucide-react'
import Tours from './Tours'
import ToursV2 from './ToursV2'
import { useToursVersion, setToursVersion } from '../lib/toursVersion'

// ── Passeios: desenho novo com volta atrás ───────────────────────────────────
// O redesenho já é o que todo mundo vê (padrão 'nova'). Este botão existe para
// VOLTAR ao desenho anterior enquanto o dono decide se fica.
//
// A escolha fica no aparelho (localStorage), então dá para usar uma versão por
// alguns dias e voltar quando quiser. Também aceita ?passeios=nova|atual na
// URL — útil para mandar o link já na versão certa para outra pessoa opinar.
//
// As duas telas usam AS MESMAS consultas e a mesma lógica de reserva: o que
// muda é só a apresentação. Nenhuma alteração aqui deve tocar em preço,
// carrinho ou modo privativo/compartilhado.
//
// Quando a decisão sair: manter só a vencedora e apagar este arquivo, a
// perdedora e `lib/toursVersion.js`.
export default function ToursSwitcher() {
  const { search } = useLocation()
  const versao = useToursVersion()

  // Link com ?passeios=... passa a valer também para as próximas visitas.
  useEffect(() => {
    const daUrl = new URLSearchParams(search).get('passeios')
    if (daUrl === 'nova' || daUrl === 'atual') setToursVersion(daUrl)
  }, [search])

  const nova = versao === 'nova'

  return (
    <>
      {nova ? <ToursV2 /> : <Tours />}

      {/* Espaço extra no fim da página só enquanto o alternador existe: o botão
          flutua sobre o conteúdo e, no fim da rolagem, cobria a faixa de
          benefícios. Sai junto com este arquivo quando a decisão for tomada. */}
      <div aria-hidden="true" className="lg:hidden h-16" />

      {/* Portal para o document.body, como já faz a barra do carrinho: o
          wrapper do PullToRefresh usa transform, e transform quebra o
          position:fixed dos filhos — preso na página, o botão descia junto com
          a rolagem e sumia no meio do conteúdo numa tela longa como esta.

          Acima da barra de navegação E do resumo do carrinho (bottom-16), à
          esquerda, para não cobrir o botão de continuar nem o carrinho
          flutuante, que ficam à direita. */}
      {createPortal(
        <button
          onClick={() => setToursVersion(nova ? 'atual' : 'nova')}
          className={`lg:hidden fixed left-4 bottom-[152px] z-30 flex items-center gap-2 rounded-full pl-3 pr-3.5 py-2 shadow-lg text-[11.5px] font-bold transition-colors ${
            nova ? 'bg-gray-900 text-white' : 'bg-brand text-white'
          }`}
          // Sem aria-label: ele substituiria o nome acessível pelo texto do
          // atributo, e quem usa leitor de tela ouviria algo diferente do que
          // está escrito no botão. O rótulo visível já é o nome.
          title="Alternar entre o desenho novo e o anterior da tela de passeios"
        >
          {nova ? <RotateCcw size={13} /> : <Sparkles size={13} />}
          {nova ? 'Desenho anterior' : 'Desenho novo'}
        </button>,
        document.body,
      )}
    </>
  )
}
