import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth';
import uploadController from '../controllers/uploadController';

const router = express.Router();
const uploadManager = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

router.post('/', auth, uploadManager.single('file'), (req, res) => uploadController.upload(req, res));

export default router;
