// Passeio e rota "SOB COTAÇÃO" (pedido do dono, migração 128).
//
// O admin escolhe, no cadastro, "valor fixo" ou "sob cotação". Sob cotação o
// item fica na vitrine SEM preço e o toque leva ao fluxo de cotação que já
// existe, preenchido: passeio → "Montar meu passeio" com as paradas do roteiro;
// rota → translado personalizado com origem e destino. A cotação leva a
// ETIQUETA do passeio/rota (tour_id/route_id) e a cooperativa a vê.
//
// O que estes testes fixam:
//   • a migração só acrescenta (nada de valor fixo muda sozinho);
//   • sem a migração, nada quebra — e ligar a opção sem ela AVISA, em vez de
//     salvar um "sob cotação" que o app trataria como valor fixo;
//   • o servidor recusa reservar pelo valor fixo um item sob cotação (a rota
//     sob cotação pode ter preço zero);
//   • a etiqueta chega à cooperativa mesmo antes da migração (nas observações).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const semComentarios = (t) => t.replace(/^\s*\/\/.*$/gm, '')

const migracao  = ler('../../../supabase/migrations/128_cotacao_por_passeio_e_rota.sql')
const catalog   = ler('../src/routes/catalog.js')
const tours     = ler('../src/routes/tours.js')
const tourQ     = ler('../src/routes/tourQuotes.js')
const transfers = ler('../src/routes/transfers.js')
const payments  = ler('../src/routes/payments.js')
const bookings  = ler('../src/routes/bookings.js')
const servico   = ler('../src/services/sobCotacao.js')
const turista   = (f) => ler(`../../turista/src/${f}`)
const admin     = ler('../../admin/src/pages/Catalogo.jsx')
const coop      = ler('../../operador/src/pages/Reservas.jsx')

