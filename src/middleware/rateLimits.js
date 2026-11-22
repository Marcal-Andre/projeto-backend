const rateLimit = require('express-rate-limit');

function createRateLimit(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({ error: { message } });
    },
  });
}

module.exports = {
  login: createRateLimit(15 * 60 * 1000, 10, 'Muitas tentativas de login. Tente novamente mais tarde.'),
  registration: createRateLimit(60 * 60 * 1000, 5, 'Muitos cadastros deste endereço. Tente novamente mais tarde.'),
  orderCreation: createRateLimit(15 * 60 * 1000, 10, 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.'),
  payment: createRateLimit(15 * 60 * 1000, 10, 'Muitas tentativas de pagamento. Tente novamente mais tarde.'),
};
