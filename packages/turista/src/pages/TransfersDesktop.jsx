import { useState } from 'react'
import {
  Route, Zap, Clock, Users, Car, ShieldCheck, Timer, Headphones, MessageCircle,
} from 'lucide-react'
import { PRESET_ROUTES } from './Transfers'

const WA_NUMBER = '5588999999999'

const TRUST = [
  { icon: Car,        title: 'Veículos confortáveis',  desc: 'Ar-condicionado' },
  { icon: ShieldCheck,title: 'Motoristas experientes', desc: 'Profissionais verificados' },
  { icon: Timer,      title: 'Pontualidade',           desc: 'Chegue no horário' },
  { icon: Headphones, title: 'Atendimento 24h',        desc: 'Suporte sempre disponível' },
]

function RouteCard({ route, onReserve }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className={`bg-gradient-to-br ${route.bg} px-4 pt-3 pb-3.5`}>
        {route.badge
          ? <span className="inline-block text-[10px] font-bold text-white bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full mb-2">{route.badge}</span>
          : <div className="h-[18px] mb-2" />}
        <p className="text-white font-bold text-[15px] leading-tight">{route.label}</p>
        <div className="flex items-center gap-3 mt-2 text-white/85 text-[11px]">
          <span className="flex items-center gap-1"><Clock size={11} />{route.duration}</span>
          <span className="flex items-center gap-1"><Users size={11} />Até 4 passageiros</span>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <p className="text-[11px] text-gray-400">Privativo a partir de</p>
          <p className="text-[20px] font-extrabold text-gray-900">R$ {route.priceFrom.toLocaleString('pt-BR')}</p>
        </div>
        <button
          onClick={() => onReserve(route)}
          className="mt-auto w-full bg-brand hover:bg-brand-600 text-white font-bold text-[13px] py-2.5 rounded-xl transition-colors"
        >
          Reservar
        </button>
      </div>
    </div>
  )
}

export default function TransfersDesktop() {
  const [mode, setMode] = useState('rota')

  function reserve(route) {
    const msg = encodeURIComponent(
      `Olá! Quero reservar um transfer.\n🚐 Rota: ${route.label}\n📍 ${route.origin} → ${route.dest}\n💰 A partir de R$ ${route.priceFrom.toLocaleString('pt-BR')}`,
    )
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank')
  }

  function customRide() {
    const msg = encodeURIComponent('Olá! Quero solicitar uma corrida personalizada (transfer sob medida).')
    window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, '_blank')
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-extrabold text-gray-900">Transfer</h1>
      <p className="text-gray-500 mt-1">Transporte privativo com conforto e segurança</p>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-3 mt-6 max-w-2xl">
        <button
          onClick={() => setMode('rota')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all ${mode === 'rota' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
        >
          <Route size={16} /> Rota definida
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all ${mode === 'custom' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
        >
          <Zap size={16} /> Corrida personalizada
        </button>
      </div>

      {mode === 'rota' ? (
        <>
          <h2 className="text-lg font-bold text-gray-900 mt-8 mb-4">Rotas populares</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {PRESET_ROUTES.map((r) => <RouteCard key={r.id} route={r} onReserve={reserve} />)}
          </div>
        </>
      ) : (
        <div className="mt-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center max-w-2xl">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4"><Zap size={24} className="text-brand" /></div>
          <h3 className="text-xl font-bold text-gray-900">Corrida personalizada</h3>
          <p className="text-gray-500 mt-2 mb-5">Conte pra gente origem, destino, data e nº de passageiros — montamos um transfer sob medida pra você.</p>
          <button onClick={customRide} className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold px-6 py-3 rounded-xl transition-colors">
            <MessageCircle size={18} /> Solicitar no WhatsApp
          </button>
        </div>
      )}

      {/* Selo de confiança */}
      <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        {TRUST.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3 px-4 py-3">
            <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><Icon size={19} className="text-brand" /></div>
            <div>
              <p className="text-[13px] font-bold text-gray-900 leading-tight">{title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
