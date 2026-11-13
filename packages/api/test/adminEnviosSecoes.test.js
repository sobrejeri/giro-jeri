// Admin › Conteúdo e campanhas › Envios e automações: as três seções ("Envio
// manual", "Últimos envios" e "Automáticas") recolhem e expandem, com um
// resumo no título — pedido do dono para a tela ficar mais organizada. Começam
// recolhidas e o aparelho lembra a escolha de cada uma.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const tela = fs.readFileSync(new URL('../../admin/src/pages/Notificacoes.jsx', import.meta.url), 'utf8')
// O bloco recolhível passou a ser compartilhado com a aba Pagamentos.
const bloco = fs.readFileSync(new URL('../../admin/src/components/ui/SecaoRecolhivel.jsx', import.meta.url), 'utf8')

test('seção recolhível acessível, que lembra o estado no aparelho', () => {
  assert.match(tela, /const Secao = \(props\) => <SecaoRecolhivel grupo="envios" \{\.\.\.props\} \/>/)
  assert.match(bloco, /aria-expanded=\{aberta\}/)
  assert.match(bloco, /aria-controls=\{corpo\}/)
  assert.match(bloco, /const chave = `admin_\$\{grupo\}_secao_\$\{id\}`/, 'mesma chave de antes para Envios: admin_envios_secao_<id>')
  assert.match(bloco, /try \{ return localStorage\.getItem\(chave\) === '1' \} catch \{ return false \}/, 'começa recolhida e não quebra sem armazenamento')
  assert.match(bloco, /\{aberta \? 'Recolher' : 'Expandir'\}/)
  assert.match(bloco, /<div id=\{corpo\} hidden=\{!aberta\}/, 'recolhida só esconde: o que foi digitado não se perde')
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
