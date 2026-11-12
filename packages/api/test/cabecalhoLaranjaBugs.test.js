// Dois bugs do cabeçalho laranja (Lojinha, Translados, Vagas), achados pelo
// dono no iPhone em 12/11/2026:
//  1) com a busca aberta, a lupa ficava FORA do campo (12px abaixo do centro):
//     a regra de altura mínima da linha da marca pegava também a caixa de busca;
//  2) o painel de Notificações abria POR TRÁS do cartão "Saindo de" e dos
//     cards: o cabeçalho tem camada própria (z-index 0) e o painel, mesmo com
//     z-[200], ficava preso nela.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

test('a altura mínima do cabeçalho vale só para a linha da marca (1º filho)', () => {
  const css = ler('../../turista/src/pages/ToursVisual2026.css')
  assert.match(css, /\.t2026-header > \.relative:first-child \{\s*min-height: 60px;/)
  assert.doesNotMatch(css, /\.t2026-header > \.relative \{/, 'sem a regra larga que pegava a busca')
  // As caixas de busca do cabeçalho continuam sendo .relative logo depois da marca.
  const tours = ler('../../turista/src/pages/Tours.jsx')
  const transfers = ler('../../turista/src/pages/Transfers.jsx')
  assert.match(tours, /<div className="mt-2 relative">\s*<Search size=\{14\} className="absolute left-3 top-1\/2 -translate-y-1\/2/)
  assert.match(transfers, /className="mt-2 relative"\s*>\s*<Search size=\{14\} className="absolute left-3 top-1\/2 -translate-y-1\/2/)
})

test('o painel de notificações sai do cabeçalho (portal no body) e tocar nele não o fecha', () => {
  const bell = ler('../../turista/src/components/NotificationBell.jsx')
  assert.match(bell, /import \{ createPortal \} from 'react-dom'/)
  assert.match(bell, /\{open && createPortal\(\s*<div\s+ref=\{panelRef\}/)
  assert.match(bell, /document\.body,\s*\)\}/)
  assert.match(bell, /panelRef\.current\?\.contains\(e\.target\)\) return/,
    'o painel não está mais dentro do botão: o clique fora precisa conhecer os dois')
})
