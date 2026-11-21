const { User, UserAddress } = require('../models');
const authService = require('../services/authService');
const {
  requireObject,
  requiredString,
  positiveId,
} = require('../utils/validation');

async function getById(req, res) {
  const id = positiveId(req.params.id);
  if (req.user.id !== id && req.user.role !== 'admin') {
    return res.status(403).json({ error: { message: 'Você só pode consultar sua própria conta.' } });
  }

  const user = await User.findByPk(id);

  if (!user) {
    return res.status(404).json({ error: { message: 'Usuário não encontrado.' } });
  }

  return res.json(authService.publicUser(user));
}

async function create(req, res) {
  const input = requireObject(req.body);
  const user = await authService.register(input);
  return res.status(201).json(user);
}

async function update(req, res) {
  const id = positiveId(req.params.id);
  if (req.user.id !== id) {
    return res.status(403).json({ error: { message: 'Você só pode atualizar sua própria conta.' } });
  }
  const input = requireObject(req.body);
  const firstname = requiredString(input.firstname, 'firstname', 100);
  const surname = requiredString(input.surname, 'surname', 100);
  const email = authService.normalizeEmail(input.email);

  const user = await User.findByPk(id);
  if (!user) {
    return res.status(404).json({ error: { message: 'Usuário não encontrado.' } });
  }

  await user.update({ firstname, surname, email });
  return res.status(204).end();
}

async function getAddress(req, res) {
  const id = positiveId(req.params.id);
  if (req.user.id !== id) {
    return res.status(403).json({ error: { message: 'Você só pode consultar seu próprio endereço.' } });
  }

  const address = await UserAddress.findOne({ where: { user_id: id } });
  if (!address) {
    return res.status(404).json({ error: { message: 'Endereço não encontrado.' } });
  }

  const {
    postal_code,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
  } = address.get({ plain: true });
  return res.json({ postal_code, street, number, complement, neighborhood, city, state });
}

async function saveAddress(req, res) {
  const id = positiveId(req.params.id);
  if (req.user.id !== id) {
    return res.status(403).json({ error: { message: 'Você só pode atualizar seu próprio endereço.' } });
  }

  const input = requireObject(req.body);
  const address = authService.validateAddress(input);
  const [record] = await UserAddress.findOrCreate({
    where: { user_id: id },
    defaults: { user_id: id, ...address },
  });
  await record.update(address);

  return res.json(address);
}

async function remove(req, res) {
  const id = positiveId(req.params.id);
  if (req.user.id !== id) {
    return res.status(403).json({ error: { message: 'Você só pode excluir sua própria conta.' } });
  }
  const deleted = await User.destroy({ where: { id } });

  if (!deleted) {
    return res.status(404).json({ error: { message: 'Usuário não encontrado.' } });
  }

  return res.status(204).end();
}

async function login(req, res) {
  const input = requireObject(req.body);
  return res.json(await authService.login(input));
}

module.exports = { getById, create, update, getAddress, saveAddress, remove, login };
