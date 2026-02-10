import express from 'express';
import auth from '../middleware/auth';
import automationController from '../controllers/automationController';

const router = express.Router();

router.get('/', auth, (req, res) => automationController.getAutomations(req, res));
router.get('/:id', auth, (req, res) => automationController.getAutomation(req, res));
router.post('/', auth, (req, res) => automationController.createAutomation(req, res));
router.patch('/:id', auth, (req, res) => automationController.updateAutomation(req, res));
router.delete('/:id', auth, (req, res) => automationController.deleteAutomation(req, res));
router.post('/:id/execute', auth, (req, res) => automationController.executeAutomation(req, res));

export default router;
