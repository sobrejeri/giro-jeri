import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BellOff, Check, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'

// ── Sair das ofertas por WhatsApp ───────────────────────────────────────────
// Aberto pelo link no rodapé de cada mensagem promocional. Sem login: exigir
// senha para PARAR de receber mensagem é o atrito que faz a pessoa denunciar o
// número em vez de se descadastrar — e denúncia derruba o número da empresa.
//
// A tela CONFIRMA antes de desligar. O link não descadastra sozinho ao abrir,
// porque o WhatsApp busca a prévia de todo link enviado e antivírus corporativos
// abrem links de mensagens: gente que nunca tocou no link sairia da lista.
export default function SairDasOfertas() {
  const { token } = useParams()
  const [saiu, setSaiu]   = useState(false)
  const [erro, setErro]   = useState('')
  const [indo, setIndo]   = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['opt-out', token],
    queryFn:  () => api.getOptOut(token),
    retry: false,
  })

  async function confirmar() {
    setIndo(true); setErro('')
    try {
      await api.optOut(token)
      setSaiu(true)
    } catch (e) {
      setErro(e?.message || 'Não foi possível concluir. Tente novamente.')
    } finally { setIndo(false) }
  }

  const pronto = saiu || data?.ja_saiu

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center">
      {isLoading && <p className="text-[13px] text-gray-500">Carregando…</p>}

      {error && (
        <>
          <AlertCircle size={28} className="text-gray-400 mb-3" />
          <p className="text-[16px] font-bold text-gray-900">Link inválido</p>
          <p className="text-[13px] text-gray-500 mt-1.5 max-w-xs">
            Este link não é válido. Se você não quer mais receber ofertas, responda
            à conversa no WhatsApp e nós resolvemos.
          </p>
        </>
      )}

      {data && (
        <>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            pronto ? 'bg-emerald-100' : 'bg-gray-100'
          }`}>
            {pronto
              ? <Check size={28} className="text-emerald-600" strokeWidth={3} />
              : <BellOff size={26} className="text-gray-500" />}
          </div>

          {pronto ? (
            <>
              <p className="text-[18px] font-extrabold text-gray-900">Pronto</p>
              <p className="text-[13.5px] text-gray-500 mt-2 max-w-xs leading-snug">
                Você não vai mais receber ofertas por WhatsApp. Mensagens sobre as
                suas reservas continuam chegando normalmente.
              </p>
            </>
          ) : (
            <>
              <p className="text-[18px] font-extrabold text-gray-900">
                Parar de receber ofertas?
              </p>
              <p className="text-[13.5px] text-gray-500 mt-2 max-w-xs leading-snug">
                {data.nome ? `${String(data.nome).split(' ')[0]}, você` : 'Você'} deixa de
                receber promoções por WhatsApp. Avisos sobre as suas reservas continuam.
              </p>
              {erro && <p className="text-[12.5px] text-red-500 mt-3">{erro}</p>}
              <button
                onClick={confirmar}
                disabled={indo}
                className="mt-6 bg-gray-900 text-white font-bold rounded-full px-7 py-3.5 text-[14.5px] active:scale-95 transition-transform disabled:opacity-60"
              >
                {indo ? 'Confirmando…' : 'Sim, parar de receber'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
