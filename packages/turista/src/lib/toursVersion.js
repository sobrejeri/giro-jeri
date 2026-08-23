import { criarVersaoTela } from './versaoTela'

// Versão da tela de Passeios ('nova' | 'atual').
//
// Padrão 'nova' — ao contrário da home. Aqui o redesenho foi pedido e já é o
// que todo mundo vê; o alternador existe para VOLTAR, caso o dono não goste.
const passeios = criarVersaoTela({ chave: 'turiva_passeios_versao', param: 'passeios', padrao: 'nova' })

export const getToursVersion = passeios.get
export const setToursVersion = passeios.set
export const useToursVersion = passeios.usar
