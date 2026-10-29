// Bolinha vermelha de pendência no seletor "Passeios | Estacionamento" do
// admin (app do operador) — e no botão do menu, no celular.
//
// Passeios acende com solicitação aguardando aceite ou cotação (translado ou
// passeio personalizado) aguardando valor; Estacionamento, com reserva nova
// aguardando o parceiro ou alteração de período pendente. Asserção de fonte,
// como o resto da suíte para o front.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const pendencias = ler('../../operador/src/lib/pendencias.js')
const sidebar    = ler('../../operador/src/components/layout/Sidebar.jsx')
const header     = ler('../../operador/src/components/layout/Header.jsx')
const dashboard  = ler('../../operador/src/pages/Dashboard.jsx')

test('o que conta como pendente em cada painel', () => {
  assert.match(pendencias, /bookings\?\.pending\?\.length/, 'solicitação aguardando aceite')
  assert.match(pendencias, /q\.status === 'pending_quote'/, 'cotação aguardando valor')
  assert.match(pendencias, /aguardandoValor\(transferQuotes\) \+ aguardandoValor\(tourQuotes\)/, 'translado E passeio personalizado')
  assert.match(pendencias, /r\.status === 'awaiting_partner'/, 'vaga nova aguardando o parceiro')
  assert.match(pendencias, /c\.status === 'pending'/, 'alteração de período pendente')
})

test('reusa as chaves de cache das telas (sem chamada a mais)', () => {
  for (const chave of ['operator-bookings', 'quotes-pending', 'tour-quotes-pending', 'parking-partner', 'parking-changes']) {
    assert.match(pendencias, new RegExp(`queryKey: \\['${chave}'\\]`), chave)
  }
  assert.match(pendencias, /enabled: ativo/, 'operador comum não consulta')
})

test('as abas do admin mostram a bolinha quando há pendência', () => {
  assert.match(sidebar, /usePendencias\(\{ ativo: isAdmin \}\)/)
  assert.match(sidebar, /const n = pendencias\[m\]/)
  assert.match(sidebar, /\{n > 0 && \(\s*<span data-pendente[^>]*bg-red-500/)
})

test('o botão do menu (celular) acende quando algum painel tem pendência', () => {
  assert.match(header, /const temPendencia = isAdmin && \(pendencias\.tours > 0 \|\| pendencias\.parking > 0\)/)
  assert.match(header, /\{temPendencia && \(\s*<span data-pendente/)
})

test('a aba "Novas" do painel conta também o passeio personalizado', () => {
  assert.match(dashboard, /const novasCount = pendenciasPasseios\(\{ bookings: obData, transferQuotes: quotesPendRaw, tourQuotes: tourQuotesPendRaw \}\)/)
})
