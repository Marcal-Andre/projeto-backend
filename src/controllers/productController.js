const { Op } = require('sequelize');
const {
  sequelize,
  Product,
  ProductImage,
  ProductOption,
  ProductCategory,
  Category,
} = require('../models');
const imageStorage = require('../services/imageStorage');
const {
  badRequest,
  requireObject,
  requiredString,
  optionalString,
  optionalBoolean,
  positiveId,
  parseIdList,
} = require('../utils/validation');

const PRODUCT_FIELDS = [
  'id',
  'enabled',
  'name',
  'slug',
  'use_in_menu',
  'stock',
  'description',
  'price',
  'price_with_discount',
  'category_ids',
  'images',
  'options',
  'created_at',
  'updated_at',
];
const MAX_IMAGES = 10;

function price(value, field) {
  const normalized = typeof value === 'number' ? String(value) : value;
  if (
    typeof normalized !== 'string' ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)
  ) {
    throw badRequest(`O campo ${field} deve ser um valor numérico não negativo.`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed > 99999999.99) {
    throw badRequest(`O campo ${field} excede o valor máximo permitido.`);
  }

  return `${normalized.split('.')[0]}.${(normalized.split('.')[1] || '').padEnd(2, '0')}`;
}

function nonNegativeInteger(value, field, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof parsed !== 'number' ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > 2147483647
  ) {
    throw badRequest(`O campo ${field} deve ser um inteiro não negativo.`);
  }

  return parsed;
}

function productInput(body, partial = false) {
  const input = requireObject(body);
  const output = {};
  const required = (field, callback) => {
    if (!partial || input[field] !== undefined) {
      output[field] = callback();
    }
  };

  required('enabled', () => optionalBoolean(input.enabled, 'enabled', false));
  required('name', () => requiredString(input.name, 'name', 150));
  required('slug', () => requiredString(input.slug, 'slug', 180));
  required('use_in_menu', () => optionalBoolean(input.use_in_menu, 'use_in_menu', false));
  required('stock', () => nonNegativeInteger(input.stock, 'stock', 0));
  required('description', () => {
    if (input.description === undefined || input.description === null) {
      return null;
    }
    return optionalString(input.description, 'description', 60000);
  });
  required('price', () => price(input.price, 'price'));
  required('price_with_discount', () => price(input.price_with_discount, 'price_with_discount'));

  if (
    output.price !== undefined &&
    output.price_with_discount !== undefined &&
    Number(output.price_with_discount) > Number(output.price)
  ) {
    throw badRequest('O preço com desconto não pode ser maior que o preço original.');
  }

  if (input.category_ids !== undefined) {
    if (!Array.isArray(input.category_ids)) {
      throw badRequest('O campo category_ids deve ser uma lista de IDs.');
    }
    output.category_ids = [...new Set(input.category_ids.map((id) => positiveId(id, 'category_ids')))];
  }

  if (input.images !== undefined) {
    if (!Array.isArray(input.images) || input.images.length > MAX_IMAGES) {
      throw badRequest(`O campo images deve ser uma lista com no máximo ${MAX_IMAGES} imagens.`);
    }
    output.images = input.images.map((image) => requireObject(image, 'Cada imagem'));
  }

  if (input.options !== undefined) {
    if (!Array.isArray(input.options) || input.options.length > 50) {
      throw badRequest('O campo options deve ser uma lista com no máximo 50 opções.');
    }
    output.options = input.options.map((option) => requireObject(option, 'Cada opção'));
  }

  return output;
}

function optionValues(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null;

  if (!values || values.length === 0 || values.length > 100) {
    throw badRequest('Os valores de cada opção devem ser uma lista não vazia.');
  }

  const normalized = values.map((item) => {
    if (typeof item !== 'string' || item.trim().length === 0 || item.includes(',')) {
      throw badRequest('Cada valor de opção deve ser um texto não vazio sem vírgulas.');
    }
    return item.trim();
  });
  const joined = normalized.join(',');
  if (joined.length > 1000) {
    throw badRequest('Os valores de opção excedem o limite permitido.');
  }

  return joined;
}

function optionRadius(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = typeof value === 'string' ? value.trim().replace(/px$/i, '') : value;
  return nonNegativeInteger(normalized, 'radius', defaultValue);
}

