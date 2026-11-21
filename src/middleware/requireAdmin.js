function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: { message: 'É necessário ter perfil de administrador.' },
    });
  }

  return next();
}

module.exports = requireAdmin;
