require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');
const { bootstrapAdmin } = require('./services/authService');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('A variável PORT deve ser um número entre 0 e 65535.');
}

for (const name of ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'APP_KEY']) {
  if (!process.env[name]) {
    throw new Error(`A variável de ambiente ${name} é obrigatória.`);
  }
}
if (
  (process.env.ADMIN_EMAIL && !process.env.ADMIN_PASSWORD) ||
  (!process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)
) {
  throw new Error('ADMIN_EMAIL e ADMIN_PASSWORD devem ser configuradas juntas.');
}
if (Buffer.byteLength(process.env.APP_KEY, 'utf8') < 32) {
  throw new Error('APP_KEY deve conter pelo menos 32 bytes.');
}

let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Sinal ${signal} recebido. Encerrando servidor.`);

  if (!server) {
    await sequelize.close();
    return;
  }

  server.close((error) => {
    if (error) {
      console.error('Falha ao encerrar o servidor:', error);
      process.exitCode = 1;
    }
    sequelize.close().catch((closeError) => {
      console.error('Falha ao fechar conexões com o banco:', closeError);
      process.exitCode = 1;
    });
  });

  const shutdownTimeout = setTimeout(() => {
    console.error('Tempo limite para encerramento excedido; fechando conexões.');
    server.closeAllConnections();
  }, 10000);
  shutdownTimeout.unref();
}

process.once('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error('Falha ao encerrar a aplicação:', error);
    process.exitCode = 1;
  });
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error('Falha ao encerrar a aplicação:', error);
    process.exitCode = 1;
  });
});

async function start() {
  await sequelize.authenticate();
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await bootstrapAdmin();
  }
  server = app.listen({ port, host, backlog: 8192 }, () => {
    console.log(`Servidor executando em http://${host}:${server.address().port}.`);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 35000;
  server.on('error', (error) => {
    console.error('Falha ao iniciar o servidor:', error);
    process.exitCode = 1;
  });
}

start().catch(async (error) => {
  console.error('Falha ao conectar ao banco de dados ou iniciar o servidor:', error.message);
  await sequelize.close();
  process.exitCode = 1;
});