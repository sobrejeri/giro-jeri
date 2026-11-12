// Admin › Conteúdo e campanhas › Envios e automações: as três seções ("Envio
// manual", "Últimos envios" e "Automáticas") recolhem e expandem, com um
// resumo no título — pedido do dono para a tela ficar mais organizada. Começam
// recolhidas e o aparelho lembra a escolha de cada uma.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const tela = fs.readFileSync(new URL('../../admin/src/pages/Notificacoes.jsx', import.meta.url), 'utf8')

test('seção recolhível acessível, que lembra o estado no aparelho', () => {
  assert.match(tela, /function Secao\(\{ id, icone: Icone, titulo, resumo, children \}\)/)
  assert.match(tela, /aria-expanded=\{aberta\}/)
  assert.match(tela, /aria-controls=\{`secao-\$\{id\}`\}/)
  assert.match(tela, /const chave = `admin_envios_secao_\$\{id\}`/)
  assert.match(tela, /try \{ return localStorage\.getItem\(chave\) === '1' \} catch \{ return false \}/, 'começa recolhida e não quebra sem armazenamento')
  assert.match(tela, /\{aberta \? 'Recolher' : 'Expandir'\}/)
})

test('as três seções usam o bloco recolhível, com resumo', () => {
  assert.match(tela, /<Secao id="manual" icone=\{Send\} titulo="Envio manual"/)
  assert.match(tela, /<Secao id="historico" icone=\{History\} titulo="Últimos envios"/)
  assert.match(tela, /<Secao id="automaticas" icone=\{Bell\} titulo="Automáticas"/)
  assert.match(tela, /· último em \$\{new Date\(ultimoEnvio\)/, 'resumo do histórico com o último envio')
  assert.match(tela, /\$\{ativas\} ativa\$\{ativas !== 1 \? 's' : ''\}/, 'resumo das automáticas com quantas estão ativas')
})

test('mensagens automáticas: linha leve dentro da seção, com o nome inteiro', () => {
  assert.match(tela, /<div className="rounded-xl border border-gray-700\/70 bg-gray-900\/40">/, 'sem cartão dentro de cartão')
  assert.match(tela, /<span className="block font-semibold text-gray-100 leading-snug">\{meta\.label\}<\/span>/, 'o nome quebra linha em vez de cortar')
  assert.doesNotMatch(tela, /CardBody/)
})
