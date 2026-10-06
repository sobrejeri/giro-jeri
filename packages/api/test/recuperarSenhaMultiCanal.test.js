// Recuperação de senha pela tela de LOGIN — multicanal.
//
// Turista: digita @usuário OU e-mail. Operador: CPF/CNPJ. Em ambos, ao
// solicitar, a API acha a conta e, se houver WhatsApp, manda o link na hora;
// se NÃO houver como entregar (sem telefone/Z-API off), avisa os ADMINs
// (sininho do painel) para enviarem manualmente. Resposta sempre genérica
// (anti-enumeração). Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const auth          = read('../src/routes/auth.js')
const notify        = read('../src/services/notify.js')
const notifications = read('../src/routes/notifications.js')
const turistaAuth   = read('../../turista/src/pages/Auth.jsx')
const operadorLogin = read('../../operador/src/pages/Login.jsx')
const operadorApi   = read('../../operador/src/lib/api.js')

test('forgot-password reconhece @username, e-mail, CPF/CNPJ e telefone', () => {
  // @handle explícito e handle sem @ caem no lookup por username
  assert.match(auth, /raw\.startsWith\('@'\)/, 'detecta @handle')
  assert.match(auth, /\.eq\('username', handle\)/, 'resolve por username')
  // e-mail
  assert.match(auth, /raw\.includes\('@'\)/, 'detecta e-mail')
  assert.match(auth, /\.ilike\('email', raw\)/, 'resolve por e-mail')
  // CPF (11) / CNPJ (14): compara só os dígitos (documento pode ter máscara)
  assert.match(auth, /digits\.length === 11 \|\| digits\.length === 14/, 'aceita CPF ou CNPJ')
  assert.match(auth, /\.not\('document_number', 'is', null\)/, 'varre quem tem documento')
  assert.match(auth, /String\(u\.document_number \|\| ''\)\.replace\(\/\\D\/g, ''\) === digits/,
    'bate o documento por dígitos')
  // telefone (fallback, cobre o 11-dígitos que era celular)
  assert.match(auth, /phone\.eq\.\$\{e164\},phone\.eq\.\$\{digits\}/, 'resolve por telefone')
})

test('admin é SEMPRE avisado da solicitação (mensagem conforme a entrega)', () => {
  assert.match(auth, /let delivered = false/, 'rastreia se o WhatsApp saiu')
  assert.match(auth, /delivered = !r\?\.skipped/, 'entrega = WhatsApp não pulado')
  assert.match(auth, /notifyAdmins\(\{[\s\S]*?templateKey: 'admin_reset_request'/, 'sempre avisa os admins')
  assert.match(auth, /o link já foi enviado por WhatsApp\./, 'mensagem quando o link saiu automático')
  assert.match(auth, /Envie manualmente pelo painel de Usuários\./, 'mensagem quando precisa de envio manual')
})

test('dashboard do admin lista as solicitações pendentes', () => {
  const admin     = read('../src/routes/admin.js')
  const adminApi  = read('../../admin/src/lib/api.js')
  const dashboard = read('../../admin/src/pages/Dashboard.jsx')
  assert.match(admin, /router\.get\('\/reset-requests', requireAdmin/, 'endpoint das solicitações pendentes')
  assert.match(admin, /template_key', 'admin_reset_request'\)[\s\S]*?\.is\('read_at', null\)/,
    'só as pendentes (não lidas) do admin logado')
  assert.match(adminApi, /getResetRequests:\s*\(\)\s*=> request\('\/api\/admin\/reset-requests'\)/, 'helper da api')
  assert.match(dashboard, /function SolicitacoesResetSenha/, 'card no dashboard')
  assert.match(dashboard, /api\.getResetRequests\(\)/, 'o card busca as solicitações')
})

test('template admin_reset_request existe e é exclusivo do app admin', () => {
  assert.match(notify, /admin_reset_request:\s*\{ enabled: true/, 'template cadastrado em notify.js')
  assert.match(notifications, /ADMIN_ONLY_KEYS = \[[^\]]*'admin_reset_request'/,
    'aviso só aparece no sininho do admin, não no turista/operador')
})

test('turista: tela de forgot menciona @usuário', () => {
  assert.match(turistaAuth, /label="@usuário, e-mail ou telefone"/, 'o campo aceita @ além de e-mail/telefone')
})

test('operador: forgot self-service por CPF/CNPJ', () => {
  assert.match(operadorApi, /forgotPassword: \(body\) => request\('\/api\/auth\/forgot-password'/,
    'o app do operador tem o helper de recuperação')
  assert.match(operadorLogin, /api\.forgotPassword\(\{ identifier: digits \}\)/, 'solicita com o documento')
  assert.match(operadorLogin, /digits\.length !== 11 && digits\.length !== 14/, 'valida CPF/CNPJ antes de enviar')
  assert.match(operadorLogin, /Esqueci minha senha/, 'tem o acesso a recuperar senha')
  // não é mais só "falar com o administrador" por WhatsApp
  assert.doesNotMatch(operadorLogin, /falar com o administrador/, 'deixou de ser só redirecionar pro WhatsApp do admin')
})
