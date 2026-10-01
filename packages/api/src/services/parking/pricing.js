// ── parking/pricing.js — Precificação do estacionamento (servidor) ───────────
//
// O navegador só informa estabelecimento, período e tipo de veículo. QUEM
// calcula diárias e total é aqui. Regras (preço, horas por diária, mínimo) vêm
// da tarifa configurada — nada de número mágico. Dinheiro em centavos inteiros
// no cálculo para não arredondar com ponto flutuante.
//
// O supabase é importado de forma preguiçosa (dentro da função que usa banco)
// para que as funções puras acima sejam testáveis sem variáveis de ambiente.

// Quantidade de diárias = teto da duração em horas / horas_por_diária, com um
// mínimo. Exige saída depois da entrada.
export function diariasDe(startMs, endMs, { horasPorDiaria = 24, minDiarias = 1 } = {}) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Período inválido.')
  }
  if (endMs <= startMs) {
    throw new Error('A saída precisa ser depois da entrada.')
  }
  const horas = (endMs - startMs) / 3_600_000
  const unidades = Math.ceil(horas / horasPorDiaria)
  return Math.max(minDiarias, unidades)
}

// Cotação pura: recebe preço por diária e período; devolve diárias + total.
// `precoDiaria` em reais (NUMERIC no banco); o total é somado em centavos.
export function cotarEstacionamento({ startMs, endMs, precoDiaria, horasPorDiaria = 24, minDiarias = 1 }) {
  const diarias  = diariasDe(startMs, endMs, { horasPorDiaria, minDiarias })
  const centsDia = Math.round(Number(precoDiaria) * 100)
  if (!Number.isFinite(centsDia) || centsDia < 0) throw new Error('Preço inválido.')
  const totalCents = centsDia * diarias
  return { diarias, totalCents, total: totalCents / 100 }
}

// Wrapper com banco: lê a tarifa ATIVA do lot para o tipo de veículo e cota.
// Devolve também a fotografia da política, para congelar na reserva.
export async function cotarComTarifa({ lotId, vehicleType, startMs, endMs }) {
  const { supabase } = await import('../../supabase.js')
  const { data: tarifa, error } = await supabase
    .from('parking_tariffs')
    .select('id, price_per_unit, unit, hours_per_unit, min_units, version')
    .eq('lot_id', lotId)
    .eq('vehicle_type', vehicleType)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!tarifa) {
    const e = new Error('Sem tarifa configurada para este veículo neste estacionamento.')
    e.status = 422
    throw e
  }
  const { diarias, total, totalCents } = cotarEstacionamento({
    startMs, endMs,
    precoDiaria: tarifa.price_per_unit,
    horasPorDiaria: tarifa.hours_per_unit,
    minDiarias: tarifa.min_units,
  })
  return {
    diarias,
    unit_price: Number(tarifa.price_per_unit),
    total,
    totalCents,
    policy_snapshot: {
      tariff_id: tarifa.id,
      tariff_version: tarifa.version,
      unit: tarifa.unit,
      hours_per_unit: tarifa.hours_per_unit,
      min_units: tarifa.min_units,
    },
  }
}
