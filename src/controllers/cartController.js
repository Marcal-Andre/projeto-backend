const { createHash } = require('node:crypto');
const {
  sequelize,
  Cart,
  CartItem,
  Product,
  ProductImage,
  ProductOption,
} = require('../models');
const { badRequest, positiveId, requireObject } = require('../utils/validation');

function parseQuantity(value) {
  const quantity = value === undefined ? 1 : value;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw badRequest('A quantidade deve ser um inteiro positivo.');
  }
  return quantity;
}

function parseSelectedOptions(value, product) {
  const input = value === undefined ? {} : requireObject(value, 'options');
  const options = {};

  for (const productOption of product.options || []) {
    const key = String(productOption.id);
    const selected = input[key];
    if (typeof selected !== 'string' || !productOption.values.split(',').map((item) => item.trim()).includes(selected)) {
      throw badRequest(`Selecione uma opção válida para ${productOption.title}.`);
    }
    options[key] = selected;
  }

  if (Object.keys(input).some((key) => !Object.hasOwn(options, key))) {
    throw badRequest('Uma ou mais opções selecionadas não pertencem ao produto.');
  }

  return Object.fromEntries(Object.entries(options).sort(([left], [right]) => left.localeCompare(right)));
}

function optionsKey(options) {
  return createHash('sha256').update(JSON.stringify(options)).digest('hex');
}

async function findOrCreateCart(userId, transaction) {
  const [cart] = await Cart.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId },
    transaction,
  });
  return cart;
}

function serializeCart(cart) {
  return {
    items: cart.items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      options: JSON.parse(item.selected_options),
      product: {
        id: item.product.id,
        name: item.product.name,
        price: Number(item.product.price),
        price_with_discount: Number(item.product.price_with_discount),
        stock: item.product.stock,
        images: item.product.images.map((image) => ({
          content: `/media/${image.path.replace(/\\/g, '/')}`,
          enabled: image.enabled,
        })),
      },
    })),
  };
}

async function getCartRecord(userId, transaction) {
  const cart = await findOrCreateCart(userId, transaction);
  return Cart.findByPk(cart.id, {
    include: [{
      model: CartItem,
      as: 'items',
      include: [{
        model: Product,
        as: 'product',
        include: [{ model: ProductImage, as: 'images' }],
      }],
    }],
    transaction,
  });
}

async function getCart(req, res) {
  const cart = await getCartRecord(req.user.id);
  return res.json(serializeCart(cart));
}

async function addItem(req, res) {
  const input = requireObject(req.body);
  const productId = positiveId(input.product_id, 'product_id');
  const quantity = parseQuantity(input.quantity);
  const product = await Product.findByPk(productId, {
    include: [{ model: ProductOption, as: 'options' }],
  });

  if (!product || !product.enabled) {
    return res.status(404).json({ error: { message: 'Produto não encontrado ou indisponível.' } });
  }

  const options = parseSelectedOptions(input.options, product);
  if (quantity > product.stock) {
    throw badRequest('A quantidade solicitada excede o estoque disponível.');
  }

  const selectedOptions = JSON.stringify(options);
  const key = optionsKey(options);

  await sequelize.transaction(async (transaction) => {
    const cart = await findOrCreateCart(req.user.id, transaction);
    const item = await CartItem.findOne({
      where: { cart_id: cart.id, product_id: product.id, options_key: key },
      transaction,
      ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    if (item) {
      const nextQuantity = item.quantity + quantity;
      if (nextQuantity > product.stock) {
        throw badRequest('A quantidade total solicitada excede o estoque disponível.');
      }
      await item.update({ quantity: nextQuantity }, { transaction });
    } else {
      await CartItem.create({
        cart_id: cart.id,
        product_id: product.id,
        quantity,
        selected_options: selectedOptions,
        options_key: key,
      }, { transaction });
    }
  });

  const cart = await getCartRecord(req.user.id);
  return res.status(201).json(serializeCart(cart));
}

async function updateItem(req, res) {
  const itemId = positiveId(req.params.itemId, 'itemId');
  const input = requireObject(req.body);
  const quantity = parseQuantity(input.quantity);
  const cart = await Cart.findOne({ where: { user_id: req.user.id } });
  if (!cart) {
    return res.status(404).json({ error: { message: 'Item não encontrado no carrinho.' } });
  }

  const item = await CartItem.findOne({
    where: { id: itemId, cart_id: cart.id },
    include: [{ model: Product, as: 'product' }],
  });
  if (!item) {
    return res.status(404).json({ error: { message: 'Item não encontrado no carrinho.' } });
  }
  if (quantity > item.product.stock) {
    throw badRequest('A quantidade solicitada excede o estoque disponível.');
  }

  await item.update({ quantity });
  return res.json(serializeCart(await getCartRecord(req.user.id)));
}

async function removeItem(req, res) {
  const itemId = positiveId(req.params.itemId, 'itemId');
  const cart = await Cart.findOne({ where: { user_id: req.user.id } });
  if (!cart) {
    return res.status(404).json({ error: { message: 'Item não encontrado no carrinho.' } });
  }

  const item = await CartItem.findOne({ where: { id: itemId, cart_id: cart.id } });
  if (!item) {
    return res.status(404).json({ error: { message: 'Item não encontrado no carrinho.' } });
  }

  await item.destroy();
  return res.json(serializeCart(await getCartRecord(req.user.id)));
}

module.exports = { getCart, addItem, updateItem, removeItem };
