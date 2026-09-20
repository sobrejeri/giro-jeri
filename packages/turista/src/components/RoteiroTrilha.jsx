import { MapPin, Flag, Route } from 'lucide-react'

/* ── Trilha ilustrativa do roteiro ─────────────────────────────────────────
   O roteiro dos passeios vive dentro da descrição em prosa ("...passando pela
   Árvore da Preguiça, Praia do Preá, Buraco Azul..."). Em vez de um parágrafo
   seco, aqui ele vira uma trilha vertical com pinos numerados ligados por uma
   linha tracejada — bem mais fácil de entender e mais bonito de ver.

   Não há campo estruturado de paradas no banco, então extraímos da própria
   descrição por heurística. Quando não conseguimos identificar pelo menos duas
   paradas, o chamador cai no texto normal (extrairParadas devolve []). */

export function extrairParadas(texto = '') {
  if (!texto) return []
  let seg = null

  // "...passando pela X, Y e Z."  (o padrão mais comum dos passeios de terra)
  let m = texto.match(/passando\s+(?:pel[oa]s?|por)\s+([^.]+)/i)
  if (m) seg = m[1]
  // "Roteiro ... até a Barrinha: X, Y e Z."
  if (!seg) { m = texto.match(/roteiro[^:.]*:\s*([^.]+)/i); if (m) seg = m[1] }
  if (!seg) return []

  // Remove parentéticos — "(ou Lagun Beach)", "(Komaki, Munzuá)" — que
  // bagunçariam a divisão por vírgula.
  seg = seg.replace(/\([^)]*\)/g, '')

  const partes = seg.split(/,|;|\se\s/i)
  const out = []
  const seen = new Set()
  for (let p of partes) {
    p = p.replace(/\bconforme a época\b/gi, '')
         .replace(/\s+/g, ' ')
         .replace(/\se$/i, '')       // "Lagoa do Paraíso e" → "Lagoa do Paraíso"
         .replace(/^(?:ou|e)\s+/i, '')
         .trim()
    if (!p) continue
    // Descarta ruído: trechos que não são nome de lugar (frases longas,
    // ressalvas de época/disponibilidade, fragmentos curtos demais).
    if (/conforme|época|dispon[ií]vel|geralmente|aproximad/i.test(p)) continue
    if (p.length < 3 || p.length > 42) continue
    const label = p.charAt(0).toUpperCase() + p.slice(1)
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(label)
    if (out.length >= 8) break
  }
  return out.length >= 2 ? out : []
}

export default function RoteiroTrilha({ stops = [] }) {
  if (!stops.length) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Route size={14} className="text-brand" />
        <p className="text-[12.5px] font-extrabold text-gray-800">Roteiro do passeio</p>
      </div>

      <div className="relative">
        {stops.map((s, i) => {
          const last = i === stops.length - 1
          return (
            <div key={i} className="relative flex gap-3 pb-3.5 last:pb-0">
              {/* Trilho tracejado ligando um pino ao próximo. */}
              {!last && (
                <span className="absolute left-[13px] top-7 bottom-0 w-0 border-l-2 border-dashed border-brand/30" />
              )}
              {/* Pino numerado (primeiro = saída, último = destino final). */}
              <div className={`relative z-10 shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                last ? 'bg-emerald-500' : 'bg-brand'
              }`}>
                {i === 0
                  ? <Flag size={13} className="text-white" fill="currentColor" />
                  : last
                    ? <MapPin size={14} className="text-white" fill="currentColor" />
                    : <span className="text-[11px] font-extrabold text-white tabular-nums">{i + 1}</span>}
              </div>
              <p className="pt-1 text-[13px] font-semibold text-gray-800 leading-snug">{s}</p>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[10.5px] text-gray-400 italic">Roteiro ilustrativo — a ordem e as paradas podem variar conforme a época e as condições.</p>
    </div>
  )
}
