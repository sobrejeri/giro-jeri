// Admin — ajustes pedidos pelo dono (prints do iPhone):
//  · Catálogo › Serviços: no celular o nome da rota quebrava uma palavra por
//    linha e o preço ficava por cima dele (preço, liga/desliga e menu dividiam
//    a linha do nome). A barra Passeios/Transfers/Veículos/Paradas passava da
//    borda e o município saía grudado na categoria.
//  · Configurações › Pagamentos: organizada por gateway, com seções que
//    recolhem e expandem.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const catalogo = ler('../../admin/src/pages/Catalogo.jsx')
const config = ler('../../admin/src/pages/Configuracoes.jsx')
const bloco = ler('../../admin/src/components/ui/SecaoRecolhivel.jsx')
const pagamentos = config.slice(config.indexOf('function TabPagamentos'), config.indexOf('function WhatsappDiag'))

test('Serviços: rota com o nome na largura toda e preço + liga/desliga numa linha embaixo', () => {
  const lista = catalogo.slice(catalogo.indexOf('rotasVisiveis.map('), catalogo.indexOf("{routes.length === 0 &&"))
  assert.match(lista, /className="flex items-start gap-3 p-3 rounded-xl/, 'menu e miniatura alinhados ao topo')
  assert.match(lista, /<p className="text-sm font-medium text-gray-200 leading-snug">\{r\.origin_name\}\{'\\u00a0'\}→ \{r\.destination_name\}<\/p>/,
    'a seta nunca abre linha sozinha')
  assert.match(lista, /<div className="mt-2 flex items-center justify-between gap-2">\s*<span className=\{`text-sm font-bold text-brand/,
    'preço numa linha própria, embaixo do nome')
  // O botão de ativar/desativar continua à vista, com 1 toque.
  assert.match(lista, /onClick=\{\(\) => toggleRouteMut\.mutate\(\{ id: r\.id, is_active: inativa \}\)\}/)
})

test('Serviços: abas na largura da tela, números numa linha e filtros que avisam que rolam', () => {
  assert.match(catalogo, /<div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-full sm:w-fit overflow-x-auto scrollbar-hide">/)
  assert.match(catalogo, /flex-1 sm:flex-none whitespace-nowrap px-2\.5 sm:px-4/)
  assert.match(catalogo, /function ResumoTab\(\{ itens \}\) \{\s*return \(\s*<div className="grid grid-cols-4 gap-2">/)
  assert.equal((catalogo.match(/<FiltroRolavel>/g) || []).length, 2, 'categorias de passeio e tipos de rota')
  assert.match(catalogo, /bg-gradient-to-l from-gray-800 to-transparent/)
  assert.match(catalogo, /<div className="shrink-0 whitespace-nowrap">\{action\}<\/div>/, '"Novo Modal" não quebra em duas linhas')
})

test('Serviços: município separado da categoria e modo de preço com nome legível', () => {
  assert.match(catalogo, /<RegionTags ids=\{t\.region_ids\} prefixo=" · " \/>/)
  assert.match(catalogo, /\{MODO_PRECO\[t\.pricing_mode\] \|\| t\.pricing_mode\}/, 'código desconhecido aparece como veio')
  assert.match(catalogo, /fixed_route:\s+'Rota tabelada'/)
  assert.doesNotMatch(catalogo, /<span className="h-px flex-1 bg-gray-800" \/>/, 'linha do grupo de veículos visível no cartão')
})

test('bloco recolhível compartilhado: acessível, lembra o estado e não perde o digitado', () => {
  assert.match(bloco, /aria-expanded=\{aberta\}/)
  assert.match(bloco, /aria-controls=\{corpo\}/)
  assert.match(bloco, /<div id=\{corpo\} hidden=\{!aberta\}/)
  assert.match(bloco, /line-clamp-2/, 'o resumo não corta no meio de uma palavra só')
})

test('Pagamentos: grupos por assunto e uma seção por gateway, todas recolhíveis', () => {
  const grupos = [...pagamentos.matchAll(/<GrupoPagamento titulo="([^"]+)">/g)].map((m) => m[1])
  assert.deepEqual(grupos, ['Checkout', 'Gateways', 'Recebimento e repasse', 'Outras integrações'])
  for (const id of ['formas', 'roteamento', 'mercadopago', 'pagarme', 'divisao', 'conta']) {
    assert.match(pagamentos, new RegExp(`<SecaoRecolhivel grupo="pagamentos" id="${id}"`), `seção ${id}`)
  }
  for (const id of ['split-operador', 'separados', 'whatsapp']) {
    assert.match(config, new RegExp(`<SecaoRecolhivel grupo="pagamentos" id="${id}"`), `seção ${id}`)
  }
  assert.doesNotMatch(pagamentos, /<CardHeader>/, 'nenhum cartão fixo sobrando na aba')
})

test('Pagamentos: o título de cada gateway diz para que ele está sendo usado', () => {
  assert.match(pagamentos, /form\.payment_gateway === valor && 'Padrão'/)
  assert.match(pagamentos, /gatewayPix === valor && 'PIX'/)
  assert.match(pagamentos, /cartaoMarcado\(valor\) && 'Cartão'/, 'mesma regra das caixas de cartão (com o legado)')
  assert.match(pagamentos, /<Selo>Não usado<\/Selo>/)
  assert.match(pagamentos, /selos=\{selosGateway\('mercado_pago', 'azul', 'mercadopago'\)\}/)
  assert.match(pagamentos, /selos=\{selosGateway\('pagarme', 'verde', 'pagarme'\)\}/)
})

test('Pagamentos: selo "não salvo" e salvar uma seção não apaga o digitado em outra', () => {
  assert.match(pagamentos, /const naoSalvo = \(secao\) => CHAVES_PAGAMENTO\[secao\]/)
  assert.match(pagamentos, /<Selo cor="ambar">Não salvo<\/Selo>/)
  // Ao voltar do servidor, só o que NÃO foi editado acompanha o servidor.
  assert.match(pagamentos, /for \(const k of Object\.keys\(f\)\) if \(f\[k\] !== antes\[k\]\) r\[k\] = f\[k\]/)
  assert.match(pagamentos, /salvoAnterior\.current = novo/)
  assert.doesNotMatch(pagamentos, /setForm\(\{ \.\.\.PAYMENT_DEFAULTS, \.\.\.settingsToMap\(settings\) \}\)/,
    'trocar o formulário inteiro apagava o que estava digitado nas outras seções')
})

test('Configurações: abas internas cabem na tela do celular', () => {
  assert.match(config, /<div className="flex gap-1 bg-gray-800 rounded-xl p-1 w-full sm:w-fit overflow-x-auto scrollbar-hide">/)
  assert.match(config, /<Icon size=\{15\} className="hidden sm:block shrink-0" \/>/)
})

test('Split por operador: no celular, percentuais embaixo do nome (sem espremer)', () => {
  assert.match(config, /<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">/)
  assert.match(config, /<div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">/)
})
