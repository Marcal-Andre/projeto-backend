const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function authenticate(req, res, next) {
  const header = req.get('authorization');
  const match = typeof header === 'string' && header.match(/^Bearer ([^\s]+)$/i);

  if (!match) {
    return res.status(401).json({
      error: { message: 'Token de autenticação obrigatório.' },
    });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], process.env.APP_KEY, {
      algorithms: ['HS256'],
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: { message: 'Token inválido ou expirado.' } });
    }

    return next(error);
  }

  if (!payload || !Number.isSafeInteger(payload.id) || payload.id < 1) {
    return res.status(401).json({ error: { message: 'Token inválido.' } });
  }

  let user;
  try {
    user = await User.findByPk(payload.id);
  } catch (error) {
    return next(error);
  }

  if (!user) {
    return res.status(401).json({ error: { message: 'Usuário não encontrado ou acesso revogado.' } });
  }

  req.user = { id: user.id, role: user.role };
  return next();
}

module.exports = authenticate;
