const ALLOWED_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type,Authorization';

function configuredOrigins() {
  const configured = process.env.CORS_ORIGINS;
  const values = configured === undefined && process.env.NODE_ENV !== 'production'
    ? ['http://localhost:5173', 'http://127.0.0.1:5173']
    : (configured || '').split(',').map((origin) => origin.trim()).filter(Boolean);

  return new Set(values.map((origin) => {
    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error('Cada origem em CORS_ORIGINS deve ser uma URL válida.');
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    ) {
      throw new Error('CORS_ORIGINS deve conter somente origens HTTP ou HTTPS, sem caminhos.');
    }

    return url.origin;
  }));
}

const allowedOrigins = configuredOrigins();

function cors(req, res, next) {
  const origin = req.get('origin');
  if (!origin) {
    return next();
  }

  if (!allowedOrigins.has(origin)) {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(403);
    }
    return next();
  }

  res.vary('Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

module.exports = cors;
