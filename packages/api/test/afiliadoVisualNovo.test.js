// Afiliado no visual novo da Lojinha, só no celular. O painel de comissões (ou
// o convite, antes de ativar) vira o cabeçalho laranja de ponta a ponta e o 1º
// bloco depois dele atravessa a borda. O PC não muda: as regras ficam no @media
// do CSS (conferido pixel a pixel nos dois estados da tela).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const afiliado = ler('../../turista/src/pages/Affiliate.jsx')
const css = ler('../../turista/src/pages/ToursVisual2026.css')

test('Afiliado usa o escopo do visual novo e importa o CSS dele', () => {
  assert.match(afiliado, /<div className="min-h-screen pb-4 turiva-tours-visual2026 t2026-affiliate">/)
  assert.match(afiliado, /from 'date-fns\/locale'\nimport '\.\/ToursVisual2026\.css'/, 'import fora de qualquer import { … } de várias linhas')
  for (const c of ['t2026-affiliate-body ', 't2026-affiliate-hero ', 't2026-affiliate-activate ', 't2026-affiliate-panel ', 't2026-affiliate-grid ', 't2026-affiliate-stats ', 't2026-affiliate-pix ', 't2026-pix-types ', 't2026-pix-save ', 't2026-affiliate-share ', 't2026-affiliate-how ']) {
    assert.ok(afiliado.includes(`className="${c}`), `${c.trim()} na tela`)
  }
})

test('painel/convite viram o cabeçalho laranja de ponta a ponta', () => {
  assert.match(css, /\.t2026-affiliate \.t2026-affiliate-panel \{[^}]*margin: -20px -16px 0;[^}]*border-radius: 0;/, 'encosta nas bordas (o container tem px-4 e pt-5)')
  assert.match(css, /\.t2026-affiliate \.t2026-affiliate-panel \{[^}]*linear-gradient\(122deg,#e84303 0%,#ff6400 58%,#ff8d11 100%\)/, 'mesmo laranja da Lojinha')
  assert.match(css, /\.t2026-affiliate-month \{[^}]*background: rgba\(255,255,255,\.18\);/, 'meses em pastilhas claras (não mais pretas)')
})

test('o 1º bloco atravessa a borda do cabeçalho, vencendo o space-y do Tailwind', () => {
  // space-y-4 tem especificidade (0,3,0); o seletor dobrado tem (0,4,0).
  assert.match(css, /\.turiva-tours-visual2026\.t2026-affiliate \.t2026-affiliate-body > \.t2026-affiliate-grid,\s*\.turiva-tours-visual2026\.t2026-affiliate \.t2026-affiliate-body > \.t2026-affiliate-activate \{[^}]*margin-top: -34px;/)
})

test('cards, chave PIX e "Como funciona" no padrão da Lojinha', () => {
  assert.match(css, /\.turiva-tours-visual2026\.t2026-affiliate \.bg-white\.rounded-2xl \{[^}]*border-radius: 22px;/)
  assert.match(css, /\.t2026-pix-types > button\.bg-brand \{[^}]*linear-gradient\(112deg,#ff8e11,#fb5600\)/, 'tipo ativo como a aba ativa')
  assert.match(css, /\.t2026-affiliate-activate > button,\s*\.turiva-tours-visual2026 \.t2026-pix-save \{[^}]*linear-gradient\(112deg,#ff8e11,#fb5600\)/)
  assert.match(css, /\.t2026-affiliate-how li::before \{[^}]*content: counter\(passo\);/, 'números em círculos')
})

test('tudo isso vale só no celular (o PC continua igual)', () => {
  const inicioMedia = css.indexOf('@media (max-width: 1023px)')
  assert.notEqual(inicioMedia, -1)
  for (const c of ['.t2026-affiliate', '.t2026-pix-types', '.t2026-pix-save']) {
    assert.ok(css.indexOf(c) > inicioMedia, `${c} dentro do @media de celular`)
  }
})
