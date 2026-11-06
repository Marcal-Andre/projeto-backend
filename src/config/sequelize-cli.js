require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`A variável de ambiente ${name} é obrigatória para executar migrações.`);
  }

  return value;
}

function databaseConfig() {
  const port = Number(process.env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT deve ser um inteiro entre 1 e 65535.');
  }

  return {
    username: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    host: process.env.DB_HOST || '127.0.0.1',
    port,
    dialect: 'mysql',
    logging: false,
  };
}

module.exports = {
  development: databaseConfig(),
  test: databaseConfig(),
  production: databaseConfig(),
};
