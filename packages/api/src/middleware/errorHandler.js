export function notFound(req, res) {
  res.status(404).json({
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, _next) {
  const status  = err.status || err.statusCode || 500;
  const message = status >= 500
    ? 'Serviço temporariamente indisponível'
    : (err.message || 'Não foi possível concluir a solicitação');

  console.error('[ERROR]', {
    name: err.name,
    code: err.code,
    status,
    message: err.message,
    path: req.originalUrl,
  });

  res.status(status).json({
    error: message,
  });
}
