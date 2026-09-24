// Higiene das inscrições de push.
//
// Bug: notificações chegavam ao aparelho mesmo DESLOGADO (a entrega do Web Push
// é no nível do SO/navegador, independente do login). Duas garantias:
//   1. Existe rota para REMOVER a inscrição do aparelho (chamada no logout).
//   2. Ao inscrever, um endpoint pertence a UM usuário (remove reivindicações
//      de outras contas no mesmo aparelho/app), senão o aparelho receberia push
//      de mais de uma conta.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const notif = fs.readFileSync(new URL('../src/routes/notifications.js', import.meta.url), 'utf8')

test('existe POST /push-unsubscribe que remove a inscrição por endpoint', () => {
  const i = notif.indexOf("router.post('/push-unsubscribe'")
  assert.notEqual(i, -1, 'a rota de unsubscribe precisa existir (chamada no logout)')
  const r = notif.slice(i, i + 600)
  assert.ok(/from\('push_subscriptions'\)\s*\.delete\(\)\s*\.eq\('endpoint'/.test(r.replace(/\s+/g, ' ')),
    'unsubscribe precisa deletar por endpoint')
})

test('push-subscribe garante um endpoint por usuário (remove os das outras contas)', () => {
  const i = notif.indexOf("router.post('/push-subscribe'")
  assert.notEqual(i, -1)
  const r = notif.slice(i, i + 1200).replace(/\s+/g, ' ')
  assert.ok(/delete\(\).*eq\('endpoint', endpoint\).*neq\('user_id', req\.user\.id\)/.test(r),
    'ao inscrever, precisa remover linhas do MESMO endpoint de OUTROS usuários')
})
