import { Component } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'

// ── Barreira de erro ─────────────────────────────────────────────────────────
// Sem isto, QUALQUER erro durante o render desmonta a árvore inteira do React e
// o cliente fica olhando uma tela em branco, sem saber se travou, se acabou a
// internet ou se o aparelho está com problema. Foi o que aconteceu quando a API
// devolveu HTML em vez de lista: um `.filter` estourou na home e levou o app.
//
// A barreira não conserta o erro — ela troca a tela branca por uma tela que
// explica e oferece saída. Erro de render vira "recarregar", não abandono.
//
// Precisa ser classe: só componentes de classe recebem componentDidCatch.
export default class ErroNaTela extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    // Vai para o console do aparelho: é o que permite descobrir a causa quando
    // alguém relata "ficou branco" com uma foto da tela.
    console.error('[turiva] erro de render:', erro, info?.componentStack)
  }

  recarregar = () => {
    // Recarrega buscando do servidor. Só trocar o estado não adianta: o erro
    // costuma vir de dado já em cache, e voltaria na hora.
    try { window.location.reload() } catch { this.setState({ erro: null }) }
  }

  render() {
    if (!this.state.erro) return this.props.children

    const semRede = typeof navigator !== 'undefined' && navigator.onLine === false

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-5">
          {semRede
            ? <WifiOff size={26} className="text-gray-400" />
            : <RefreshCw size={24} className="text-gray-400" />}
        </div>

        <p className="text-[17px] font-extrabold text-gray-900">
          {semRede ? 'Sem conexão' : 'Algo deu errado'}
        </p>
        <p className="text-[13.5px] text-gray-500 mt-2 max-w-xs leading-snug">
          {semRede
            ? 'Verifique sua internet e tente de novo.'
            : 'Não foi possível carregar esta tela. Isso costuma ser passageiro.'}
        </p>

        <button
          onClick={this.recarregar}
          className="mt-7 inline-flex items-center gap-2 bg-brand text-white font-bold rounded-full px-7 py-3.5 text-[15px] active:scale-95 transition-transform"
        >
          <RefreshCw size={16} /> Tentar de novo
        </button>

        <a
          href="https://wa.me/5588981222990"
          className="mt-4 text-[13px] font-semibold text-gray-500 underline"
        >
          Falar com a gente no WhatsApp
        </a>
      </div>
    )
  }
}
