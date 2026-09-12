// Erro de cartão preso ao adquirente que falhou.
//
// Observado em produção com a Stone/Pagar.me: a conta estava com o Checkout
// hospedado desabilitado, a API deles respondeu "Checkout is disabled." e a
// tela mostrou essa frase numa caixa vermelha ACIMA dos dois botões — inclusive
// o do Mercado Pago, que estava funcionando. Dois defeitos nossos:
//
// 1. `erroCartao` era um campo só para todos os adquirentes, então a falha de
//    um aparecia como se fosse de ambos e o cliente não sabia qual tentar.
// 2. A mensagem do gateway ia CRUA para o cliente. "Checkout is disabled." está
//    em inglês, fala da configuração do adquirente e, para um turista, parece
//    defeito do site.
//
// Verificação por leitura da fonte: a tela de checkout só monta com estado de
// navegação legítimo (ela redireciona para a home sem ele), e reproduzir isso
// headless exigiria o fluxo inteiro de reserva. O que mudou aqui é estrutura de
// renderização, que é exatamente o que estes testes fixam.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const fonte = fs.readFileSync(
  new URL('../../turista/src/pages/checkout/CheckoutPayment.jsx', import.meta.url), 'utf8')

test('erroCartao é um mapa por adquirente, não um campo único', () => {
  assert.match(fonte, /const \[erroCartao,\s*setErroCartao\]\s*=\s*useState\(\{\}\)/,
    'com string única a falha de um adquirente contamina o outro')
})

test('a limpeza e a gravação do erro são por adquirente', () => {
  assert.match(fonte, /setErroCartao\(\(e\) => \(\{ \.\.\.e, \[acquirer\]: '' \}\)\)/,
    'limpar tem de afetar só o adquirente que está sendo tentado')
  assert.match(fonte, /\[acquirer\]:\s*'Não foi possível abrir o pagamento com cartão por aqui/,
    'gravar tem de ser na chave do adquirente que falhou')
})

test('a mensagem crua do gateway NÃO vai para o cliente', () => {
  const i = fonte.indexOf('async function pagarComCartaoHospedado')
  const fn = fonte.slice(i, fonte.indexOf('\n  }', i) + 4)
  assert.ok(!/setErroCartao\([^)]*err\?\.message/.test(fn),
    'err.message do gateway vem em inglês e sobre a configuração DELES')
  assert.match(fn, /console\.error\('\[checkout\] %s recusou:'/,
    'o texto original tem de ir para o console, onde serve para diagnóstico')
})

test('o erro é renderizado DENTRO do bloco do adquirente, depois do botão', () => {
  const i = fonte.indexOf('acquirersDisponiveis.map')
  assert.notEqual(i, -1)
  const bloco = fonte.slice(i, i + 1400)
  const iBotao = bloco.indexOf('<BotaoAdquirente')
  const iErro  = bloco.indexOf('erroCartao[g]')
  assert.ok(iBotao !== -1 && iErro !== -1, 'botão e erro precisam estar no mesmo bloco')
  assert.ok(iErro > iBotao, 'o erro tem de vir depois do botão que falhou')
  assert.match(bloco, /erroCartao\[g\] &&/, 'a exibição é condicionada ao adquirente da iteração')
})

test('não sobrou caixa de erro global acima dos botões', () => {
  const i = fonte.indexOf('acquirersDisponiveis.length > 0')
  const antesDoMap = fonte.slice(i, fonte.indexOf('acquirersDisponiveis.map', i))
  assert.ok(!/bg-red-50/.test(antesDoMap),
    'uma caixa antes do map voltaria a contaminar todos os adquirentes')
})

test('o ícone do botão de cartão aponta para um arquivo que existe', () => {
  const logos = fs.readdirSync(new URL('../../turista/public/logos/', import.meta.url))
  for (const m of fonte.matchAll(/logo:\s*'([^']+)'/g)) {
    assert.ok(logos.includes(m[1]),
      `logos/${m[1]} não existe em public/logos/ — daria 404 no checkout`)
  }
})
