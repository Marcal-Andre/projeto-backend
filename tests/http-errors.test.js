const http = require('node:http');
const app = require('../src/app');
const errorHandler = require('../src/middleware/errorHandler');

describe('respostas de erro HTTP', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = http.createServer(app);

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('responde 404 para uma rota inexistente', async () => {
    const response = await fetch(`${baseUrl}/rota-inexistente`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'Rota não encontrada: GET /rota-inexistente',
      },
    });
  });

  it('responde ao health check sem expor a tecnologia do servidor', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-powered-by')).toBeNull();
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('não expõe a rota de token de demonstração por padrão', async () => {
    const response = await fetch(`${baseUrl}/token`);

    expect(response.status).toBe(404);
  });

  it('responde 400 quando o corpo JSON é inválido', async () => {
    const response = await fetch(`${baseUrl}/rota-inexistente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.any(String),
      },
    });
  });

  it('rejeita corpos JSON acima do limite configurado', async () => {
    const response = await fetch(`${baseUrl}/rota-inexistente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: 'a'.repeat(13 * 1024 * 1024) }),
    });

    expect(response.status).toBe(413);
  });

  it('protege operações de escrita do catálogo contra ausência de token', async () => {
    const [categoryResponse, productResponse] = await Promise.all([
      fetch(`${baseUrl}/v1/category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Calçados', slug: 'calcados' }),
      }),
      fetch(`${baseUrl}/v1/product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Tênis', slug: 'tenis' }),
      }),
    ]);

    expect(categoryResponse.status).toBe(401);
    expect(productResponse.status).toBe(401);
  });

  it('não expõe detalhes internos em erros 500', () => {
    const response = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const logError = jest.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(new Error('detalhe interno'), {}, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        message: 'Erro interno do servidor.',
      },
    });
    expect(logError).toHaveBeenCalled();

    logError.mockRestore();
  });
});
