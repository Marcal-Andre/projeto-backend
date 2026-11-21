jest.mock('../src/models', () => ({
  sequelize: {
    transaction: jest.fn(async (callback) => callback({})),
  },
  User: {
    create: jest.fn(),
    unscoped: jest.fn(),
  },
  UserAddress: {
    create: jest.fn(),
  },
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, UserAddress } = require('../src/models');
const authService = require('../src/services/authService');

describe('serviço de autenticação', () => {
  const secret = 'test-secret-with-at-least-32-bytes-long';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_KEY = secret;
  });

  it('cadastra usuário com email normalizado e senha em hash', async () => {
    let attributes;
    User.create.mockImplementation(async (values) => {
      attributes = values;
      return { id: 8, ...values };
    });

    await expect(authService.register({
      firstname: 'Ana',
      surname: 'Silva',
      email: 'ANA@EXAMPLE.COM',
      password: 'strong-pass-123',
      confirmPassword: 'strong-pass-123',
      role: 'admin',
      address: {
        postal_code: '12345-678',
        street: 'Rua das Flores',
        number: '10',
        complement: '',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'sp',
      },
    })).resolves.toEqual({
      id: 8,
      firstname: 'Ana',
      surname: 'Silva',
      email: 'ana@example.com',
    });

    expect(attributes.role).toBe('customer');
    expect(attributes.password).not.toBe('strong-pass-123');
    await expect(bcrypt.compare('strong-pass-123', attributes.password)).resolves.toBe(true);
    expect(UserAddress.create).toHaveBeenCalledWith({
      user_id: 8,
      postal_code: '12345678',
      street: 'Rua das Flores',
      number: '10',
      complement: '',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    }, { transaction: expect.any(Object) });
  });

  it('rejeita senhas curtas ou confirmação divergente', async () => {
    const input = {
      firstname: 'Ana',
      surname: 'Silva',
      email: 'ana@example.com',
      password: 'short',
      confirmPassword: 'short',
    };

    await expect(authService.register(input)).rejects.toMatchObject({ status: 400 });
    expect(User.create).not.toHaveBeenCalled();
  });

  it('emite JWT com identidade e perfil após validar a senha', async () => {
    const passwordHash = await bcrypt.hash('strong-pass-123', 4);
    const user = {
      id: 9,
      firstname: 'Admin',
      surname: 'User',
      email: 'admin@example.com',
      password: passwordHash,
      role: 'admin',
    };
    User.unscoped.mockReturnValue({
      findOne: jest.fn().mockResolvedValue(user),
    });

    const result = await authService.login({
      email: user.email,
      password: 'strong-pass-123',
    });
    const payload = jwt.verify(result.token, secret, { algorithms: ['HS256'] });

    expect(payload).toMatchObject({ id: 9, email: user.email, role: 'admin' });
    expect(result.user).toEqual({
      id: 9,
      firstname: 'Admin',
      surname: 'User',
      email: user.email,
    });
  });

  it('não revela se o email existe quando a senha está errada', async () => {
    User.unscoped.mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
    });

    await expect(authService.login({
      email: 'missing@example.com',
      password: 'wrong-password',
    })).rejects.toMatchObject({ status: 401, message: 'Email ou senha inválidos.' });
  });
});
