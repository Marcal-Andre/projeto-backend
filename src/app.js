const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('./middleware/cors');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const { MEDIA_ROOT } = require('./services/imageStorage');
const userRoutes = require('./routes/userRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminOrderRoutes = require('./routes/adminOrderRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const sequelize = require('./config/database');

const app = express();
const trustProxyHops = process.env.TRUST_PROXY_HOPS === undefined
  ? 0
  : Number(process.env.TRUST_PROXY_HOPS);

if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
  throw new Error('TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 10.');
}

app.disable('x-powered-by');
app.set('trust proxy', trustProxyHops);
app.use(cors);
app.use(express.json({ limit: '12mb' }));
app.use('/media', express.static(MEDIA_ROOT, {
  dotfiles: 'deny',
  fallthrough: true,
  index: false,
  immutable: true,
  maxAge: '1y',
}));

app.get('/', (req, res) => {
  res.send('Bem-vindo ao servidor!');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
  try {
    await sequelize.authenticate();
    return res.status(200).json({ status: 'ready', database: 'connected' });
  } catch (error) {
    console.error('Verificação de prontidão do banco falhou:', error.message);
    return res.status(503).json({ status: 'not_ready', database: 'disconnected' });
  }
});

app.use('/v1/user', userRoutes);
app.use('/v1/category', categoryRoutes);
app.use('/v1/product', productRoutes);
app.use('/v1/cart', cartRoutes);
app.use('/v1/order', orderRoutes);
app.use('/v1/payments', paymentRoutes);
app.use('/v1/admin/orders', adminOrderRoutes);
app.use('/v1/notifications', notificationRoutes);

if (
  process.env.ENABLE_DEMO_TOKEN_ENDPOINTS === 'true' &&
  process.env.NODE_ENV !== 'production'
) {
  app.get('/token', (req, res, next) => {
    try {
      const dados = {
        id: 1,
        nome: 'Usuário Exemplo',
      };
      const token = jwt.sign(dados, process.env.APP_KEY, { expiresIn: '1h' });

      res.json({ token });
    } catch (error) {
      next(error);
    }
  });

  app.get('/validar-token', (req, res) => {
    jwt.verify(req.query.token, process.env.APP_KEY, (error, decoded) => {
      if (error) {
        return res.status(401).json({ error: 'Token inválido.' });
      }

      res.json({ message: 'Token válido.', usuario: decoded });
    });
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;