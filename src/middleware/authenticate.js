const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.get('authorization');
  const match = typeof header === 'string' && header.match(/^Bearer ([^\s]+)$/i);

  if (!match) {
    return res.status(401).json({
      error: { message: 'Token de autenticação obrigatório.' },
    });
  }

  try {
    const payload = jwt.verify(match[1], process.env.APP_KEY, {
      algorithms: ['HS256'],
    });
    if (!Number.isInteger(payload.id) || !['customer', 'admin'].includes(payload.role)) {
      return res.status(401).json({ error: { message: 'Token inválido.' } });
    }

    req.user = { id: payload.id, role: payload.role };
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: { message: 'Token inválido ou expirado.' } });
    }

    return next(error);
  }
}

module.exports = authenticate;