// ── Banco ───────────────────────────────────────────────────────────────────
test('migração 128: só acrescenta, tudo nasce desligado e é idempotente', () => {
  assert.match(migracao, /ALTER TABLE tours ADD COLUMN IF NOT EXISTS quote_only\s+BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(migracao, /ALTER TABLE tours ADD COLUMN IF NOT EXISTS quote_stops JSONB\s+NOT NULL DEFAULT '\[\]'/)
  assert.match(migracao, /ALTER TABLE transfer_routes ADD COLUMN IF NOT EXISTS quote_only BOOLEAN NOT NULL DEFAULT FALSE/)
  assert.match(migracao, /ALTER TABLE tour_quotes\s+ADD COLUMN IF NOT EXISTS tour_id\s+UUID REFERENCES tours\(id\)\s+ON DELETE SET NULL/)
  assert.match(migracao, /ALTER TABLE transfer_quotes ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES transfer_routes\(id\) ON DELETE SET NULL/)
  assert.doesNotMatch(semComentarios(migracao), /^\s*(UPDATE|DELETE\s+FROM|DROP|TRUNCATE)\b/im, 'não mexe em dado nem apaga nada')
  const checklist = ler('../../../supabase/o_que_falta_rodar.sql')
  for (const c of ["('tours', 'quote_only'", "('transfer_routes', 'quote_only'", "('tour_quotes', 'tour_id'", "('transfer_quotes', 'route_id'"]) {
    assert.ok(checklist.includes(c), `o_que_falta_rodar.sql precisa listar ${c}`)
  }
})

// ── Cadastro (admin) ────────────────────────────────────────────────────────
test('cadastro: grava sob cotação no passeio e na rota, e avisa se faltar a migração', () => {
  assert.match(catalog, /'quote_only',\s*\n\]/, 'a rota aceita quote_only (sem isto o pick descartaria em silêncio)')
  assert.match(catalog, /if \(quote_only\s+!== undefined\) update\.quote_only\s+= !!quote_only/)
  assert.match(catalog, /if \(quote_stops\s+!== undefined\) update\.quote_stops\s+= limparParadasCotacao\(quote_stops\)/)
  // Ligado sem a coluna: 409 com o caminho da migração — nos dois cadastros.
  const avisos = catalog.match(/COLUNAS_COTACAO\.has\(faltante\) && ligouCotacao\(/g) || []
  assert.equal(avisos.length, 3, 'update do passeio + criar e editar rota')
  assert.match(catalog, /COLUNAS_COTACAO\.has\(colunaFaltante\(error\)\) && ligouCotacao\(linha\)/, 'criar passeio')
  assert.match(catalog, /128_cotacao_por_passeio_e_rota\.sql/)
  // Desligado (o padrão), a coluna ausente é só descartada — passeio comum salva.
  assert.match(catalog, /if \(faltante && faltante in payloadUpd\) \{/)
})

test('roteiro do passeio: só nome + id de parada válido, até 20', () => {
  const fn = catalog.slice(catalog.indexOf('function limparParadasCotacao'), catalog.indexOf('// ── Modais de operação'))
  assert.match(fn, /UUID_RE\.test\(p\.stop_id\)/)
  assert.match(fn, /\.slice\(0, 20\)/)
  assert.match(fn, /\.filter\(\(p\) => p\.name\)/)
})

// ── Vitrine (API pública) ───────────────────────────────────────────────────
test('lista de passeios traz sob cotação numa consulta à parte e tolerante', () => {
  assert.match(tours, /\.from\('tours'\)\.select\('id, quote_only, quote_stops'\)\.in\('id', ids\)/)
  assert.match(tours, /console\.warn\('\[tours\] sob cotação indisponível/)
  // A consulta principal NÃO ganhou as colunas novas: sem a migração ela
  // derrubaria (ou empobreceria) a vitrine inteira.
  const principal = tours.slice(tours.indexOf('const montar ='), tours.indexOf('let { data, error } = await montar('))
  assert.doesNotMatch(principal, /quote_only/)
})

// ── Reserva: nada de valor fixo para item sob cotação ───────────────────────
test('servidor recusa reservar pelo valor fixo um passeio/rota sob cotação', () => {
  assert.match(servico, /export async function checkQuoteOnly\(\{ service_type, service_id \}\)/)
  assert.match(servico, /service_type === 'tour' \? 'tours'/)
  assert.match(servico, /service_type === 'transfer' \? 'transfer_routes'/)
  assert.match(servico, /if \(error\) return null/, 'sem a migração, nada é sob cotação')
  assert.equal((payments.match(/await checkQuoteOnly\(/g) || []).length, 3, 'intent, request e carrinho')
  assert.match(bookings, /await checkQuoteOnly\(\{\s*service_type: body\.service_type,\s*service_id:\s+body\.service_type === 'transfer' \? body\.route_id : body\.service_id,/)
})

// ── Cotação com etiqueta ────────────────────────────────────────────────────
test('cotação de passeio leva a etiqueta do passeio — e cai nas observações sem a migração', () => {
  assert.match(tourQ, /tour_id:\s+z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/)
  assert.match(tourQ, /\.from\('tours'\)\.select\('id, name'\)\.eq\('id', body\.tour_id\)\.eq\('is_active', true\)/, 'id inventado não vira etiqueta')
  assert.match(tourQ, /colunaFaltante\(error\) === 'tour_id'/)
  assert.match(tourQ, /`Passeio escolhido: \$\{passeio\.name\}`/)
  assert.match(tourQ, /res\.json\(esconderContato\(await comEtiquetaDoPasseio\(data\)\)\)/, 'a fila da cooperativa recebe o nome')
  assert.match(tourQ, /nomePasseio \? `Passeio: \$\{nomePasseio\}` : null/, 'e a reserva gerada também')
})

test('cotação de translado leva a etiqueta da rota — e cai nas observações sem a migração', () => {
  assert.match(transfers, /route_id:\s+z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/)
  assert.match(transfers, /\.eq\('id', body\.route_id\)\.eq\('is_active', true\)\.maybeSingle\(\)/)
  assert.match(transfers, /colunaFaltante\(error\) === 'route_id'/)
  assert.match(transfers, /`Rota da vitrine: \$\{rotuloDaRota\(rota\)\}`/)
  assert.match(transfers, /res\.json\(esconderContatoDaCotacao\(await comEtiquetaDaRota\(data\)\)\)/)
})

// ── App do turista ──────────────────────────────────────────────────────────
test('turista: regra única e cartões sem preço nem carrinho', () => {
  const regra = turista('lib/sobCotacao.js')
  assert.match(regra, /export const ehSobCotacao = \(item\) => item\?\.quote_only === true/)
  assert.match(regra, /`\/passeio-personalizado\?passeio=\$\{encodeURIComponent\(tour\.id\)\}`/)
  const card = turista('components/tours/TourCard.jsx')
  assert.match(card, /\{onToggleCart && !sobCotacao && \(/)
  assert.match(card, /sobCotacao \? t\('toursPg\.card\.quoteOnly'\)/)
  assert.match(turista('lib/precoCartao.js'), /if \(tour\.quote_only === true\) return null/, 'regra antiga do Motor de Preços não vira preço')
})

test('turista: o toque leva à cotação em todas as entradas', () => {
  assert.match(turista('pages/Tours.jsx'), /if \(ehSobCotacao\(tour\)\) \{ navigate\(linkCotacaoDoPasseio\(tour\)\); return \}/)
  assert.equal((turista('pages/Tours.jsx').match(/onToggleCart=\{ehSobCotacao\(tour\) \? undefined/g) || []).length, 2)
  assert.match(turista('pages/ToursDesktop.jsx'), /if \(ehSobCotacao\(tour\)\) \{ navigate\(linkCotacaoDoPasseio\(tour\)\); return \}/)
  assert.match(turista('pages/Favoritos.jsx'), /navigate\(linkCotacaoDoPasseio\(tour\)\)/)
  assert.match(turista('pages/TourDetail.jsx'), /if \(ehSobCotacao\(tour\)\) return <Navigate to=\{linkCotacaoDoPasseio\(tour\)\} replace \/>/, 'link direto também')
  assert.equal((turista('pages/HomeDesktop.jsx').match(/ehSobCotacao\(tour\) \? linkCotacaoDoPasseio\(tour\)/g) || []).length, 2)
  const trf = turista('pages/Transfers.jsx')
  assert.equal((trf.match(/onSelect=\{\(\) => \(ehSobCotacao\(r\) \? abrirCotacaoDaRota\(r\) : setSheetRoute\(r\)\)\}/g) || []).length, 3)
  assert.match(turista('pages/TransfersDesktop.jsx'), /if \(ehSobCotacao\(r\)\) \{ abrirCotacaoDaRota\(r\); return \}/)
})

test('turista: Montar meu passeio chega preenchido e o pedido sai com a etiqueta', () => {
  const pp = turista('pages/PasseioPersonalizado.jsx')
  assert.match(pp, /const passeioId = params\.get\('passeio'\)/)
  assert.match(pp, /setStops\(paradas\.map\(\(p\) => \(\{ id: nextId\.current\+\+, name: p\.name, stopId: p\.stop_id \|\| null, outro: !p\.stop_id \}\)\)\)/)
  assert.match(pp, /\.\.\.\(passeio\?\.id \? \{ tour_id: passeio\.id \} : \{\}\)/)
  assert.match(pp, /Passeio escolhido · sob cotação/)
  assert.match(pp, /`\/passeio-personalizado\$\{passeioId \? `\?passeio=/, 'login volta para o mesmo passeio')
})

test('turista: translado personalizado com a rota — etiqueta só enquanto origem e destino forem os dela', () => {
  for (const f of ['pages/Transfers.jsx', 'pages/TransfersDesktop.jsx']) {
    const s = turista(f)
    assert.match(s, /customOrigin === customRoute\.origin_name && customDest === customRoute\.destination_name/, f)
    assert.match(s, /\.\.\.\(rotaDaVitrine \? \{ route_id: rotaDaVitrine\.id \} : \{\}\)/, f)
    assert.match(s, /navState\?\.cotacaoRotaId/, `${f}: atalho da página inicial`)
  }
})

test('turista: textos novos nos três idiomas', () => {
  for (const l of ['pt', 'en', 'es']) {
    const d = JSON.parse(turista(`i18n/locales/${l}.json`))
    for (const k of ['quoteOnly', 'quoteCta']) assert.ok(d.toursPg.card[k], `${l}: toursPg.card.${k}`)
    for (const k of ['quoteOnly', 'quoteCta', 'quoteTagTitle', 'quoteTagDesc']) assert.ok(d.transfersPg[k], `${l}: transfersPg.${k}`)
  }
})

// ── Admin e cooperativa ─────────────────────────────────────────────────────
test('admin: escolha de preço no passeio (com roteiro) e na rota, e selo nas listas', () => {
  assert.equal((admin.match(/<EscolhaPreco\b/g) || []).length, 2)
  assert.match(admin, /<ParadasDoRoteiro\s+valor=\{form\.quote_stops \|\| \[\]\}/)
  assert.match(admin, /\{!routeForm\.quote_only && \(\s*<Input label="Preço padrão \(R\$\)"/, 'sob cotação o preço some do formulário')
  assert.match(admin, /\{t\.name\}\{t\.quote_only && <> <SeloCotacao \/><\/>\}/)
  assert.match(admin, /\{r\.quote_only \? \(\s*<span className=\{inativa \? 'opacity-60' : ''\}><SeloCotacao \/><\/span>/)
  assert.match(admin, /quote_only: false, quote_stops: \[\],/)
})

test('cooperativa: a cotação mostra de qual passeio/rota da vitrine ela veio', () => {
  assert.match(coop, /Passeio: \{quote\.tour_name\}/)
  assert.match(coop, /quote\.route_label \? \(/)
  assert.match(coop, /Passeio: \{quoteModal\.tour_name\}/)
})
