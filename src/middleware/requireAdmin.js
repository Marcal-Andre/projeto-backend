const { User } = require('../models');

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        error: { message: 'É necessário ter perfil de administrador.' },
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requireAdmin;
