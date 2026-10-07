// Anel de story no perfil do OPERADOR (visto pelo turista).
//
// O avatar com anel de story (24h) procurava os stories por grupoDe(user.id) —
// o usuário LOGADO. No perfil de um operador aberto por um turista, isso nunca
// achava nada (o turista não é o autor), então o anel não aparecia e o avatar
// não abria o story. Agora o componente recebe `ownerId` (o dono do perfil) e o
// perfil do operador passa o id DO OPERADOR. Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const avatar         = read('../../turista/src/components/LiveAvatarStories.jsx')
const perfilOperador = read('../../turista/src/pages/PerfilOperador.jsx')
const perfilProprio  = read('../../turista/src/pages/Profile.jsx')

test('o anel usa o dono do perfil (ownerId), não o usuário logado', () => {
  assert.match(avatar, /function LiveAvatarStories\(\{ ownerId,/, 'o componente aceita ownerId')
  assert.match(avatar, /grupoDe\(ownerId \?\? user\?\.id\)/,
    'procura os stories do dono do perfil (cai no usuário logado só por padrão)')
})

test('a câmera de trocar foto só aparece para o dono (onPickPhoto)', () => {
  assert.match(avatar, /\{onPickPhoto && \([\s\S]*?aria-label="Trocar foto"/,
    'sem onPickPhoto (perfil de outra pessoa) não mostra a câmera')
})

test('o perfil público do operador usa o avatar com anel e o id do operador', () => {
  assert.match(perfilOperador, /import LiveAvatarStories from '\.\.\/components\/LiveAvatarStories'/, 'importa o avatar com anel')
  assert.match(perfilOperador, /<LiveAvatarStories[\s\S]*?ownerId=\{op\.id\}/, 'passa o id do operador como dono')
})

test('o meu próprio perfil segue funcionando (sem ownerId → usuário logado)', () => {
  // Profile.jsx continua passando onPickPhoto/isAdmin e NÃO precisa de ownerId.
  assert.match(perfilProprio, /<LiveAvatarStories/, 'o próprio perfil ainda usa o componente')
  assert.match(perfilProprio, /onPickPhoto=\{/, 'o dono mantém a troca de foto')
})
