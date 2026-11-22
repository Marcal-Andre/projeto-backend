const {
  sequelize,
  Cart,
  CartItem,
  Order,
  OrderItem,
  OrderStatusHistory,
  Product,
  ProductOption,
  User,
  UserAddress,
} = require('../models');
const { badRequest, positiveId } = require('../utils/validation');
const mercadoPago = require('../services/mercadoPago');
const { releaseOrderStock } = require('../services/inventory');
const { recordOrderStatusChange } = require('../services/orderStatusHistory');
const { fromCents, toCents } = require('../utils/money');

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function validateSelectedOptions(cartItem, product) {
  const selected = JSON.parse(cartItem.selected_options);
  const productOptions = product.options || [];
  const validated = {};

  for (const option of productOptions) {
    const key = String(option.id);
    const value = selected[key];
    const validValues = option.values.split(',').map((item) => item.trim());
    if (typeof value !== 'string' || !validValues.includes(value)) {
      throw conflict(`As opções do produto ${product.name} mudaram; atualize o carrinho.`);
    }
    validated[key] = value;
  }

  if (Object.keys(selected).some((key) => !Object.hasOwn(validated, key))) {
    throw conflict(`As opções do produto ${product.name} mudaram; atualize o carrinho.`);
  }

  return validated;
}

function serializeOrder(order) {
  const values = order.get({ plain: true });
  return {
    id: values.id,
    status: values.status,
    fulfillment_status: values.fulfillment_status,
    total: Number(values.total),
    expires_at: values.expires_at,
    payment_status: values.mercadopago_payment_status,
    delivery_address: {
      postal_code: values.postal_code,
      street: values.street,
      number: values.number,
      complement: values.complement,
      neighborhood: values.neighborhood,
      city: values.city,
      state: values.state,
    },
    created_at: values.created_at,
    fulfillment_history: (values.statusHistory || [])
      .filter((entry) => entry.scope === 'fulfillment')
      .map((entry) => ({
        status: entry.to_status,
        created_at: entry.created_at,
      })),
    items: (values.items || []).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      options: JSON.parse(item.selected_options),
    })),
  };
}

function orderIncludes() {
  return [
    { model: OrderItem, as: 'items', separate: true, order: [['id', 'ASC']] },
    {
      model: OrderStatusHistory,
      as: 'statusHistory',
      separate: true,
      order: [['created_at', 'ASC'], ['id', 'ASC']],
    },
  ];
}

async function create(req, res) {
  const idempotencyKey = req.get('idempotency-key');
  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== 'string' || !/^[\x21-\x7E]{1,128}$/.test(idempotencyKey))
  ) {
    throw badRequest('O cabeçalho Idempotency-Key deve conter de 1 a 128 caracteres ASCII sem espaços.');
  }

  if (idempotencyKey) {
    const existing = await Order.findOne({
      where: { user_id: req.user.id, idempotency_key: idempotencyKey },
      include: orderIncludes(),
    });
    if (existing) {
      return res.status(200).json(serializeOrder(existing));
    }
  }

  let order;
  try {
    order = await sequelize.transaction(async (transaction) => {
      const address = await UserAddress.findOne({
        where: { user_id: req.user.id },
        transaction,
      });
      if (!address) {
        throw badRequest('Cadastre um endereço antes de finalizar a compra.');
      }

      const cart = await Cart.findOne({
        where: { user_id: req.user.id },
        transaction,
        ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
      });
      if (!cart) {
        throw badRequest('O carrinho está vazio.');
      }

      const cartItems = await CartItem.findAll({
        where: { cart_id: cart.id },
        order: [['id', 'ASC']],
        transaction,
      });
      if (cartItems.length === 0) {
        throw badRequest('O carrinho está vazio.');
      }

      const quantitiesByProduct = new Map();
      for (const item of cartItems) {
        quantitiesByProduct.set(
          item.product_id,
          (quantitiesByProduct.get(item.product_id) || 0) + item.quantity,
        );
      }

      const products = new Map();
      for (const productId of [...quantitiesByProduct.keys()].sort((left, right) => left - right)) {
        const product = await Product.findByPk(productId, {
          include: [{ model: ProductOption, as: 'options' }],
          transaction,
          ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
        });
        if (!product || !product.enabled) {
          throw conflict('Um ou mais produtos do carrinho não estão mais disponíveis.');
        }

        const quantity = quantitiesByProduct.get(productId);
        if (quantity > product.stock) {
          throw conflict(`Estoque insuficiente para o produto ${product.name}.`);
        }
        products.set(productId, product);
      }

      const lines = cartItems.map((item) => {
        const product = products.get(item.product_id);
        return {
          product,
          quantity: item.quantity,
          selectedOptions: validateSelectedOptions(item, product),
          unitPriceCents: toCents(product.price_with_discount),
        };
      });
      const totalCents = lines.reduce(
        (total, line) => total + line.unitPriceCents * line.quantity,
        0,
      );
      if (!Number.isSafeInteger(totalCents) || totalCents > 9999999999) {
        throw badRequest('O total do pedido excede o valor máximo permitido.');
      }

      const createdOrder = await Order.create({
        user_id: req.user.id,
        status: 'pending',
        fulfillment_status: 'unfulfilled',
        idempotency_key: idempotencyKey || null,
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        total: fromCents(totalCents),
        postal_code: address.postal_code,
        street: address.street,
        number: address.number,
        complement: address.complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
      }, { transaction });

      await OrderItem.bulkCreate(lines.map((line) => ({
        order_id: createdOrder.id,
        product_id: line.product.id,
        product_name: line.product.name,
        quantity: line.quantity,
        unit_price: fromCents(line.unitPriceCents),
        selected_options: JSON.stringify(line.selectedOptions),
      })), { transaction });

      await recordOrderStatusChange({
        order: createdOrder,
        scope: 'fulfillment',
        fromStatus: null,
        toStatus: 'unfulfilled',
        transaction,
      });

      for (const [productId, quantity] of quantitiesByProduct) {
        await products.get(productId).decrement('stock', { by: quantity, transaction });
      }

      await CartItem.destroy({ where: { cart_id: cart.id }, transaction });

      return Order.findByPk(createdOrder.id, {
        include: orderIncludes(),
        transaction,
      });
    });
  } catch (error) {
    if (idempotencyKey && error.name === 'SequelizeUniqueConstraintError') {
      const existing = await Order.findOne({
        where: { user_id: req.user.id, idempotency_key: idempotencyKey },
        include: orderIncludes(),
      });
      if (existing) {
        return res.status(200).json(serializeOrder(existing));
      }
    }
    throw error;
  }

  return res.status(201).json(serializeOrder(order));
}

