const express = require('express');
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const ordersController = require('../controllers/ordersController');

const router = express.Router();

router.get('/', auth, ordersController.getAll.bind(ordersController));
router.get('/unread-count', auth, ordersController.getUnreadCount.bind(ordersController));
router.get('/:id', auth, ordersController.getById.bind(ordersController));
router.post('/', auth, ordersController.create.bind(ordersController));
router.patch('/:id', auth, ordersController.update.bind(ordersController));
router.delete('/unsorted', auth, requireAdmin, ordersController.clearUnsorted.bind(ordersController));
router.delete('/:id', auth, ordersController.delete.bind(ordersController));

router.post('/bulk/status', auth, ordersController.bulkUpdateStatus.bind(ordersController));
router.post('/bulk/delete', auth, ordersController.bulkDelete.bind(ordersController));

module.exports = router;
