import { Router } from 'express';
import logsController from '../controllers/logsController';
import { auth, requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/logs?level=error&source=telegram_bot&limit=50&search=...&from=...&to=...
router.get('/', auth, requireAdmin, logsController.getLogs.bind(logsController));

// GET /api/logs/sources — уникальные источники логов
router.get('/sources', auth, requireAdmin, logsController.getSources.bind(logsController));

export default router;
