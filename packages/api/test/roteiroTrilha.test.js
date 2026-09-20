// Roteiro do passeio (turista): o texto em prosa vira uma trilha ilustrada com
// pinos numerados. A extração das paradas é heurística sobre a descrição.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const comp = fs.readFileSync(
  new URL('../../turista/src/components/RoteiroTrilha.jsx', import.meta.url), 'utf8')
const cart = fs.readFileSync(
  new URL('../../turista/src/pages/CartPage.jsx', import.meta.url), 'utf8')

// Recupera a função pura do componente para exercitar a extração de verdade.
function loadExtrair() {
  const body = comp.match(/export function extrairParadas[\s\S]*?\n}/)[0].replace('export ', '')
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return extrairParadas`)()
}

test('extrai as paradas de um roteiro em prosa ("passando pela ...")', () => {
  const extrair = loadExtrair()
  const d = 'Saída às 9h, passando pela Árvore da Preguiça, Praia do Preá, ' +
    'Buraco Azul (ou Lagun Beach), Lagoa Azul, Lagoa do Paraíso e, conforme a ' +
    'época, Lagoa do Amâncio. Disponível em buggy.'
  assert.deepEqual(extrair(d), [
    'Árvore da Preguiça', 'Praia do Preá', 'Buraco Azul',
    'Lagoa Azul', 'Lagoa do Paraíso', 'Lagoa do Amâncio',
  ])
})

test('reconhece o padrão "Roteiro ...: X, Y e Z"', () => {
  const extrair = loadExtrair()
  const d = 'Roteiro exclusivo até a Barrinha: Praia do Preá, Vila da Barrinha ' +
    'e o pôr do sol nas dunas. Saída ~9h30.'
  assert.deepEqual(extrair(d), ['Praia do Preá', 'Vila da Barrinha', 'O pôr do sol nas dunas'])
})

test('sem lista reconhecível, devolve [] (o chamador mostra o texto normal)', () => {
  const extrair = loadExtrair()
  assert.deepEqual(extrair('Deslocamento direto à Lagoa do Paraíso e retorno.'), [])
  assert.deepEqual(extrair(''), [])
})

test('o carrinho usa a trilha quando há paradas', () => {
  assert.match(comp, /export default function RoteiroTrilha/)
  assert.match(cart, /import RoteiroTrilha, \{ extrairParadas \}/)
  assert.match(cart, /paradas\.length >= 2 \?/)
  assert.match(cart, /<RoteiroTrilha stops=\{paradas\}/)
})
