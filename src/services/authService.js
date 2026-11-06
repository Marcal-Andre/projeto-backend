const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const { User } = require('../models');
const { badRequest, requiredString } = require('../utils/validation');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_MAX_BYTES = 72;
const PASSWORD_ROUNDS = 12;
const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('hex'), PASSWORD_ROUNDS);

function normalizeEmail(value) {
  const email = requiredString(value, 'email', 255).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw badRequest('O campo email deve conter um endereço válido.');
  }

  return email;
}

function validatePassword(value) {
  if (
    typeof value !== 'string' ||
    value.length < 8 ||
    Buffer.byteLength(value, 'utf8') > BCRYPT_MAX_BYTES
  ) {
    throw badRequest('A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.');
  }

  return value;
}

function publicUser(user) {
  return {
    id: user.id,
    firstname: user.firstname,
    surname: user.surname,
    email: user.email,
  };
}

async function register(input) {
  const firstname = requiredString(input.firstname, 'firstname', 100);
  const surname = requiredString(input.surname, 'surname', 100);
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);

  if (input.confirmPassword !== password) {
    throw badRequest('A senha e a confirmação devem ser iguais.');
  }

  const hashedPassword = await bcrypt.hash(password, PASSWORD_ROUNDS);
  const user = await User.create({
    firstname,
    surname,
    email,
    password: hashedPassword,
    role: 'customer',
  });

  return publicUser(user);
}

async function login(input) {
  const email = normalizeEmail(input.email);
  if (typeof input.password !== 'string' || input.password.length === 0) {
    throw badRequest('O campo password é obrigatório.');
  }

  const user = await User.unscoped().findOne({ where: { email } });
  const passwordMatches = await bcrypt.compare(
    input.password,
    user ? user.password : await dummyPasswordHash,
  );

  if (!passwordMatches) {
    const error = new Error('Email ou senha inválidos.');
    error.status = 401;
    throw error;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.APP_KEY,
    { expiresIn: '1h', algorithm: 'HS256' },
  );

  return { token };
}

async function bootstrapAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = validatePassword(process.env.ADMIN_PASSWORD);
  let user = await User.unscoped().findOne({ where: { email } });

  if (!user) {
    const hashedPassword = await bcrypt.hash(password, PASSWORD_ROUNDS);
    [user] = await User.unscoped().findOrCreate({
      where: { email },
      defaults: {
        firstname: 'Administrador',
        surname: 'Inicial',
        email,
        password: hashedPassword,
        role: 'admin',
      },
    });
  }

  if (user.role !== 'admin') {
    await user.update({ role: 'admin' });
  }

  return publicUser(user);
}

module.exports = { register, login, publicUser, normalizeEmail, bootstrapAdmin };
