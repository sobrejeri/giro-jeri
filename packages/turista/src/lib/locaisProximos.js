// Locais próximos (pousadas, mercados, conveniências, restaurantes, praças…)
// para o PONTO DE PARTIDA do passeio e do translado personalizados. Fonte: o
// mesmo diretório ao vivo do "Descubra a Vila" (/api/establishments/nearby →
// Geoapify/OpenStreetMap), com o cache compartilhado (mesma queryKey do Feed).
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from './api'
import { useRegion } from '../contexts/RegionContext'
import { normalizarLugar } from './pontosTuristicos'

const VILA_DE_JERI = { lat: -2.7976, lon: -40.5147 }
const MEIA_HORA = 30 * 60 * 1000

// Rótulo curto do tipo de lugar, mostrado embaixo do nome ("Mercado · 350 m").
const TIPO_PADRAO = {
  hospedagem: 'Hospedagem', mercado: 'Mercado', gastronomia: 'Restaurante', bar: 'Bar',
  farmacia: 'Farmácia', beleza: 'Beleza', moda: 'Loja', kite: 'Kite', compras: 'Loja', praca: 'Praça',
}

const ponto = (lat, lon) => {
  const p = { lat: Number(lat), lon: Number(lon) }
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null
}

// Centro = a localização que o turista ESCOLHEU: região escolhida à mão (no
// "Saindo de:") vale o centro dela, mesmo que o GPS diga outra coisa; senão o
// GPS; senão o centro da região; senão a Vila.
function centroDaBusca({ region, userCoords, manualRegion }) {
  const centroRegiao = region?.center_latitude != null && region?.center_longitude != null
    ? ponto(region.center_latitude, region.center_longitude)
    : null
  const gps = userCoords?.lat != null && userCoords?.lon != null ? ponto(userCoords.lat, userCoords.lon) : null
  if (manualRegion && centroRegiao) return centroRegiao
  return gps || centroRegiao || VILA_DE_JERI
}

// lat/lon vêm da API; em servidor ainda sem esses campos, saem do link do Maps
// (que sempre trouxe as coordenadas do lugar).
function coordsDe(r) {
  if (r.lat != null && r.lon != null) return { lat: Number(r.lat), lon: Number(r.lon) }
  const m = /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(r.maps_url || '')
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : { lat: null, lon: null }
}

/**
 * Lista pronta para o PlaceInput (`sugestoes={{ tipo: 'proximos', ...useLocaisProximos() }}`):
 * itens { id, label, sublabel, address, lat, lon } do mais perto ao mais longe.
 * `ativo: false` adia a busca (ex.: aba do translado que ainda não está aberta).
 */
export function useLocaisProximos({ ativo = true } = {}) {
  const { t, i18n } = useTranslation()
  const { region, userCoords, manualRegion } = useRegion()
  const c = centroDaBusca({ region, userCoords, manualRegion })
  const lat3 = c.lat.toFixed(3)
  const lon3 = c.lon.toFixed(3)

  const geral = useQuery({
    queryKey:  ['nearby', lat3, lon3],
    queryFn:   () => api.getNearbyPlaces({ lat: c.lat, lon: c.lon }),
    staleTime: MEIA_HORA,
    enabled:   ativo,
  })
  // Praças vêm numa consulta à parte (categoria extra no servidor): se ela
  // falhar, os demais lugares continuam aparecendo.
  const pracas = useQuery({
    queryKey:  ['nearby', lat3, lon3, 'praca'],
    queryFn:   () => api.getNearbyPlaces({ lat: c.lat, lon: c.lon, category: 'praca' }),
    staleTime: MEIA_HORA,
    enabled:   ativo,
    retry:     false,
  })

  const itens = useMemo(() => {
    const decimal = String(i18n.language || '').startsWith('en') ? '.' : ','
    const distancia = (m) => (m == null ? null
      : m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m`
      : `${(m / 1000).toFixed(1).replace('.', decimal)} km`)
    const vistos = new Set()
    const lista = []
    for (const r of [...(pracas.data?.results || []), ...(geral.data?.results || [])]) {
      const chave = normalizarLugar(r.name)
      if (!chave || vistos.has(chave)) continue
      vistos.add(chave)
      const tipo = r.category ? t(`transfersPg.nearbyCat.${r.category}`, TIPO_PADRAO[r.category] || '') : ''
      lista.push({
        id:       r.id || chave,
        label:    r.name,
        sublabel: [tipo, distancia(r.distance)].filter(Boolean).join(' · '),
        address:  r.address || r.name,
        distance: r.distance ?? null,
        ...coordsDe(r),
      })
    }
    return lista.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))
  }, [geral.data, pracas.data, t, i18n.language])

  return { itens, carregando: ativo && geral.isLoading }
}
