const express = require('express');
const router = express.Router();
const {
  getPayments,
  getPaymentById,
  createInvoice,
  processPayment,
  refundPayment,
  downloadInvoice,
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getPayments);
router.post('/', authorize('admin'), createInvoice);
router.get('/:id', getPaymentById);
router.post('/:id/process', processPayment);
router.post('/:id/refund', authorize('admin'), refundPayment);
router.get('/:id/invoice', downloadInvoice);

module.exports = router;
