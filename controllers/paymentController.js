const Payment = require('../models/Payment');
const Job = require('../models/Job');

// ─── GET /payments ───────────────────────────────────────────────────────────
const getPayments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build filter by role
    let filter = {};
    if (req.user.role === 'customer') {
      const customerJobs = await Job.find({ customerId: req.user._id }).select('_id');
      filter.jobId = { $in: customerJobs.map((j) => j._id) };
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('jobId', 'title status customerId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Payment.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: payments,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /payments/:id ───────────────────────────────────────────────────────
const getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('jobId', 'title status');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /payments  (create invoice for a job) ──────────────────────────────
const createInvoice = async (req, res, next) => {
  try {
    const { jobId, amount, tax, dueDate, lineItems, currency } = req.body;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const taxAmount = tax || 0;
    const total = Number(amount) + taxAmount;

    const payment = await Payment.create({
      jobId,
      amount,
      tax: taxAmount,
      total,
      dueDate,
      lineItems: lineItems || [],
      currency: currency || 'USD',
    });

    res.status(201).json({ success: true, message: 'Invoice created', data: payment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /payments/:id/process ──────────────────────────────────────────────
const processPayment = async (req, res, next) => {
  try {
    const { method } = req.body;
    const validMethods = ['cash', 'card', 'upi', 'bank_transfer'];

    if (!validMethods.includes(method)) {
      return res.status(400).json({ success: false, message: `Invalid payment method. Allowed: ${validMethods.join(', ')}` });
    }

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status === 'paid') {
      return res.status(409).json({ success: false, message: 'Payment already processed' });
    }

    payment.status = 'paid';
    payment.method = method;
    payment.paidAt = new Date();
    await payment.save();

    res.status(200).json({ success: true, message: 'Payment processed successfully', data: payment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /payments/:id/refund ───────────────────────────────────────────────
const refundPayment = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status !== 'paid') {
      return res.status(409).json({ success: false, message: 'Only paid payments can be refunded' });
    }

    payment.status = 'refunded';
    payment.refundReason = reason || '';
    await payment.save();

    res.status(200).json({ success: true, message: 'Payment refunded', data: payment });
  } catch (error) {
    next(error);
  }
};

// ─── GET /payments/:id/invoice ───────────────────────────────────────────────
// Returns the payment data that the client can use to render a PDF invoice
const downloadInvoice = async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id).populate('jobId', 'title description address');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    // In a real-world setup you would generate a PDF URL here.
    // We return the full payment object as the invoice data.
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPayments,
  getPaymentById,
  createInvoice,
  processPayment,
  refundPayment,
  downloadInvoice,
};