function optionAttributes(input, partial = false) {
  const attributes = {};
  const set = (field, callback) => {
    if (!partial || input[field] !== undefined) {
      attributes[field] = callback();
    }
  };

  set('title', () => requiredString(input.title, 'title', 100));
  set('shape', () => {
    const shape = input.shape === undefined ? 'square' : input.shape;
    if (!['square', 'circle'].includes(shape)) {
      throw badRequest('O campo shape deve ser square ou circle.');
    }
    return shape;
  });
  set('radius', () => optionRadius(input.radius, 0));
  set('type', () => {
    const type = input.type === undefined ? 'text' : input.type;
    if (!['text', 'color'].includes(type)) {
      throw badRequest('O campo type deve ser text ou color.');
    }
    return type;
  });

  const values = input.values === undefined ? input.value : input.values;
  if (!partial || values !== undefined) {
    attributes.values = optionValues(values);
  }

  return attributes;
}

function validateImageEntries(images, creating) {
  const seenIds = new Set();
  for (const image of images || []) {
    if (image.id !== undefined) {
      positiveId(image.id, 'images.id');
      if (seenIds.has(Number(image.id))) {
        throw badRequest('Uma imagem não pode aparecer mais de uma vez na mesma atualização.');
      }
      seenIds.add(Number(image.id));
      if (creating) {
        throw badRequest('Não é possível informar IDs de imagens ao criar um produto.');
      }
    }
    if (image.deleted !== undefined && typeof image.deleted !== 'boolean') {
      throw badRequest('O campo images.deleted deve ser booleano.');
    }
    if (image.deleted && image.content !== undefined) {
      throw badRequest('Uma imagem não pode ser removida e substituída ao mesmo tempo.');
    }
    if (image.deleted && !image.id) {
      throw badRequest('Apenas imagens existentes podem ser removidas.');
    }
    if (image.content !== undefined && typeof image.content !== 'string') {
      throw badRequest('O conteúdo da imagem deve ser um texto Base64 ou uma URL existente.');
    }
    if (!image.id || image.content !== undefined && !/^https?:\/\//i.test(image.content) && !image.content.startsWith('/media/')) {
      imageStorage.parseImage(image);
    }
  }
}

function validateOptionEntries(options, creating) {
  const seenIds = new Set();
  for (const option of options || []) {
    if (option.id !== undefined) {
      positiveId(option.id, 'options.id');
      if (seenIds.has(Number(option.id))) {
        throw badRequest('Uma opção não pode aparecer mais de uma vez na mesma atualização.');
      }
      seenIds.add(Number(option.id));
      if (creating) {
        throw badRequest('Não é possível informar IDs de opções ao criar um produto.');
      }
      if (option.deleted !== undefined && typeof option.deleted !== 'boolean') {
        throw badRequest('O campo options.deleted deve ser booleano.');
      }
      if (option.deleted && Object.keys(option).some((key) => !['id', 'deleted'].includes(key))) {
        throw badRequest('Uma opção não pode ser removida e atualizada ao mesmo tempo.');
      }
      if (!option.deleted) {
        optionAttributes(option, true);
      }
    } else {
      if (option.deleted !== undefined) {
        throw badRequest('Apenas opções existentes podem ser removidas.');
      }
      optionAttributes(option);
    }
  }
}

function fieldsFor(value) {
  if (value === undefined) {
    return new Set(PRODUCT_FIELDS);
  }
  if (typeof value !== 'string') {
    throw badRequest('O parâmetro fields deve ser uma lista de campos separados por vírgula.');
  }
  const requested = value.split(',').map((field) => field.trim());
  if (requested.some((field) => !PRODUCT_FIELDS.includes(field))) {
    throw badRequest('O filtro fields contém campos inválidos.');
  }
  return new Set(requested);
}

function productResponse(product, fields) {
  const result = {};
  const values = product.get({ plain: true });

  for (const field of fields) {
    if (field === 'price' || field === 'price_with_discount') {
      result[field] = Number(values[field]);
    } else if (field === 'category_ids') {
      result.category_ids = (values.categories || []).map((category) => category.id);
    } else if (field === 'images') {
      result.images = (values.images || []).map((image) => ({
        id: image.id,
        content: `/media/${image.path.replace(/\\/g, '/')}`,
        enabled: image.enabled,
      }));
    } else if (field === 'options') {
      result.options = (values.options || []).map((option) => ({
        id: option.id,
        title: option.title,
        shape: option.shape,
        radius: option.radius,
        type: option.type,
        values: option.values.split(','),
      }));
    } else {
      result[field] = values[field];
    }
  }

  return result;
}

