import express from 'express';
import { auth, requireAdmin } from '../middleware/auth';
import managerController from '../controllers/managerController';

const router = express.Router();

router.get('/', auth, requireAdmin, (req, res) => managerController.getAll(req, res));
router.post('/', auth, requireAdmin, (req, res) => managerController.create(req, res));
router.patch('/:id', auth, requireAdmin, (req, res) => managerController.update(req, res));
router.delete('/:id', auth, requireAdmin, (req, res) => managerController.delete(req, res));
router.put('/settings/notifications', auth, (req, res) => managerController.updateNotificationSettings(req, res));

export default router;
