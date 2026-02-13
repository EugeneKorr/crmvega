import express from 'express';
import { auth, requireAdmin } from '../middleware/auth';
import managerController from '../controllers/managerController';

const router = express.Router();

router.get('/', auth, requireAdmin, (req, res) => managerController.getAll(req, res));
router.post('/', auth, requireAdmin, (req, res) => managerController.create(req, res));
router.patch('/:id', auth, (req, res) => {
    const manager = (req as any).manager;
    const id = req.params.id as string;
    const isSelf = manager.id === parseInt(id);
    const isAdmin = manager.role === 'admin';

    // Non-admins can only update themselves and cannot change their role
    if (!isAdmin && (!isSelf || req.body.role)) {
        return res.status(403).json({ error: 'У вас нет прав для выполнения этой операции' });
    }

    return managerController.update(req, res);
});
router.delete('/:id', auth, requireAdmin, (req, res) => managerController.delete(req, res));
router.put('/settings/notifications', auth, (req, res) => managerController.updateNotificationSettings(req, res));

export default router;
