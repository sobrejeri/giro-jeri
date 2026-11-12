/* ── Dificuldade do passeio ───────────────────────────────────────────────
   `difficulty_level` é texto livre no banco e foi preenchido à mão ao longo do
   tempo — há registro em inglês, em português, com e sem acento. Por isso o
   casamento é por prefixo normalizado, e o que não casar é exibido como veio
   (em cinza) em vez de sumir: dado do admin não deve desaparecer da tela.
   Usado pelo cartão do passeio e pela folha que abre ao tocar nele (antes a
   folha mostrava o valor cru, ex.: "easy"). */
const semAcento = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function dificuldade(nivel, t) {
  const n = semAcento(nivel)
  if (!n) return null
  if (n.startsWith('easy') || n.startsWith('facil') || n.startsWith('leve')) {
    return { label: t('toursPg.difficulty.easy'), cor: 'bg-emerald-500', texto: 'text-gray-600' }
  }
  if (n.startsWith('mod') || n.startsWith('medi') || n.startsWith('inter')) {
    return { label: t('toursPg.difficulty.moderate'), cor: 'bg-amber-500', texto: 'text-gray-600' }
  }
  if (n.startsWith('hard') || n.startsWith('dif') || n.startsWith('pesad') || n.startsWith('avanc')) {
    return { label: t('toursPg.difficulty.hard'), cor: 'bg-rose-500', texto: 'text-gray-600' }
  }
  return { label: nivel, cor: 'bg-gray-400', texto: 'text-gray-500' }
}
