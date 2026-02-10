import express from 'express';
import { auth, requireAdmin } from '../middleware/auth';
import ordersController from '../controllers/ordersController';

const router = express.Router();

router.get('/', auth, (req, res) => ordersController.getAll(req, res));
router.get('/unread-count', auth, (req, res) => ordersController.getUnreadCount(req, res));
router.delete('/unsorted', auth, requireAdmin, (req, res) => ordersController.clearUnsorted(req, res));
router.get('/:id', auth, (req, res) => ordersController.getById(req, res));
router.post('/', auth, (req, res) => ordersController.create(req, res));
router.patch('/:id', auth, (req, res) => ordersController.update(req, res));
router.delete('/:id', auth, (req, res) => ordersController.delete(req, res));

router.post('/bulk/status', auth, (req, res) => ordersController.bulkUpdateStatus(req, res));
router.post('/bulk/delete', auth, (req, res) => ordersController.bulkDelete(req, res));

export default router;