function productIncludes() {
  return [
    { model: ProductImage, as: 'images', attributes: ['id', 'path', 'enabled'] },
    { model: ProductOption, as: 'options' },
    { model: Category, as: 'categories', through: { attributes: [] }, attributes: ['id'] },
  ];
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

function optionFilters(query) {
  const filters = [];
  if (query.option !== undefined) {
    if (!query.option || typeof query.option !== 'object' || Array.isArray(query.option)) {
      throw badRequest('O parâmetro option deve mapear IDs de opções para valores.');
    }
    filters.push(...Object.entries(query.option));
  }
  for (const [key, value] of Object.entries(query)) {
    const match = key.match(/^option\[(\d+)\]$/);
    if (match) {
      filters.push([match[1], value]);
    }
  }
  if (filters.length > 10) {
    throw badRequest('É possível filtrar por no máximo 10 opções.');
  }
  return filters.map(([id, value]) => {
    positiveId(id, 'option');
    if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
      throw badRequest('Cada filtro de opção deve conter valores separados por vírgula.');
    }
    return {
      id: Number(id),
      values: new Set(value.split(',').map((item) => item.trim()).filter(Boolean)),
    };
  });
}

async function filteredProductIds(categoryIds, filters) {
  let productIds;

  if (categoryIds) {
    const links = await ProductCategory.findAll({
      where: { category_id: { [Op.in]: categoryIds } },
      attributes: ['product_id'],
    });
    productIds = new Set(links.map((link) => link.product_id));
  }

  for (const filter of filters) {
    const options = await ProductOption.findAll({
      where: { id: filter.id },
      attributes: ['product_id', 'values'],
    });
    const matchingIds = new Set(
      options
        .filter((option) => option.values.split(',').some((value) => filter.values.has(value.trim())))
        .map((option) => option.product_id),
    );
    productIds = productIds === undefined
      ? matchingIds
      : new Set([...productIds].filter((id) => matchingIds.has(id)));
  }

  return productIds;
}

async function search(req, res) {
  const { limit, page } = pagination(req.query);
  const fields = fieldsFor(req.query.fields);
  const where = { enabled: true };

  if (req.query.match !== undefined) {
    const match = requiredString(req.query.match, 'match', 100);
    const escaped = match.replace(/[\\%_]/g, '\\$&');
    where[Op.or] = [
      { name: { [Op.like]: `%${escaped}%` } },
      { description: { [Op.like]: `%${escaped}%` } },
    ];
  }

  if (req.query['price-range'] !== undefined) {
    const range = req.query['price-range'];
    const match = typeof range === 'string'
      ? range.match(/^(\d+(?:\.\d{1,2})?)-(\d+(?:\.\d{1,2})?)$/)
      : null;
    if (!match || Number(match[1]) > Number(match[2])) {
      throw badRequest('O parâmetro price-range deve seguir o formato mínimo-máximo.');
    }
    where.price = { [Op.between]: [match[1], match[2]] };
  }

  let categoryIds;
  if (req.query.category_ids !== undefined) {
    categoryIds = parseIdList(req.query.category_ids, 'category_ids');
  }
  const matchingIds = await filteredProductIds(categoryIds, optionFilters(req.query));
  if (matchingIds && matchingIds.size === 0) {
    return res.json({ data: [], total: 0, limit, page });
  }
  if (matchingIds) {
    where.id = { [Op.in]: [...matchingIds] };
  }

  const result = await Product.findAndCountAll({
    where,
    include: productIncludes(),
    distinct: true,
    order: [['id', 'ASC']],
    ...(limit === -1 ? {} : { limit, offset: (page - 1) * limit }),
  });

  return res.json({
    data: result.rows.map((product) => productResponse(product, fields)),
    total: result.count,
    limit,
    page,
  });
}

async function getById(req, res) {
  const product = await Product.findOne({
    where: { id: positiveId(req.params.id), enabled: true },
    include: productIncludes(),
  });
  if (!product) {
    return res.status(404).json({ error: { message: 'Produto não encontrado.' } });
  }

  return res.json(productResponse(product, fieldsFor(undefined)));
}

async function validateCategories(categoryIds, transaction) {
  if (categoryIds === undefined) {
    return;
  }
  const count = await Category.count({
    where: { id: { [Op.in]: categoryIds } },
    transaction,
  });
  if (count !== categoryIds.length) {
    throw badRequest('Uma ou mais categorias informadas não existem.');
  }
}

