const { Notification } = require('../models');
const { badRequest, positiveId } = require('../utils/validation');

async function list(req, res) {
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw badRequest('O parâmetro limit deve ser um inteiro entre 1 e 100.');
  }
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('O parâmetro page deve ser um inteiro positivo.');
  }

  const where = { user_id: req.user.id };
  const [result, unread] = await Promise.all([
    Notification.findAndCountAll({
      where,
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    }),
    Notification.count({ where: { user_id: req.user.id, read_at: null } }),
  ]);

  return res.json({
    data: result.rows.map((notification) => ({
      id: notification.id,
      order_id: notification.order_id,
      type: notification.type,
      message: notification.message,
      read_at: notification.read_at,
      created_at: notification.created_at,
    })),
    total: result.count,
    unread,
    limit,
    page,
  });
}

async function markRead(req, res) {
  const notification = await Notification.findOne({
    where: { id: positiveId(req.params.id), user_id: req.user.id },
  });
  if (!notification) {
    return res.status(404).json({ error: { message: 'Notificação não encontrada.' } });
  }

  if (!notification.read_at) {
    await notification.update({ read_at: new Date() });
  }
  return res.json({ id: notification.id, read_at: notification.read_at });
}

module.exports = { list, markRead };
