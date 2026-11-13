// Quem executa o serviço: motorista, guia ou piloto (migração 132). Define os
// rótulos do despacho, da Ordem de Serviço e dos repasses — "placa" e
// "motorista" não fazem sentido para um guia nem para um voo de helicóptero.
export const PAPEIS = {
  driver: {
    id: 'driver', nome: 'Motorista', opcao: 'Motorista', veiculo: 'Veículo',
    campoVeiculo: 'Placa do veículo *', exemploVeiculo: 'Ex: GKR-1234', exemploNome: 'Ex: João da Silva',
    obs: 'Observações para o motorista',
    secaoPdf: '1. DADOS DO VEÍCULO / MOTORISTA', veiculoPdf: 'VEÍCULO (MODELO / PLACA / COR):',
  },
  guide: {
    id: 'guide', nome: 'Guia', opcao: 'Guia', veiculo: 'Veículo',
    campoVeiculo: null, exemploVeiculo: '', exemploNome: 'Ex: Maria Souza',   // guia não tem placa
    obs: 'Observações para o guia',
    secaoPdf: '1. DADOS DO GUIA', veiculoPdf: 'SERVIÇO:',
  },
  pilot: {
    id: 'pilot', nome: 'Piloto', opcao: 'Piloto (helicóptero)', veiculo: 'Aeronave',
    campoVeiculo: 'Aeronave (modelo e prefixo) *', exemploVeiculo: 'Ex: Robinson R44 · PR-ABC', exemploNome: 'Ex: Cmte. Rocha',
    obs: 'Observações para a tripulação',
    secaoPdf: '1. DADOS DA AERONAVE / TRIPULAÇÃO', veiculoPdf: 'AERONAVE (MODELO / PREFIXO):',
  },
}
export const papelExecutor = (id) => PAPEIS[id] || PAPEIS.driver

// Sugestão do papel pela reserva: helicóptero/aeronave → piloto; o resto,
// motorista. Guia é escolha do operador (um passeio a pé e um compartilhado de
// jardineira são iguais nos dados — nenhum traz veículo na reserva).
export function papelSugerido(booking) {
  const veiculos = (booking?.booking_vehicles || []).map((v) => `${v.vehicle_name_snapshot || ''} ${v.modal || ''}`).join(' ')
  const texto = `${veiculos} ${booking?.service_name || ''} ${booking?.modal || ''}`
  return /helic|aeronave|a[eé]reo/i.test(texto) ? 'pilot' : 'driver'
}
