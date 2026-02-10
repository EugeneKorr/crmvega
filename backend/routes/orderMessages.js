const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const controller = require('../controllers/orderMessagesController');

// Configure multer for disk storage (temp files)
const uploadDir = path.join(os.tmpdir(), 'crm-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// --- Client Messages ---
router.get('/:orderId/client', auth, (req, res) => controller.getClientMessages(req, res));
router.post('/:orderId/client', auth, (req, res) => controller.sendClientMessage(req, res));
router.post('/:orderId/client/file', auth, upload.single('file'), (req, res) => controller.sendClientFile(req, res));
router.post('/:orderId/client/voice', auth, upload.single('voice'), (req, res) => controller.sendClientVoice(req, res));
router.post('/:orderId/client/read', auth, (req, res) => controller.markClientMessagesRead(req, res));
router.post('/read-all', auth, (req, res) => controller.markAllRead(req, res));

// --- Internal Messages ---
router.get('/:orderId/internal', auth, (req, res) => controller.getInternalMessages(req, res));
router.post('/:orderId/internal', auth, (req, res) => controller.sendInternalMessage(req, res));
router.post('/:orderId/internal/file', auth, upload.single('file'), (req, res) => controller.sendInternalFile(req, res));
router.post('/:orderId/internal/voice', auth, upload.single('voice'), (req, res) => controller.sendInternalVoice(req, res));
router.post('/:orderId/internal/read', auth, (req, res) => controller.markInternalMessagesRead(req, res));
router.get('/:orderId/internal/unread', auth, (req, res) => controller.getUnreadInternalCount(req, res));

// --- Timeline ---
router.get('/:orderId/timeline', auth, (req, res) => controller.getTimeline(req, res));

module.exports = router;
