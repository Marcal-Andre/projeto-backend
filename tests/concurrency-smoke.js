const http = require('node:http');
const { performance } = require('node:perf_hooks');
const app = require('../src/app');

const concurrency = Number(process.env.CONCURRENCY || 5000);
const connectionBatchSize = 50;
const responseHoldMs = 15000;
const requestTimeout = 60000;

if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('CONCURRENCY deve ser um número inteiro positivo.');
}

const server = http.createServer((req, res) => {
  const end = res.end;
  res.end = function delayedEnd(...args) {
    setTimeout(() => end.apply(res, args), responseHoldMs);
    return res;
  };

  app(req, res);
});

server.on('error', (error) => {
  console.error('Falha ao iniciar o servidor de teste:', error);
  process.exitCode = 1;
});

server.listen({ port: 0, host: '127.0.0.1', backlog: concurrency }, async () => {
  const { port } = server.address();
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const startedAt = performance.now();

  try {
    const requests = [];

    for (let offset = 0; offset < concurrency; offset += connectionBatchSize) {
      const batchSize = Math.min(connectionBatchSize, concurrency - offset);
      const batch = Array.from({ length: batchSize }, () => {
        let resolveConnected;
        let rejectConnected;
        const connected = new Promise((resolve) => {
          resolveConnected = resolve;
        });
        const response = new Promise((resolve) => {
          const request = http.get(
            {
              host: '127.0.0.1',
              port,
              path: '/health',
              agent,
              timeout: requestTimeout,
            },
            (result) => {
              result.resume();
              result.on('end', () => resolve({ status: result.statusCode }));
            },
          );

          request.on('socket', (socket) => {
            if (socket.connecting) {
              socket.once('connect', resolveConnected);
            } else {
              resolveConnected();
            }
          });
          request.on('timeout', () => {
            request.destroy(new Error(`Requisição excedeu ${requestTimeout}ms.`));
          });
          request.on('error', (error) => {
            resolveConnected();
            resolve({ error: error.code || error.message });
          });
        });

        return { connected, response };
      });

      requests.push(...batch);
      await Promise.all(batch.map((request) => request.connected));
    }

    const results = await Promise.all(requests.map((request) => request.response));
    const durationMs = Math.round(performance.now() - startedAt);
    const successfulRequests = results.filter((result) => result.status === 200).length;
    const failedRequests = concurrency - successfulRequests;
    const connectionErrors = results.reduce((errors, result) => {
      if (result.error) {
        errors[result.error] = (errors[result.error] || 0) + 1;
      }

      return errors;
    }, {});

    console.log(JSON.stringify({
      concurrency,
      responseHoldMs,
      successfulRequests,
      failedRequests,
      connectionErrors,
      durationMs,
    }, null, 2));

    if (failedRequests > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Falha durante o teste de concorrência:', error);
    process.exitCode = 1;
  } finally {
    agent.destroy();
    server.close((error) => {
      if (error) {
        console.error('Falha ao encerrar o servidor de teste:', error);
        process.exitCode = 1;
      }
    });
  }
});
