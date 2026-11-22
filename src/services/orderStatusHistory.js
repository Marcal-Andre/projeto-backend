const { Notification, OrderStatusHistory } = require('../models');

const statusMessages = {
  'payment.paid': (orderId) => `Pagamento confirmado para o pedido #${orderId}.`,
  'payment.cancelled': (orderId) => `O pedido #${orderId} foi cancelado.`,
  'fulfillment.processing': (orderId) => `O pedido #${orderId} está em preparação.`,
  'fulfillment.shipped': (orderId) => `O pedido #${orderId} foi enviado.`,
  'fulfillment.delivered': (orderId) => `O pedido #${orderId} foi entregue.`,
};

async function recordOrderStatusChange({
  order,
  actorUserId = null,
  scope,
  fromStatus,
  toStatus,
  transaction,
}) {
  await OrderStatusHistory.create({
    order_id: order.id,
    actor_user_id: actorUserId,
    scope,
    from_status: fromStatus,
    to_status: toStatus,
    created_at: new Date(),
  }, { transaction });

  const messageFactory = statusMessages[`${scope}.${toStatus}`];
  if (order.user_id && messageFactory) {
    await Notification.create({
      user_id: order.user_id,
      order_id: order.id,
      type: `${scope}.${toStatus}`,
      message: messageFactory(order.id),
      read_at: null,
      created_at: new Date(),
    }, { transaction });
  }
}

module.exports = { recordOrderStatusChange };
