// ── SeletorDeParada.jsx — parada do "Montar meu passeio" ──────────────────────
//
// O cliente escolhe a parada na LISTA DO ADMIN (Catálogo → Paradas), não numa
// busca de mapa: assim o admin controla para onde os roteiros vão. Quem não acha
// o lugar escolhe "Outro destino" e escreve; a parada vai marcada (outro: true)
// para a cooperativa avaliar ao montar o valor.
//
// `valor`: { name, stopId, outro }. `usadas`: nomes (normalizados) já escolhidos
// nas OUTRAS paradas — aparecem na lista, mas sem dar para repetir.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronDown, Check, X, Pencil, MapPin, Loader2 } from 'lucide-react'
import { filtrarPontos, normalizarLugar } from '../lib/pontosTuristicos'

export default function SeletorDeParada({ valor, opcoes = [], carregando = false, usadas = new Set(), onChange, rotulo = 'Parada' }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const textoRef = useRef(null)
  const acabouDeVirarOutro = useRef(false)

  // Ao escolher "Outro destino", o campo de texto já abre com o cursor nele.
  useEffect(() => {
    if (valor?.outro && acabouDeVirarOutro.current) {
      acabouDeVirarOutro.current = false
      textoRef.current?.focus()
    }
  }, [valor?.outro])

  function abrir() { setBusca(''); setAberto(true) }
  function escolher(op) {
    onChange({ name: op.name, stopId: op.id || null, outro: false })
    setAberto(false)
  }
  function escolherOutro() {
    acabouDeVirarOutro.current = true
    // O que já foi digitado na busca vira o começo do destino.
    onChange({ name: busca.trim() || (valor?.outro ? valor.name : ''), stopId: null, outro: true })
    setAberto(false)
  }

  const filtradas = filtrarPontos(opcoes, busca, (o) => `${o.name} ${o.description || ''}`)
  const atual = normalizarLugar(valor?.name)

  return (
    <>
      {valor?.outro ? (
        <div>
          <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5 border border-amber-200">
            <Pencil size={14} className="text-amber-500 shrink-0" />
            <input
              ref={textoRef}
              value={valor.name}
              onChange={(e) => onChange({ ...valor, name: e.target.value })}
              maxLength={300}
              placeholder="Escreva o destino desejado"
              aria-label={`${rotulo}: outro destino`}
              className="flex-1 min-w-0 bg-transparent text-[14px] text-gray-800 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="text-[11px] text-amber-700 leading-snug">Fora da lista: a cooperativa avalia e responde no valor.</p>
            <button type="button" onClick={abrir} className="shrink-0 text-[11px] font-semibold text-brand">
              Escolher da lista
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          aria-haspopup="dialog"
          aria-label={valor?.name ? `${rotulo}: ${valor.name}. Trocar` : `${rotulo}: escolher da lista`}
          className="w-full flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
        >
          <MapPin size={15} className={valor?.name ? 'text-brand shrink-0' : 'text-gray-400 shrink-0'} />
          <span className={`flex-1 min-w-0 truncate text-[14px] ${valor?.name ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
            {valor?.name || 'Escolha o destino'}
          </span>
          {valor?.name
            ? <span className="shrink-0 text-[11px] font-semibold text-brand">Trocar</span>
            : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
        </button>
      )}

      {aberto && createPortal(
        <>
          <div className="fixed inset-0 bg-black/40 z-[80]" onClick={() => setAberto(false)} />
          <div role="dialog" aria-modal="true" aria-label="Escolha a parada"
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[80] max-h-[85dvh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
            <div className="flex items-center justify-between px-5 py-2 shrink-0">
              <p className="text-[16px] font-bold text-gray-900">Para onde quer ir?</p>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar"
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-2 shrink-0">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <Search size={14} className="text-gray-400 shrink-0" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar na lista" aria-label="Buscar parada"
                  className="flex-1 min-w-0 bg-transparent text-[14px] text-gray-800 placeholder-gray-400 focus:outline-none" />
                {busca && (
                  <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="text-gray-400">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] space-y-1.5">
              {carregando ? (
                <p className="flex items-center gap-2 text-[12px] text-gray-400 py-3">
                  <Loader2 size={13} className="animate-spin" /> Carregando paradas…
                </p>
              ) : filtradas.length === 0 ? (
                <p className="text-[12.5px] text-gray-500 py-3">
                  {busca.trim() ? <>Nada com “{busca.trim()}” na lista.</> : 'Ainda não há paradas na lista.'}
                </p>
              ) : filtradas.map((op) => {
                const n = normalizarLugar(op.name)
                const escolhida = n === atual && !valor?.outro
                const repetida = !escolhida && usadas.has(n)
                return (
                  <button key={op.id || op.name} type="button" disabled={repetida} onClick={() => escolher(op)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border transition-colors ${
                      escolhida ? 'border-brand bg-brand/5' : 'border-gray-100 bg-white'
                    } ${repetida ? 'opacity-50' : 'active:scale-[0.99]'}`}>
                    <MapPin size={15} className={escolhida ? 'text-brand shrink-0' : 'text-gray-400 shrink-0'} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[14px] font-semibold truncate ${escolhida ? 'text-brand' : 'text-gray-900'}`}>{op.name}</span>
                      {(op.description || repetida) && (
                        <span className="block text-[11.5px] text-gray-400 leading-snug truncate">
                          {repetida ? 'Já está no roteiro' : op.description}
                        </span>
                      )}
                    </span>
                    {escolhida && <Check size={16} className="text-brand shrink-0" />}
                  </button>
                )
              })}

              {/* Sempre no fim, mesmo com a busca vazia de resultados: é a saída
                  de quem não achou o lugar. */}
              <button type="button" onClick={escolherOutro}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left border border-dashed border-amber-300 bg-amber-50/60 active:scale-[0.99] transition-transform">
                <Pencil size={15} className="text-amber-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold text-gray-900">Outro destino</span>
                  <span className="block text-[11.5px] text-gray-500 leading-snug">
                    Não está na lista? Escreva — a cooperativa avalia.
                  </span>
                </span>
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
