function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;
  let message = status >= 500 ? 'Erro interno do servidor.' : error.message;

  if (error.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    message = 'Já existe um registro com esses dados.';
  } else if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeForeignKeyConstraintError') {
    status = 400;
    message = 'Os dados informados são inválidos.';
  } else if (error.type === 'entity.too.large') {
    status = 413;
    message = 'O corpo da requisição excede o limite permitido.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400;
    message = 'O corpo da requisição contém JSON inválido.';
  }

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      message,
    },
  });
}

module.exports = errorHandler;
