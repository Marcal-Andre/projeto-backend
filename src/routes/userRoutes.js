const express = require('express');
const authenticate = require('../middleware/authenticate');
const userController = require('../controllers/userController');

const router = express.Router();

router.post('/token', userController.login);
router.get('/:id', userController.getById);
router.post('/', userController.create);
router.put('/:id', authenticate, userController.update);
router.delete('/:id', authenticate, userController.remove);

module.exports = router;
