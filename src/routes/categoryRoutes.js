const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

router.get('/search', categoryController.search);
router.get('/:id', categoryController.getById);
router.post('/', authenticate, requireAdmin, categoryController.create);
router.put('/:id', authenticate, requireAdmin, categoryController.update);
router.delete('/:id', authenticate, requireAdmin, categoryController.remove);

module.exports = router;
