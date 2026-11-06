const { Category } = require('../models');
const {
  badRequest,
  requireObject,
  requiredString,
  optionalBoolean,
  positiveId,
} = require('../utils/validation');

const CATEGORY_FIELDS = ['id', 'name', 'slug', 'use_in_menu', 'created_at', 'updated_at'];

function categoryFields(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw badRequest('O parâmetro fields deve ser uma lista de campos separados por vírgula.');
  }
  const fields = value.split(',').map((field) => field.trim());
  if (fields.length === 0 || fields.some((field) => !CATEGORY_FIELDS.includes(field))) {
    throw badRequest('O filtro fields contém campos inválidos.');
  }

  return [...new Set(fields)];
}

function pagination(query) {
  const limit = query.limit === undefined ? 12 : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);

  if (!Number.isInteger(limit) || (limit !== -1 && (limit < 1 || limit > 100))) {
    throw badRequest('O parâmetro limit deve ser -1 ou um inteiro entre 1 e 100.');
  }
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('O parâmetro page deve ser um inteiro positivo.');
  }

  return { limit, page };
}

function categoryInput(body) {
  const input = requireObject(body);
  return {
    name: requiredString(input.name, 'name', 100),
    slug: requiredString(input.slug, 'slug', 120),
    use_in_menu: optionalBoolean(input.use_in_menu, 'use_in_menu', false),
  };
}

async function search(req, res) {
  const { limit, page } = pagination(req.query);
  const attributes = categoryFields(req.query.fields);
  const where = {};

  if (req.query.use_in_menu !== undefined) {
    if (!['true', 'false'].includes(req.query.use_in_menu)) {
      throw badRequest('O parâmetro use_in_menu deve ser true ou false.');
    }
    where.use_in_menu = req.query.use_in_menu === 'true';
  }

  const result = await Category.findAndCountAll({
    where,
    attributes,
    order: [['id', 'ASC']],
    ...(limit === -1 ? {} : { limit, offset: (page - 1) * limit }),
  });

  return res.json({
    data: result.rows,
    total: result.count,
    limit,
    page,
  });
}

async function getById(req, res) {
  const category = await Category.findByPk(positiveId(req.params.id));
  if (!category) {
    return res.status(404).json({ error: { message: 'Categoria não encontrada.' } });
  }

  return res.json(category);
}

async function create(req, res) {
  const category = await Category.create(categoryInput(req.body));
  return res.status(201).json(category);
}

async function update(req, res) {
  const id = positiveId(req.params.id);
  const category = await Category.findByPk(id);
  if (!category) {
    return res.status(404).json({ error: { message: 'Categoria não encontrada.' } });
  }

  await category.update(categoryInput(req.body));
  return res.status(204).end();
}

async function remove(req, res) {
  const deleted = await Category.destroy({ where: { id: positiveId(req.params.id) } });
  if (!deleted) {
    return res.status(404).json({ error: { message: 'Categoria não encontrada.' } });
  }

  return res.status(204).end();
}

module.exports = { search, getById, create, update, remove };
