const databasePassword = require('../src/config/databasePassword');

describe('configuração de senha do banco', () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalHost = process.env.DB_HOST;
  const originalPassword = process.env.DB_PASSWORD;

  afterEach(() => {
    if (originalEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnvironment;
    }

    if (originalHost === undefined) {
      delete process.env.DB_HOST;
    } else {
      process.env.DB_HOST = originalHost;
    }

    if (originalPassword === undefined) {
      delete process.env.DB_PASSWORD;
    } else {
      process.env.DB_PASSWORD = originalPassword;
    }
  });

  it('permite senha vazia apenas em desenvolvimento com host local', () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_HOST = '127.0.0.1';
    delete process.env.DB_PASSWORD;

    expect(databasePassword()).toBe('');
  });

  it.each([
    ['production', '127.0.0.1'],
    ['development', 'db.example.com'],
  ])('exige senha para %s em %s', (environment, host) => {
    process.env.NODE_ENV = environment;
    process.env.DB_HOST = host;
    delete process.env.DB_PASSWORD;

    expect(() => databasePassword()).toThrow('DB_PASSWORD é obrigatória');
  });

  it('usa a senha configurada independentemente do ambiente', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_HOST = 'db.example.com';
    process.env.DB_PASSWORD = 'configured-password';

    expect(databasePassword()).toBe('configured-password');
  });
});
