const { performance } = require('node:perf_hooks');

const baseUrl = new URL(process.env.LOAD_TEST_URL || 'http://127.0.0.1:3000');
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 5);
const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS || 10);
const timeoutMs = 5000;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const paths = [
  '/health',
  '/health/ready',
  '/v1/product/search?limit=20&page=1',
];

if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error('LOAD_TEST_URL deve ser uma URL HTTP(S) sem credenciais.');
}
if (
  !loopbackHosts.has(baseUrl.hostname) &&
  process.env.LOAD_TEST_ALLOW_REMOTE !== 'true'
) {
  throw new Error('Para carregar um host remoto, defina LOAD_TEST_ALLOW_REMOTE=true explicitamente.');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) {
  throw new Error('LOAD_TEST_CONCURRENCY deve ser um inteiro entre 1 e 20.');
}
if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 60) {
  throw new Error('LOAD_TEST_DURATION_SECONDS deve ser um inteiro entre 1 e 60.');
}

function percentile(samples, value) {
  if (samples.length === 0) {
    return null;
  }
  return Math.round(samples[Math.ceil(value * samples.length) - 1]);
}

async function main() {
  const endAt = Date.now() + durationSeconds * 1000;
  const latencies = [];
  const failures = [];
  let requestCount = 0;

  async function worker(workerIndex) {
    let pathIndex = workerIndex % paths.length;
    while (Date.now() < endAt) {
      const startedAt = performance.now();
      try {
        const response = await fetch(new URL(paths[pathIndex], baseUrl), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        await response.body?.cancel();
        const elapsed = Math.round(performance.now() - startedAt);
        latencies.push(elapsed);
        requestCount += 1;
        if (!response.ok) {
          failures.push({ status: response.status, path: paths[pathIndex] });
        }
      } catch (error) {
        requestCount += 1;
        failures.push({ error: error.name || 'RequestError', path: paths[pathIndex] });
      }
      pathIndex = (pathIndex + 1) % paths.length;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  latencies.sort((left, right) => left - right);
  const summary = {
    host: baseUrl.host,
    duration_seconds: durationSeconds,
    concurrency,
    requests: requestCount,
    failures: failures.length,
    requests_per_second: Number((requestCount / durationSeconds).toFixed(2)),
    latency_ms: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    failure_samples: failures.slice(0, 10),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Falha no teste de carga somente leitura:', error.message);
  process.exitCode = 1;
});
