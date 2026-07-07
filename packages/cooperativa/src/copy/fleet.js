// Copy centralizada da tela "Minha Frota" (cooperativa).
// O app cooperativa não usa react-i18next (é 100% PT hardcoded); em vez de
// espalhar strings, concentramos aqui para facilitar revisão de UX e uma
// eventual migração futura para i18n (ver comentários EN/ES abaixo de cada
// bloco, apenas como referência — não usados em runtime).
export const fleetCopy = {
  title:    'Minha Frota',
  subtitle: 'Sua frota é definida pela administração. Veja os veículos que você pode operar.',
  // EN: "Your fleet is defined by the administration. See the vehicles you can operate."
  // ES: "Tu flota es definida por la administración. Mira los vehículos que puedes operar."

  readonlyNote: 'Somente a administração pode liberar ou remover veículos da sua frota.',
  // EN: "Only the administration can grant or remove vehicles from your fleet."
  // ES: "Solo la administración puede liberar o quitar vehículos de tu flota."

  requestChange: 'Solicitar mudança',
  // EN: "Request a change" / ES: "Solicitar cambio"

  sectionOperating: (n) => `Você opera (${n})`,
  // EN: (n) => `You operate (${n})` / ES: (n) => `Operas (${n})`

  sectionBlocked: (n) => `Não liberados (${n})`,
  // EN: (n) => `Not released (${n})` / ES: (n) => `No liberados (${n})`

  statusOperating: 'Você opera',
  // EN: "You operate" / ES: "Operas"

  statusBlocked: 'Não liberado',
  // EN: "Not released" / ES: "No liberado"

  emptyReleasedTitle: 'Nenhum veículo liberado ainda',
  // EN: "No vehicle released yet" / ES: "Ningún vehículo liberado todavía"

  emptyReleasedDesc: 'Assim que a administração liberar um veículo para sua cooperativa, ele aparece aqui.',
  // EN: "As soon as the administration releases a vehicle to your cooperative, it appears here."
  // ES: "En cuanto la administración libere un vehículo para tu cooperativa, aparecerá aquí."

  emptyCatalogTitle: 'Nenhum veículo no catálogo ainda.',
  emptyCatalogDesc:   'Aguarde o administrador cadastrar os veículos.',

  errorTitle: 'Não foi possível carregar sua frota',
  // EN: "We couldn't load your fleet" / ES: "No fue posible cargar tu flota"

  errorRetry: 'Tentar de novo',
  // EN: "Try again" / ES: "Intentar de nuevo"
}

// Faixa "modo administrador" (Reservas.jsx) — reaproveita o mesmo módulo de
// copy centralizada do app cooperativa em vez de espalhar strings soltas.
export const elevatedModeCopy = {
  badge: 'Modo administrador',
  // EN: "Admin mode" / ES: "Modo administrador"

  desc: 'Você vê todas as solicitações, sem filtro de frota.',
  // EN: "You see all requests, with no fleet filter." / ES: "Ves todas las solicitudes, sin filtro de flota."
}
