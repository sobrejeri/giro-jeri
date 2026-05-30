export function notFound(req, res) {
  res.status(404).json({
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, _next) {
  const status  = err.status || err.statusCode || 500;
  // Expõe a mensagem real do erro para facilitar debug
  const message = err.message || 'Erro interno do servidor';

  console.error('[ERROR]', err);

  res.status(status).json({
    error: message,
    detail: err.details || err.hint || undefined,
  });
}
