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
  // A gravação continua sendo na chave do adquirente; o que mudou é que o
  // valor passou a ser escolhido entre a mensagem do servidor e a genérica.
  assert.match(fonte, /\[acquirer\]:\s*err\?\.cliente/,
    'gravar tem de ser na chave do adquirente que falhou')
})

test('a mensagem crua do gateway NÃO vai para o cliente', () => {
  const i = fonte.indexOf('async function pagarComCartaoHospedado')
  const fn = fonte.slice(i, fonte.indexOf('\n  }', i) + 4)
  assert.match(fn, /console\.error\('\[checkout\] %s recusou:'/,
    'o texto original tem de ir para o console, onde serve para diagnóstico')

  // A regra original aqui era "nunca exibir err.message". Ela estava larga
  // demais e custou caro: derrubava junto as mensagens que o NOSSO servidor
  // escreve em português para o turista ("Use PIX, ou tente pelo Mercado
  // Pago"), que são exatamente as acionáveis. O servidor marca essas com
  // `cliente: true`; a regra agora é a marca, não a origem.
  assert.ok(!/setErroCartao\([^)]*[^.]err\?\.message/.test(fn.replace(/err\?\.cliente && err\?\.message/g, '')),
    'err.message sem a marca `cliente` pode ser o texto do gateway, em inglês')
  assert.match(fn, /err\?\.cliente && err\?\.message\s*\?\s*err\.message/,
    'a mensagem do servidor só aparece quando ele a marcou como texto para o cliente')
  assert.match(fn, /:\s*'Não foi possível abrir o pagamento com cartão por aqui/,
    'sem a marca, continua valendo o texto genérico')
})

test('o erro é renderizado DENTRO do bloco do adquirente, depois do botão', () => {
  // Janela de tamanho fixo NÃO serve aqui: o bloco do Pagar.me inline foi
  // inserido antes do genérico e empurrou o erro para fora dos 1400
  // caracteres, quebrando o teste sem que nada de errado tivesse acontecido.
  // A verificação passou a ser estrutural — para CADA lugar que mostra o erro,
  // existe um botão antes dele, e nenhum fica órfão.
  const i = fonte.indexOf('acquirersDisponiveis.map')
  assert.notEqual(i, -1)
  const regiao = fonte.slice(i)

  const ocorrencias = [...regiao.matchAll(/erroCartao\[g\] &&/g)].map((m) => m.index)
  assert.ok(ocorrencias.length >= 2,
    'cada caminho de cartão (inline do Pagar.me e o que redireciona) mostra o próprio erro')

  for (const pos of ocorrencias) {
    const antes = regiao.lastIndexOf('<BotaoAdquirente', pos)
    assert.notEqual(antes, -1, 'erro exibido sem um botão antes dele')
    // Nada de outro adquirente pode se meter entre o botão e o seu erro.
    const entre = regiao.slice(antes, pos)
    assert.ok(!entre.includes('acquirersDisponiveis.map'),
      'o erro precisa pertencer ao botão imediatamente anterior')
  }
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

// ── Rótulos dos botões de cartão ────────────────────────────────────────────
// Existiam DOIS botões com o texto idêntico "Pagar com cartão" e
// comportamentos opostos: um redireciona para fora do site (adquirente
// hospedado) e o outro abre o formulário aqui dentro. O cliente clicava
// esperando o formulário e era mandado embora — ou clicava esperando sair e
// abria um formulário.

test('nenhum rótulo de botão de cartão se repete', () => {
  // O rótulo do formulário embutido virou CONDICIONAL, então ele não aparece
  // mais como literal num atributo — e este teste passaria a não enxergá-lo,
  // ficando verde sem garantir nada. Por isso os dois valores possíveis do
  // ternário entram na conta: a colisão que importa é justamente entre o ramo
  // "Pagar com cartão" dele e o botão do Pagar.me.
  const doTernario = [...fonte.matchAll(
    /rotuloFormularioNoSite\s*=\s*[\s\S]{0,80}?\?\s*'([^']+)'\s*:\s*'([^']+)'/g)]
    .flatMap((m) => [m[1], m[2]])
  assert.equal(doTernario.length, 2, 'o rótulo condicional precisa ser legível pelo teste')

  const rotulos = [
    ...[...fonte.matchAll(/rotulo:\s*'([^']+)'/g)].map((m) => m[1]),
    ...[...fonte.matchAll(/rotulo="([^"]+)"/g)].map((m) => m[1]),
  ]
  // Cada ramo do ternário é conferido contra os rótulos FIXOS. Os dois ramos
  // entre si não colidem: nunca aparecem ao mesmo tempo.
  for (const ramo of doTernario) {
    assert.ok(!rotulos.includes(ramo) || ramo === 'Pagar com cartão',
      `ramo "${ramo}" colide com um rótulo fixo`)
  }
  // E o ramo que repete "Pagar com cartão" só vale quando o Pagar.me NÃO está
  // na tela — que é exatamente a condição escrita no código.
  assert.match(fonte, /acquirersDisponiveis\.includes\('pagarme'\)\s*\?\s*'Pagar com cartão \(Mercado Pago\)'/,
    'com o Pagar.me presente, o formulário TEM de ceder o nome')

  const repetidos = rotulos.filter((r, i) => rotulos.indexOf(r) !== i)
  assert.deepEqual(repetidos, [],
    `rótulo duplicado em botões com comportamentos diferentes: ${repetidos.join(', ')}`)
})

test('o botão do Pagar.me não carrega o nome do adquirente', () => {
  // A convenção anterior era "todo botão hospedado nomeia o adquirente", e ela
  // resolvia a colisão de rótulos dando um nome único a cada um. Mudou a
  // pedido: "Pagar.me" não significa nada para um turista. A colisão passou a
  // ser evitada pelo outro lado — o rótulo do formulário embutido é que é
  // condicional (ver pagarme.test.js).
  assert.doesNotMatch(fonte, /rotulo: 'Pagar com Pagar\.me'/)
  assert.match(fonte, /rotulo: 'Pagar com Mercado Pago'/,
    'o do Mercado Pago continua nomeando: é conta lá que ele exige')
  assert.match(fonte, /estilo=\{ESTILO_CARTAO_SITE\}[\s\S]{0,160}rotulo=\{rotuloFormularioNoSite\}/,
    'o formulário embutido usa o rótulo condicional')
})
