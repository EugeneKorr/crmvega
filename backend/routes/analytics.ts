import express from 'express';
import auth from '../middleware/auth';
import analyticsController from '../controllers/analyticsController';

const router = express.Router();

// Получить аналитику по заявкам (orders)
router.get('/orders', auth, (req, res) => analyticsController.getOrders(req, res));

// Получить статистику по контактам
router.get('/contacts', auth, (req, res) => analyticsController.getContacts(req, res));

export default router;
