const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  getPayments,
  getPaymentById,
  createInvoice,
  processPayment,
  refundPayment,
  downloadInvoice,
  uploadPaySlip,
  uploadPaySlipInline,
  confirmPaySlip,
  getFinanceSummary,
  deletePayment,
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for pay slip uploads
// Use memory storage — file buffer is read from req.file.buffer in the controller
// and stored as base64 directly in MongoDB (no files written to disk)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';

  if (isImage || isPdf) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only image files and PDF are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
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
router.post('/:id/upload-slip-inline', uploadPaySlipInline);
router.post('/:id/confirm-slip', authorize('admin'), confirmPaySlip);
router.delete('/:id', authorize('admin'), deletePayment);
router.get('/:id/invoice', downloadInvoice);

module.exports = router;
