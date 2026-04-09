export function notFound(req, res) {
  res.status(404).json({
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, _next) {
  const status  = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Erro interno do servidor';

  if (status >= 500) console.error('[ERROR]', err);

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
