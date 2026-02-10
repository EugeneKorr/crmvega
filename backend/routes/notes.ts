import express from 'express';
import { auth } from '../middleware/auth';
import noteController from '../controllers/noteController';

const router = express.Router();

router.get('/contact/:contactId', auth, (req, res) => noteController.getByContact(req, res));
router.get('/order/:orderId', auth, (req, res) => noteController.getByOrder(req, res));
router.post('/', auth, (req, res) => noteController.create(req, res));
router.patch('/:id', auth, (req, res) => noteController.update(req, res));
router.delete('/:id', auth, (req, res) => noteController.delete(req, res));

export default router;
