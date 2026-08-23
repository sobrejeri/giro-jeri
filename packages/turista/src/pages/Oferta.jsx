import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Ticket, Check, ArrowRight, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { guardarOferta } from '../lib/oferta'
import { useAuth } from '../contexts/AuthContext'

// ── Página da oferta recebida no WhatsApp ───────────────────────────────────
// É o "aceitar" do fluxo: o cliente toca no botão da mensagem, cai aqui, vê o
// que ganhou e confirma. A partir daí o código já vem preenchido no carrinho e
// no resumo da reserva.
//
// Abre SEM login de propósito — quem recebeu a mensagem pode não ter sessão
// neste aparelho, e mandar para a tela de senha antes de mostrar a oferta é a
// forma mais rápida de perder a pessoa.
const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Oferta() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [aceita, setAceita] = useState(false)

  const { data: oferta, isLoading, error } = useQuery({
    queryKey: ['oferta', code],
    queryFn:  () => api.getOffer(code),
    retry: false,
  })

  // Guarda assim que a oferta é confirmada como válida: se a pessoa fechar a
  // tela sem tocar no botão, o código continua valendo no checkout.
  useEffect(() => {
    if (oferta?.code) guardarOferta(oferta.code)
  }, [oferta?.code])

  function aceitar() {
    guardarOferta(oferta.code)
    setAceita(true)
    // Registro de aceite é secundário: se falhar (sem login, rede ruim), a
    // oferta já está guardada e funciona igual.
    if (user) api.acceptOffer(oferta.code).catch(() => {})
  }

  const desconto = oferta && (oferta.discount_type === 'percentage'
    ? `${Number(oferta.discount_value)}% de desconto`
    : `${fmtBRL(oferta.discount_value)} de desconto`)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 text-center">
      {isLoading && <p className="text-[13px] text-gray-500">Carregando a oferta…</p>}

      {error && (
        <>
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <AlertCircle size={24} className="text-gray-400" />
          </div>
          <p className="text-[16px] font-bold text-gray-900">Oferta indisponível</p>
          <p className="text-[13px] text-gray-500 mt-1.5 max-w-xs">
            {error?.message || 'Esta oferta não está mais valendo.'}
          </p>
          <button
            onClick={() => navigate('/passeios')}
            className="mt-6 bg-brand text-white font-bold rounded-full px-6 py-3 text-[14px] active:scale-95 transition-transform"
          >
            Ver passeios
          </button>
        </>
      )}

      {oferta && (
        <>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${
            aceita ? 'bg-emerald-100' : 'bg-brand/10'
          }`}>
            {aceita
              ? <Check size={28} className="text-emerald-600" strokeWidth={3} />
              : <Ticket size={28} className="text-brand" />}
          </div>

          <p className="text-[20px] font-extrabold text-gray-900 leading-tight">{oferta.title}</p>
          {oferta.description && (
            <p className="text-[13.5px] text-gray-500 mt-2 max-w-xs leading-snug">{oferta.description}</p>
          )}

          <div className="mt-5 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] px-6 py-5 w-full max-w-xs">
            <p className="text-[13px] text-gray-500">{desconto}</p>
            <p className="font-mono text-[24px] font-extrabold text-brand tracking-wider mt-1">{oferta.code}</p>
            {Number(oferta.min_order_amount) > 0 && (
              <p className="text-[11.5px] text-gray-400 mt-2">
                Em reservas a partir de {fmtBRL(oferta.min_order_amount)}
              </p>
            )}
            {oferta.valid_until && (
              <p className="text-[11.5px] text-gray-400 mt-1">
                Válido até {new Date(oferta.valid_until).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>

          {aceita ? (
            <>
              <p className="text-[13px] font-semibold text-emerald-600 mt-5">
                Oferta guardada! O código entra sozinho na hora de reservar.
              </p>
              <button
                onClick={() => navigate('/passeios')}
                className="mt-4 inline-flex items-center gap-2 bg-brand text-white font-bold rounded-full px-6 py-3 text-[14px] active:scale-95 transition-transform"
              >
                Escolher meu passeio <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={aceitar}
              className="mt-6 inline-flex items-center gap-2 bg-brand text-white font-bold rounded-full px-7 py-3.5 text-[15px] active:scale-95 transition-transform"
            >
              Quero esta oferta <ArrowRight size={16} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
