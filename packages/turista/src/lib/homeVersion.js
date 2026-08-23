import { criarVersaoTela } from './versaoTela'

// Versão da home em avaliação ('atual' | 'nova').
//
// Padrão 'atual': a home nova ainda está em comparação, então quem nunca
// alternou continua vendo a de sempre.
const home = criarVersaoTela({ chave: 'turiva_home_versao', param: 'home', padrao: 'atual' })

export const getHomeVersion = home.get
export const setHomeVersion = home.set
export const useHomeVersion = home.usar