async function create(req, res) {
  const input = productInput(req.body);
  validateImageEntries(input.images, true);
  validateOptionEntries(input.options, true);
  const stagedImages = await imageStorage.stageImages(input.images || []);

  try {
    const product = await sequelize.transaction(async (transaction) => {
      await validateCategories(input.category_ids || [], transaction);
      const { category_ids: categoryIds, images, options, ...attributes } = input;
      const created = await Product.create(attributes, { transaction });
      if (categoryIds) {
        await created.setCategories(categoryIds, { transaction });
      }
      if (stagedImages.length > 0) {
        await ProductImage.bulkCreate(
          stagedImages.map((image) => ({ product_id: created.id, path: image.path })),
          { transaction },
        );
      }
      if (options) {
        await ProductOption.bulkCreate(
          options.map((option) => ({
            product_id: created.id,
            ...optionAttributes(option),
          })),
          { transaction },
        );
      }
      return created;
    });

    return res.status(201).json({ id: product.id });
  } catch (error) {
    await imageStorage.removeFiles(stagedImages.map((image) => image.path));
    throw error;
  }
}

async function updateImages(productId, images, currentImages, transaction, stagedImages, removedPaths) {
  if (images === undefined) {
    return;
  }

  const currentById = new Map(currentImages.map((image) => [image.id, image]));
  let stagedIndex = 0;
  for (const image of images) {
    if (!image.id) {
      const staged = stagedImages[stagedIndex++];
      await ProductImage.create({ product_id: productId, path: staged.path }, { transaction });
      continue;
    }

    const existing = currentById.get(Number(image.id));
    if (!existing) {
      throw badRequest('A imagem informada não pertence a este produto.');
    }
    if (image.deleted) {
      await existing.destroy({ transaction });
      removedPaths.push(existing.path);
      continue;
    }

    if (
      image.content !== undefined &&
      !/^https?:\/\//i.test(image.content) &&
      !image.content.startsWith('/media/')
    ) {
      const staged = stagedImages[stagedIndex++];
      await existing.update({ path: staged.path }, { transaction });
      removedPaths.push(currentById.get(Number(image.id)).path);
    }
  }
}

async function updateOptions(productId, options, currentOptions, transaction) {
  if (options === undefined) {
    return;
  }

  const currentById = new Map(currentOptions.map((option) => [option.id, option]));
  for (const option of options) {
    if (!option.id) {
      await ProductOption.create({
        product_id: productId,
        ...optionAttributes(option),
      }, { transaction });
      continue;
    }

    const existing = currentById.get(Number(option.id));
    if (!existing) {
      throw badRequest('A opção informada não pertence a este produto.');
    }
    if (option.deleted) {
      await existing.destroy({ transaction });
      continue;
    }

    await existing.update(optionAttributes(option, true), { transaction });
  }
}

async function update(req, res) {
  const id = positiveId(req.params.id);
  const input = productInput(req.body, true);
  validateImageEntries(input.images, false);
  validateOptionEntries(input.options, false);

  const stagedImages = await imageStorage.stageImages(
    (input.images || []).filter((image) => (
      !image.id ||
      image.content !== undefined &&
      !/^https?:\/\//i.test(image.content) &&
      !image.content.startsWith('/media/')
    )),
  );
  const removedPaths = [];

  try {
    await sequelize.transaction(async (transaction) => {
      const product = await Product.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) {
        const error = new Error('Produto não encontrado.');
        error.status = 404;
        throw error;
      }

      const currentImages = input.images === undefined
        ? []
        : await ProductImage.findAll({ where: { product_id: id }, transaction });
      const currentOptions = input.options === undefined
        ? []
        : await ProductOption.findAll({ where: { product_id: id }, transaction });

      await validateCategories(input.category_ids, transaction);
      const { category_ids: categoryIds, images, options, ...attributes } = input;
      if (Object.keys(attributes).length > 0) {
        await product.update(attributes, { transaction });
      }
      if (categoryIds !== undefined) {
        await product.setCategories(categoryIds, { transaction });
      }
      await updateImages(id, images, currentImages, transaction, stagedImages, removedPaths);
      await updateOptions(id, options, currentOptions, transaction);
    });

    await imageStorage.removeFiles(removedPaths);
    return res.status(204).end();
  } catch (error) {
    await imageStorage.removeFiles(stagedImages.map((image) => image.path));
    throw error;
  }
}

async function remove(req, res) {
  const id = positiveId(req.params.id);
  const paths = await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) {
      return null;
    }

    const images = await ProductImage.findAll({
      where: { product_id: id },
      attributes: ['path'],
      transaction,
    });
    await product.destroy({ transaction });
    return images.map((image) => image.path);
  });

  if (paths === null) {
    return res.status(404).json({ error: { message: 'Produto não encontrado.' } });
  }

  await imageStorage.removeFiles(paths);
  return res.status(204).end();
}

module.exports = { search, getById, create, update, remove };
