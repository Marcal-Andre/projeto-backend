jest.mock('../src/models', () => ({
  User: { findByPk: jest.fn() },
}));

const jwt = require('jsonwebtoken');
const { User } = require('../src/models');
const authenticate = require('../src/middleware/authenticate');
const requireAdmin = require('../src/middleware/requireAdmin');

describe('autorização JWT', () => {
  const secret = 'test-secret-with-at-least-32-bytes-long';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_KEY = secret;
  });

  it('rejeita token ausente', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    authenticate({ get: () => undefined }, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('bloqueia cliente autenticado de gerenciar o catálogo', async () => {
    const token = jwt.sign({ id: 3, role: 'customer' }, secret, { algorithm: 'HS256' });
    const req = { get: () => `Bearer ${token}` };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    User.findByPk.mockResolvedValue({ id: 3, role: 'customer' });
    await authenticate(req, res, next);
    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).toHaveBeenCalledTimes(1);
    expect(User.findByPk).toHaveBeenCalledWith(3);
  });

  it('usa o perfil atual do banco mesmo se o papel do token estiver desatualizado', async () => {
    const token = jwt.sign({ id: 4, role: 'customer' }, secret, { algorithm: 'HS256' });
    const req = { get: () => `Bearer ${token}` };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    User.findByPk.mockResolvedValue({ id: 4, role: 'admin' });
    await authenticate(req, res, next);
    await requireAdmin(req, res, next);

    expect(req.user).toEqual({ id: 4, role: 'admin' });
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalled();
    expect(User.findByPk).toHaveBeenCalledWith(4);
  });

  it('revoga o acesso quando o usuário do token não existe mais no banco', async () => {
    const token = jwt.sign({ id: 5, role: 'admin' }, secret, { algorithm: 'HS256' });
    const req = { get: () => `Bearer ${token}` };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    User.findByPk.mockResolvedValue(null);
    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('propaga erros de banco para o middleware de erros', async () => {
    const token = jwt.sign({ id: 6, role: 'customer' }, secret, { algorithm: 'HS256' });
    const req = { get: () => `Bearer ${token}` };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const error = new Error('database unavailable');

    User.findByPk.mockRejectedValue(error);
    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});
