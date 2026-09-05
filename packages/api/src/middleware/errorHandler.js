export function notFound(req, res) {
  res.status(404).json({
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

// Erro do Postgres nunca deve chegar ao cliente. Um cliente da Turiva viu, na
// tela de pagamento, "duplicate key value violates unique constraint
// payments_gateway_transaction_id_key" — nome de tabela, de coluna e de
// constraint entregues a quem está pagando. Além de assustar, é mapa do banco
// de graça para quem quiser atacar.
//
// Erro que NÓS escrevemos (com `status` definido pela rota) é mensagem
// pensada para o cliente e passa. O resto vira texto genérico, e o detalhe
// completo fica no log do servidor, onde ele serve para depurar.
const CODIGO_POSTGRES = /^[0-9A-Z]{5}$/;

function pareceErroDeBanco(err) {
  if (err?.code && CODIGO_POSTGRES.test(String(err.code))) return true;
  const m = String(err?.message || '');
  return /violates|constraint|relation ".*" does not exist|column .* does not exist|duplicate key|syntax error at or near/i.test(m);
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;

  // Log completo — é aqui que o detalhe tem valor.
  console.error('[ERROR] %s %s status=%s code=%s msg=%s',
    req.method, req.originalUrl, status, err?.code || '-', err?.message || '-');
  if (err?.stack) console.error(err.stack);

  // Mensagem própria da rota (4xx que nós lançamos) chega ao cliente como foi
  // escrita. Falha interna vira texto genérico.
  const mensagemPropria = status < 500 && !pareceErroDeBanco(err);
  const message = mensagemPropria
    ? (err.message || 'Não foi possível concluir a operação.')
    : 'Não foi possível concluir a operação. Tente de novo em instantes.';

  res.status(status).json({
    error: message,
    ...(mensagemPropria && (err.details || err.hint) ? { detail: err.details || err.hint } : {}),
  });
}
