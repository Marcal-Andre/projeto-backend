const express = require('express');
const authenticate = require('../middleware/authenticate');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.use(authenticate);
router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.patch('/items/:itemId', cartController.updateItem);
router.delete('/items/:itemId', cartController.removeItem);

module.exports = router;
