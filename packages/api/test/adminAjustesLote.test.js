// Admin — ajustes pedidos pelo dono (prints do iPhone): separadores visíveis
// nas listas, filtros de Reservas e Preços organizados, explicações de
// Temporadas atrás de um ⓘ, Repasses mais enxuto, parâmetros do sistema em
// grupos com nomes legíveis e Auditoria com rótulos legíveis.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const pagina = (n) => ler(`../../admin/src/pages/${n}.jsx`)
const PAGINAS = fs.readdirSync(new URL('../../admin/src/pages/', import.meta.url)).filter((f) => f.endsWith('.jsx'))

test('separadores visíveis: nada de linha gray-800 sobre cartão gray-800', () => {
  for (const f of PAGINAS) {
    assert.doesNotMatch(ler(`../../admin/src/pages/${f}`), /divide-gray-800/, `${f}: a linha some no fundo do cartão`)
  }
  for (const n of ['Reservas', 'Usuarios', 'Cupons', 'Auditoria']) {
    assert.match(pagina(n), /divide-y divide-gray-700/, `${n}: lista com separador`)
  }
})

test('Usuários: abas por tipo numa linha só (rolam para o lado)', () => {
  assert.match(pagina('Usuarios'), /<div className="flex gap-1 mb-3 bg-gray-900\/60 p-1 rounded-xl w-fit max-w-full overflow-x-auto scrollbar-hide">/)
})

test('Reservas: busca e tipo na mesma linha, período recolhível e roteamento com nome', () => {
  const r = pagina('Reservas')
  assert.match(r, /grid grid-cols-\[minmax\(0,1fr\)_auto\] gap-2/)
  assert.match(r, /aria-controls="periodo-reservas"/)
  assert.match(r, /'Período: qualquer data'/)
  assert.match(r, /<Radio size=\{13\} \/> Roteamento/)
})

test('Preços: resumo num cartão e filtros num painel que abre e fecha', () => {
  const p = pagina('Precos')
  assert.match(p, /const \[verFiltros, setVerFiltros\] = useState\(false\)/)
  assert.match(p, /aria-controls="filtros-precos"/)
  assert.match(p, /\{verFiltros && \(\s*<div id="filtros-precos"/)
  assert.match(p, /Resumo da grade: números e cobertura num cartão só/)
})

test('Temporadas: explicações atrás do ⓘ, com o aviso essencial à vista', () => {
  const t = pagina('Temporada')
  assert.equal((t.match(/<BotaoInfo /g) || []).length, 2)
  assert.match(t, /\{infoTemporada && \(/)
  assert.match(t, /\{infoFeriados && \(/)
  assert.match(t, /vale só no ano cadastrado/)
  const b = ler('../../admin/src/components/ui/BotaoInfo.jsx')
  assert.match(b, /aria-expanded=\{aberto\}/)
  assert.match(b, /aria-controls=\{controla\}/)
})

test('Repasses: "Prontos para liberar" primeiro e filtros num bloco', () => {
  const r = pagina('Repasses')
  assert.match(r, /<CardInd titulo="Prontos para liberar"[^>]*className="col-span-2 md:col-span-1" \/>\s*<CardInd titulo="Aguardando conclusão"/)
  assert.match(r, /Só conciliação \(sem data de conclusão\)/)
  assert.match(r, /overflow-x-auto scrollbar-hide -mx-4/)
})

test('Configurações: parâmetros em grupos, com busca, nomes legíveis e sem duplicar o banner', () => {
  const c = pagina('Configuracoes')
  assert.match(c, /const APARENCIA_KEYS = new Set\(\['home_banner_image_url', 'home_banner_title', 'home_banner_subtitle'\]\)/)
  assert.match(c, /!PAYMENT_KEYS\.has\(s\.setting_key\) && !APARENCIA_KEYS\.has\(s\.setting_key\)/)
  assert.match(c, /function grupoDoParametro\(chave\)/)
  assert.match(c, /return 'outros'/, 'chave nova sem regra cai em "Outros", nunca some')
  assert.match(c, /placeholder="Buscar parâmetro \(nome ou descrição\)…"/)
  assert.match(c, /affiliate_commission_percent: 'Comissão de afiliados \(%\)'/)
  assert.match(c, /Isto não é a Auditoria/)
  assert.match(c, /\{ id: 'sistema',\s+label: 'Parâmetros', icon: Settings \}/, 'sem "Sistema" repetido em dois níveis')
})

test('Auditoria: rótulos legíveis e detalhes que abrem ao tocar', () => {
  const a = pagina('Auditoria')
  assert.match(a, /status_change: 'Mudança de status'/)
  assert.match(a, /bookings: 'Reserva'/)
  assert.match(a, /\{ACAO\[log\.action_type\] \|\| log\.action_type\}/, 'valor desconhecido aparece como veio')
  assert.match(a, /JSON\.stringify\(log\.new_values_json, null, 2\)/)
})
