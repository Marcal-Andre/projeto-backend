const express = require('express');
const authenticate = require('../middleware/authenticate');
const orderController = require('../controllers/orderController');
const rateLimits = require('../middleware/rateLimits');

const router = express.Router();

router.use(authenticate);
router.post('/', rateLimits.orderCreation, orderController.create);
router.get('/', orderController.list);
router.post('/:id/payment', rateLimits.payment, orderController.createPayment);
router.post('/:id/cancel', orderController.cancel);
router.get('/:id', orderController.getById);

module.exports = router;
