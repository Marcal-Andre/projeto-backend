const { Sequelize } = require('sequelize');
const databasePassword = require('./databasePassword');

const dialect = process.env.DB_DIALECT || 'mysql';
let sequelize;

if (dialect === 'sqlite' && process.env.NODE_ENV === 'test') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || ':memory:',
    logging: false,
  });
} else if (dialect === 'mysql') {
  const port = Number(process.env.DB_PORT || 3306);
  const poolMax = Number(process.env.DB_POOL_MAX || 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT deve ser um inteiro entre 1 e 65535.');
  }
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 1000) {
    throw new Error('DB_POOL_MAX deve ser um inteiro entre 1 e 1000.');
  }

  sequelize = new Sequelize(
    process.env.DB_NAME || 'store_dev',
    process.env.DB_USER || 'root',
    databasePassword(),
    {
      dialect,
      host: process.env.DB_HOST || '127.0.0.1',
      port,
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: poolMax,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      retry: {
        max: 2,
      },
    },
  );
} else {
  throw new Error('DB_DIALECT deve ser mysql; sqlite está disponível apenas nos testes.');
}

module.exports = sequelize;
