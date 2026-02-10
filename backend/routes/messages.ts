import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth';
import messageController from '../controllers/messageController';

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
    },
});

router.get('/lead/:leadId', auth, (req, res) => messageController.getByLead(req, res));
router.get('/contact/:contactId', auth, (req, res) => messageController.getByContact(req, res));
router.post('/contact/:contactId', auth, (req, res) => messageController.sendToContact(req, res));
router.post('/contact/:contactId/voice', auth, upload.single('voice'), (req, res) => messageController.sendVoiceToContact(req, res));
router.post('/contact/:contactId/file', auth, upload.single('file'), (req, res) => messageController.sendFileToContact(req, res));
router.post('/:id/reactions', auth, (req, res) => messageController.addReaction(req, res));

export default router;