async function list(req, res) {
  const limit = req.query.limit === undefined ? 12 : Number(req.query.limit);
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw badRequest('O parâmetro limit deve ser um inteiro entre 1 e 100.');
  }
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('O parâmetro page deve ser um inteiro positivo.');
  }

  const result = await Order.findAndCountAll({
    where: { user_id: req.user.id },
    include: orderIncludes(),
    distinct: true,
    order: [['id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return res.json({
    data: result.rows.map(serializeOrder),
    total: result.count,
    limit,
    page,
  });
}

async function getById(req, res) {
  const order = await Order.findOne({
    where: { id: positiveId(req.params.id), user_id: req.user.id },
    include: orderIncludes(),
  });
  if (!order) {
    return res.status(404).json({ error: { message: 'Pedido não encontrado.' } });
  }

  return res.json(serializeOrder(order));
}

async function createPayment(req, res) {
  const id = positiveId(req.params.id);
  const order = await Order.findOne({
    where: { id, user_id: req.user.id },
    include: orderIncludes(),
  });
  if (!order) {
    return res.status(404).json({ error: { message: 'Pedido não encontrado.' } });
  }
  if (order.status !== 'pending' || new Date(order.expires_at) <= new Date()) {
    return res.status(409).json({ error: { message: 'O prazo para pagamento deste pedido expirou.' } });
  }
  if (order.mercadopago_preference_id && order.mercadopago_init_point) {
    return res.json({
      order_id: order.id,
      preference_id: order.mercadopago_preference_id,
      checkout_url: order.mercadopago_init_point,
    });
  }

  const configuration = mercadoPago.assertPaymentConfiguration();
  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(401).json({ error: { message: 'Usuário não encontrado ou acesso revogado.' } });
  }

  let preference;
  try {
    preference = await mercadoPago.createCheckoutPreference(order, user.email, configuration);
  } catch (error) {
    if (error.status === 503) {
      throw error;
    }
    console.error('Falha ao criar preferência de pagamento no Mercado Pago:', error);
    const gatewayError = new Error('Não foi possível iniciar o pagamento no Mercado Pago.');
    gatewayError.status = 502;
    throw gatewayError;
  }

  const savedOrder = await sequelize.transaction(async (transaction) => {
    const current = await Order.findByPk(id, {
      transaction,
      ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!current || current.user_id !== req.user.id || current.status !== 'pending') {
      throw conflict('O pedido não está mais disponível para pagamento.');
    }
    if (!current.mercadopago_preference_id) {
      await current.update({
        mercadopago_preference_id: preference.preferenceId,
        mercadopago_init_point: preference.checkoutUrl,
      }, { transaction });
    }
    return current;
  });

  return res.json({
    order_id: savedOrder.id,
    preference_id: savedOrder.mercadopago_preference_id,
    checkout_url: savedOrder.mercadopago_init_point,
  });
}

async function cancel(req, res) {
  const id = positiveId(req.params.id);
  const order = await sequelize.transaction(async (transaction) => {
    const current = await Order.findOne({
      where: { id, user_id: req.user.id },
      transaction,
      ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!current) {
      return null;
    }
    if (current.status !== 'pending') {
      throw conflict('Somente pedidos pendentes podem ser cancelados.');
    }

    await releaseOrderStock(current.id, transaction);
    const previousStatus = current.status;
    await current.update({
      status: 'cancelled',
      mercadopago_payment_status: 'cancelled',
    }, { transaction });
    await recordOrderStatusChange({
      order: current,
      actorUserId: req.user.id,
      scope: 'payment',
      fromStatus: previousStatus,
      toStatus: 'cancelled',
      transaction,
    });
    return current;
  });

  if (!order) {
    return res.status(404).json({ error: { message: 'Pedido não encontrado.' } });
  }
  return res.json({ id: order.id, status: order.status });
}

async function webhook(req, res) {
  const dataId = req.query['data.id'] || (req.body && req.body.data && req.body.data.id);
  try {
    mercadoPago.verifyWebhook({
      signature: req.get('x-signature'),
      requestId: req.get('x-request-id'),
      dataId,
    });
  } catch (error) {
    if (error.name === 'InvalidWebhookSignatureError') {
      return res.status(401).json({ error: { message: 'Assinatura do webhook inválida.' } });
    }
    throw error;
  }

  const topic = req.query.type || (req.body && req.body.type);
  if (topic && topic !== 'payment') {
    return res.sendStatus(200);
  }
  if (typeof dataId !== 'string' && typeof dataId !== 'number') {
    return res.status(400).json({ error: { message: 'Notificação sem ID de pagamento.' } });
  }

  let payment;
  try {
    payment = await mercadoPago.getPayment(String(dataId));
  } catch (error) {
    console.error('Falha ao consultar pagamento no Mercado Pago:', error);
    const gatewayError = new Error('Não foi possível consultar o pagamento no Mercado Pago.');
    gatewayError.status = 502;
    throw gatewayError;
  }

  if (
    !/^[1-9]\d*$/.test(String(payment.external_reference)) ||
    String(payment.preference_id) === 'undefined' ||
    payment.currency_id !== 'BRL'
  ) {
    console.error('Notificação de pagamento sem referência, preferência ou moeda válidas.', {
      paymentId: String(dataId),
    });
    return res.sendStatus(200);
  }

  const paymentId = String(payment.id);
  const orderId = Number(payment.external_reference);
  const result = await sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(orderId, {
      transaction,
      ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (
      !order ||
      order.mercadopago_preference_id !== String(payment.preference_id) ||
      toCents(payment.transaction_amount) !== toCents(order.total)
    ) {
      console.error('Pagamento recebido não corresponde ao pedido salvo.', { paymentId, orderId });
      return { refund: false };
    }

    if (payment.status === 'approved') {
      const approvedAt = payment.date_approved ? new Date(payment.date_approved) : null;
      const approvedAfterExpiry = approvedAt && approvedAt > new Date(order.expires_at);

      if (order.status === 'pending' && !approvedAfterExpiry) {
        const previousStatus = order.status;
        await order.update({
          status: 'paid',
          mercadopago_payment_id: paymentId,
          mercadopago_payment_status: 'approved',
        }, { transaction });
        await recordOrderStatusChange({
          order,
          scope: 'payment',
          fromStatus: previousStatus,
          toStatus: 'paid',
          transaction,
        });
        return { refund: false };
      }

      if (order.status === 'pending' && approvedAfterExpiry) {
        await releaseOrderStock(order.id, transaction);
        await order.update({
          status: 'cancelled',
          mercadopago_payment_status: 'refund_pending',
        }, { transaction });
        await recordOrderStatusChange({
          order,
          scope: 'payment',
          fromStatus: 'pending',
          toStatus: 'cancelled',
          transaction,
        });
      } else if (order.status === 'paid' && order.mercadopago_payment_id === paymentId) {
        return { refund: false };
      } else if (order.status !== 'cancelled' && order.status !== 'paid') {
        return { refund: false };
      }

      return { refund: true, orderId: order.id };
    }

    if (order.status === 'pending') {
      await order.update({
        mercadopago_payment_id: paymentId,
        mercadopago_payment_status: String(payment.status || 'unknown').slice(0, 50),
      }, { transaction });
    }
    return { refund: false };
  });

  if (result.refund) {
    try {
      await mercadoPago.refundPayment(paymentId, `store-refund-${result.orderId}-${paymentId}`);
    } catch (error) {
      console.error('Falha ao estornar pagamento tardio ou duplicado:', error);
      const gatewayError = new Error('Não foi possível estornar um pagamento tardio ou duplicado.');
      gatewayError.status = 502;
      throw gatewayError;
    }
    await Order.update(
      { mercadopago_payment_status: 'refunded' },
      { where: { id: result.orderId, status: 'cancelled' } },
    );
  }

  return res.sendStatus(200);
}

module.exports = {
  create,
  list,
  getById,
  createPayment,
  cancel,
  webhook,
};
