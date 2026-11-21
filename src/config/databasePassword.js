const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function databasePassword(environment = process.env.NODE_ENV) {
  const password = process.env.DB_PASSWORD;
  if (password) {
    return password;
  }

  const host = (process.env.DB_HOST || '127.0.0.1').toLowerCase();
  if (environment === 'development' && LOCAL_HOSTS.has(host)) {
    return '';
  }

  throw new Error(
    'DB_PASSWORD é obrigatória, exceto em desenvolvimento com banco local.',
  );
}

module.exports = databasePassword;
