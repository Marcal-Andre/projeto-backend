function notFound(req, res, next) {
  const error = new Error(`Rota não encontrada: ${req.method} ${req.path}`);
  error.status = 404;

  next(error);
}

module.exports = notFound;
