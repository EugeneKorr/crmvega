import express from 'express';
import { auth, requireAdmin } from '../middleware/auth';
import tagController from '../controllers/tagController';

const router = express.Router();

// Settings
router.get('/settings', auth, (req, res) => tagController.getSettings(req, res));
router.post('/settings', auth, requireAdmin, (req, res) => tagController.updateSettings(req, res));

// Tags CRUD
router.get('/', auth, (req, res) => tagController.getAll(req, res));
router.post('/', auth, (req, res) => tagController.create(req, res));
router.patch('/:id', auth, (req, res) => tagController.update(req, res));
router.delete('/:id', auth, (req, res) => tagController.delete(req, res));

// Order Tags Assignments
router.post('/order/:orderId/assign', auth, (req, res) => tagController.assignToOrder(req, res));
router.delete('/order/:orderId/remove/:tagId', auth, (req, res) => tagController.removeFromOrder(req, res));
router.get('/order/:orderId', auth, (req, res) => tagController.getByOrder(req, res));

export default router;
