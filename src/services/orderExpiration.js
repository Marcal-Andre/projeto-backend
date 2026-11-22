const { Op } = require('sequelize');
const { sequelize, Order } = require('../models');
const { releaseOrderStock } = require('./inventory');
const { recordOrderStatusChange } = require('./orderStatusHistory');

let expirationInProgress = false;

async function expirePendingOrders(now = new Date()) {
  if (expirationInProgress) {
    return 0;
  }

  expirationInProgress = true;
  try {
    const expiredOrders = await Order.findAll({
      where: {
        status: 'pending',
        expires_at: { [Op.lte]: now },
      },
      attributes: ['id'],
      order: [['id', 'ASC']],
      limit: 100,
    });
    let expiredCount = 0;

    for (const candidate of expiredOrders) {
      const expired = await sequelize.transaction(async (transaction) => {
        const order = await Order.findByPk(candidate.id, {
          transaction,
          ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
        });
        if (
          !order ||
          order.status !== 'pending' ||
          new Date(order.expires_at) > now
        ) {
          return false;
        }

        await releaseOrderStock(order.id, transaction);
        await order.update({
          status: 'cancelled',
          mercadopago_payment_status: 'expired',
        }, { transaction });
        await recordOrderStatusChange({
          order,
          scope: 'payment',
          fromStatus: 'pending',
          toStatus: 'cancelled',
          transaction,
        });
        return true;
      });
      if (expired) {
        expiredCount += 1;
      }
    }

    return expiredCount;
  } finally {
    expirationInProgress = false;
  }
}

module.exports = { expirePendingOrders };
