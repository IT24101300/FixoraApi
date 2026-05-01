const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const {
  getPayments,
  getPaymentById,
  createInvoice,
  processPayment,
  refundPayment,
  downloadInvoice,
  uploadPaySlip,
  confirmPaySlip,
  getFinanceSummary,
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for pay slip uploads
const uploadDir = path.join(__dirname, '../uploads/pay-slips');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/heic',
    'image/heif',
    'application/pdf',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, HEIC, HEIF, and PDF are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

router.use(protect);

router.get('/finance-summary', authorize('admin'), getFinanceSummary);
router.get('/', getPayments);
router.post('/', authorize('admin'), createInvoice);
router.get('/:id', getPaymentById);
router.post('/:id/process', processPayment);
router.post('/:id/refund', authorize('admin'), refundPayment);
router.post('/:id/upload-slip', upload.single('paySlip'), uploadPaySlip);
router.post('/:id/confirm-slip', authorize('admin'), confirmPaySlip);
router.get('/:id/invoice', downloadInvoice);

module.exports = router;
