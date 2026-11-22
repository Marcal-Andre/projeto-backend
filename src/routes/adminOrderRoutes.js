const express = require('express');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const adminOrderController = require('../controllers/adminOrderController');

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get('/', adminOrderController.list);
router.patch('/:id/fulfillment-status', adminOrderController.updateFulfillmentStatus);

module.exports = router;
