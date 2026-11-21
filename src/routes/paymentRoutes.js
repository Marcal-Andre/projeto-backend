const express = require('express');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.post('/mercadopago/webhook', orderController.webhook);

module.exports = router;
