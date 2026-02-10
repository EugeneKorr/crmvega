import express from 'express';
import { auth } from '../middleware/auth';
import contactController from '../controllers/contactController';

const router = express.Router();

router.get('/', auth, (req, res) => contactController.getAll(req, res));
router.get('/summary', auth, (req, res) => contactController.getSummary(req, res));
router.get('/:id', auth, (req, res) => contactController.getById(req, res));
router.post('/', auth, (req, res) => contactController.create(req, res));
router.patch('/:id', auth, (req, res) => contactController.update(req, res));
router.delete('/:id', auth, (req, res) => contactController.delete(req, res));
router.post('/:id/read-messages', auth, (req, res) => contactController.markMessagesRead(req, res));

export default router;
