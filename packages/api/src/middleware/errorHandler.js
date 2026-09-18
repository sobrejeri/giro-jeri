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
//
// ── Por que `status < 500` não bastava ────────────────────────────────────
//
// Indisponibilidade que NÓS detectamos antes de cobrar — gateway sem chave,
// split impossível — é 503 por definição: o serviço está fora, não houve erro
// do cliente. Mas 503 caía no ramo genérico, e mensagens escritas justamente
// para o turista ("Use PIX, ou tente pelo Mercado Pago") eram trocadas por
// "Tente de novo em instantes" — conselho errado, porque tentar de novo não
// resolve nada quando falta configuração.
//
// Por isso a rota agora DECLARA a intenção (`err.cliente = true`) em vez de a
// gente adivinhar pelo código HTTP. Declarar é a única forma segura: o padrão
// continua sendo esconder, e só o texto que alguém escreveu para ser lido pelo
// cliente é marcado. Erro de banco continua barrado mesmo se marcado.
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
  const mensagemPropria = (err.cliente === true || status < 500) && !pareceErroDeBanco(err);
  const message = mensagemPropria
    ? (err.message || 'Não foi possível concluir a operação.')
    : 'Não foi possível concluir a operação. Tente de novo em instantes.';

  res.status(status).json({
    error: message,
    // O cliente precisa saber se este texto foi escrito para ser mostrado ou
    // se é o genérico. Sem essa marca, a tela de checkout não tem como decidir
    // entre exibir a mensagem do servidor e a dela própria — e acabava sempre
    // descartando as duas úteis junto com as inúteis.
    ...(mensagemPropria ? { cliente: true } : {}),
    ...(mensagemPropria && (err.details || err.hint) ? { detail: err.details || err.hint } : {}),
  });
}
