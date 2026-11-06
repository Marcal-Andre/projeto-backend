const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const productController = require('../controllers/productController');

const router = express.Router();

router.get('/search', productController.search);
router.get('/:id', productController.getById);
router.post('/', authenticate, requireAdmin, productController.create);
router.put('/:id', authenticate, requireAdmin, productController.update);
router.delete('/:id', authenticate, requireAdmin, productController.remove);

module.exports = router;
