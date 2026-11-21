const { Product, OrderItem } = require('../models');

async function releaseOrderStock(orderId, transaction) {
  const items = await OrderItem.findAll({
    where: { order_id: orderId },
    attributes: ['product_id', 'quantity'],
    transaction,
  });
  const quantities = new Map();
  for (const item of items) {
    if (item.product_id !== null) {
      quantities.set(
        item.product_id,
        (quantities.get(item.product_id) || 0) + item.quantity,
      );
    }
  }

  for (const [productId, quantity] of [...quantities].sort(([left], [right]) => left - right)) {
    const product = await Product.findByPk(productId, {
      transaction,
      ...(transaction.LOCK?.UPDATE ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (product) {
      await product.increment('stock', { by: quantity, transaction });
    }
  }
}

module.exports = { releaseOrderStock };
