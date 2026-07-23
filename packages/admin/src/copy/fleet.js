// Copy centralizada da gestão de "Frota liberada" por cooperativa (admin).
// O app admin não usa react-i18next (é 100% PT hardcoded); concentramos as
// strings aqui em vez de espalhar pelo componente. EN/ES ficam comentados
// como referência para uma eventual migração futura para i18n.
export const fleetCopy = {
  sectionTitle: 'Frota liberada',
  // EN: "Released fleet" / ES: "Flota liberada"

  summary: (released, total) => `${released} de ${total} veículos liberados`,
  // EN: (released, total) => `${released} of ${total} vehicles released`
  // ES: (released, total) => `${released} de ${total} vehículos liberados`

  manage: 'Gerenciar frota',
  // EN: "Manage fleet" / ES: "Gestionar flota"

  modalTitle: (name) => `Frota de ${name}`,
  // EN: (name) => `${name}'s fleet` / ES: (name) => `Flota de ${name}`

  modalHint: 'Marque os veículos que esta cooperativa pode operar. As mudanças são salvas na hora.',
  // EN: "Check the vehicles this cooperative can operate. Changes save instantly."
  // ES: "Marca los vehículos que esta cooperativa puede operar. Los cambios se guardan al instante."

  search: 'Buscar veículo…',
  // EN: "Search vehicle…" / ES: "Buscar vehículo…"

  release: 'Liberar',
  // EN: "Release" / ES: "Liberar"

  notRelease: 'Bloquear',
  // EN: "Block" / ES: "Bloquear"

  saved: 'Frota atualizada',
  // EN: "Fleet updated" / ES: "Flota actualizada"

  saveError: 'Não foi possível salvar. Tente de novo.',
  // EN: "Couldn't save. Try again." / ES: "No fue posible guardar. Intenta de nuevo."

  empty: 'Nenhum veículo no catálogo',
  // EN: "No vehicle in the catalog" / ES: "Ningún vehículo en el catálogo"

  loading: 'Carregando frota…',
  // EN: "Loading fleet…" / ES: "Cargando flota…"

  loadError: 'Não foi possível carregar a frota.',
  // EN: "Couldn't load the fleet." / ES: "No fue posible cargar la flota."

  retry: 'Tentar de novo',
  // EN: "Try again" / ES: "Intentar de nuevo"
}
