const express = require('express');
const authenticate = require('../middleware/authenticate');
const userController = require('../controllers/userController');
const rateLimits = require('../middleware/rateLimits');

const router = express.Router();

router.post('/token', rateLimits.login, userController.login);
router.get('/:id/address', authenticate, userController.getAddress);
router.put('/:id/address', authenticate, userController.saveAddress);
router.get('/:id', authenticate, userController.getById);
router.post('/', rateLimits.registration, userController.create);
router.put('/:id', authenticate, userController.update);
router.delete('/:id', authenticate, userController.remove);

module.exports = router;
