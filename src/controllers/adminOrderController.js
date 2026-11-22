const { Order, OrderItem, OrderStatusHistory, User, sequelize } = require('../models');
const { badRequest, positiveId, requireObject } = require('../utils/validation');
const { recordOrderStatusChange } = require('../services/orderStatusHistory');

const paymentStatuses = ['pending', 'paid', 'cancelled'];
const fulfillmentStatuses = ['unfulfilled', 'processing', 'shipped', 'delivered'];
const nextFulfillmentStatus = {
  unfulfilled: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
};

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function pagination(query) {
  const limit = query.limit === undefined ? 12 : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw badRequest('O parâmetro limit deve ser um inteiro entre 1 e 100.');
  }
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('O parâmetro page deve ser um inteiro positivo.');
  }
  return { limit, page, offset: (page - 1) * limit };
}

async function list(req, res) {
  const { limit, page, offset } = pagination(req.query);
  const where = {};
  if (req.query.status !== undefined) {
    if (!paymentStatuses.includes(req.query.status)) {
      throw badRequest(`O parâmetro status deve ser um de: ${paymentStatuses.join(', ')}.`);
    }
    where.status = req.query.status;
  }
  if (req.query.fulfillment_status !== undefined) {
    if (!fulfillmentStatuses.includes(req.query.fulfillment_status)) {
      throw badRequest(
        `O parâmetro fulfillment_status deve ser um de: ${fulfillmentStatuses.join(', ')}.`,
      );
    }
    where.fulfillment_status = req.query.fulfillment_status;
  }

  const result = await Order.findAndCountAll({
    where,
    include: [
      { model: User, attributes: ['id', 'firstname', 'surname', 'email'] },
      { model: OrderItem, as: 'items', separate: true, order: [['id', 'ASC']] },
      {
        model: OrderStatusHistory,
        as: 'statusHistory',
        separate: true,
        order: [['created_at', 'ASC'], ['id', 'ASC']],
      },
    ],
    distinct: true,
    order: [['id', 'DESC']],
    limit,
    offset,
  });

  return res.json({
    data: result.rows.map((order) => {
      const values = order.get({ plain: true });
      return {
        id: values.id,
        status: values.status,
        fulfillment_status: values.fulfillment_status,
        total: Number(values.total),
        created_at: values.created_at,
        customer: values.User,
        delivery_address: {
          postal_code: values.postal_code,
          street: values.street,
          number: values.number,
          complement: values.complement,
          neighborhood: values.neighborhood,
          city: values.city,
          state: values.state,
        },
        items: values.items.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          options: JSON.parse(item.selected_options),
        })),
        fulfillment_history: values.statusHistory
          .filter((entry) => entry.scope === 'fulfillment')
          .map((entry) => ({
            status: entry.to_status,
            actor_user_id: entry.actor_user_id,
            created_at: entry.created_at,
          })),
      };
    }),
    total: result.count,
    limit,
    page,
  });
}

async function updateFulfillmentStatus(req, res) {
  const id = positiveId(req.params.id);
  const input = requireObject(req.body);
  const nextStatus = input.fulfillment_status;
  if (!fulfillmentStatuses.includes(nextStatus)) {
    throw badRequest(`fulfillment_status deve ser um de: ${fulfillmentStatuses.join(', ')}.`);
  }

  const order = await sequelize.transaction(async (transaction) => {
    const current = await Order.findByPk(id, {
      transaction,
      ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!current) {
      return null;
    }
    if (current.status !== 'paid') {
      throw conflict('A preparação só pode começar depois da confirmação do pagamento.');
    }
    if (nextFulfillmentStatus[current.fulfillment_status] !== nextStatus) {
      throw conflict('A etapa do pedido deve avançar uma etapa por vez e não pode retroceder.');
    }

    const previousStatus = current.fulfillment_status;
    await current.update({ fulfillment_status: nextStatus }, { transaction });
    await recordOrderStatusChange({
      order: current,
      actorUserId: req.user.id,
      scope: 'fulfillment',
      fromStatus: previousStatus,
      toStatus: nextStatus,
      transaction,
    });
    return current;
  });

  if (!order) {
    return res.status(404).json({ error: { message: 'Pedido não encontrado.' } });
  }
  return res.json({
    id: order.id,
    status: order.status,
    fulfillment_status: order.fulfillment_status,
  });
}

module.exports = { list, updateFulfillmentStatus };
