const Payment = require('../models/Payment');
const Job = require('../models/Job');

const getPaymentWithJob = async (paymentId) => {
  return Payment.findById(paymentId).populate({
    path: 'jobId',
    select: 'title status customerId technicianId',
    populate: {
      path: 'customerId',
      select: 'name email phone',
    },
  });
};

const canAccessPayment = (payment, user) => {
  if (!payment || !user) return false;
  if (user.role === 'admin') return true;

  const job = payment.jobId;
  if (!job) return false;

  if (user.role === 'customer') {
    const customerId = job.customerId?._id || job.customerId;
    return customerId && customerId.toString() === user._id.toString();
  }

  if (user.role === 'technician') {
    const technicianId = job.technicianId?._id || job.technicianId;
    return technicianId && technicianId.toString() === user._id.toString();
  }

  return false;
};

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
    } else if (req.user.role === 'technician') {
      const technicianJobs = await Job.find({ technicianId: req.user._id }).select('_id');
      filter.jobId = { $in: technicianJobs.map((j) => j._id) };
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate({
          path: 'jobId',
          select: 'title status customerId',
          populate: {
            path: 'customerId',
            select: 'name email phone'
          }
        })
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
    const payment = await getPaymentWithJob(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (!canAccessPayment(payment, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this payment' });
    }

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /payments  (create invoice for a job) ──────────────────────────────
const createInvoice = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can create invoices' });
    }

    const { jobId, amount = 100, tax, dueDate, lineItems, currency } = req.body;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Check if invoice already exists for this job
    const existingPayment = await Payment.findOne({ jobId });
    if (existingPayment) {
      return res.status(200).json({
        success: true,
        message: 'Invoice already exists for this job',
        data: existingPayment,
      });
    }

    // Calculate tax if not provided (10% of amount)
    const taxAmount = tax !== undefined ? tax : Math.round((Number(amount) * 0.1) * 100) / 100;
    const total = Number(amount) + taxAmount;

    // Set due date if not provided (7 days from now)
    const dueeDateValue = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const payment = await Payment.create({
      jobId,
      amount: Number(amount),
      tax: taxAmount,
      total,
      dueDate: dueeDateValue,
      lineItems: lineItems || [
        {
          description: job.title || 'Service',
          quantity: 1,
          unitPrice: Number(amount),
          total: Number(amount),
        },
      ],
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

    const payment = await getPaymentWithJob(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (!canAccessPayment(payment, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to process this payment' });
    }

    if (req.user.role === 'customer' && !['card', 'upi'].includes(method)) {
      return res.status(400).json({ success: false, message: 'Customer can pay only by card or upi' });
    }

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
    const payment = await Payment.findById(req.params.id).populate('jobId', 'title description address customerId technicianId');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    if (!canAccessPayment(payment, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to download this invoice' });
    }

    // In a real-world setup you would generate a PDF URL here.
    // We return the full payment object as the invoice data.
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /payments/:id/upload-slip ──────────────────────────────────────────
const uploadPaySlip = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const payment = await getPaymentWithJob(id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customer can upload bank slip' });
    }
    if (!canAccessPayment(payment, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to upload slip for this payment' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      return res.status(400).json({ success: false, message: 'File size must be less than 5MB' });
    }

    // Validate file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/heic',
      'image/heif',
      'application/pdf',
    ];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Only JPG, PNG, HEIC, HEIF, and PDF files are allowed' });
    }

    // Store file information
    const fileUrl = `/uploads/pay-slips/${req.file.filename}`;
    payment.paySlip = {
      fileName: req.file.originalname,
      fileUrl,
      uploadedAt: new Date(),
      reviewStatus: 'pending',
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: '',
    };
    payment.paymentNotes = notes || '';

    // Customer uploads proof; admin must confirm before marking as paid.
    payment.status = 'pending';
    payment.method = 'bank_transfer';
    payment.paidAt = null;

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Pay slip uploaded successfully',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /payments/:id/confirm-slip ────────────────────────────────────────
const confirmPaySlip = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can confirm slips' });
    }

    const { id } = req.params;
    const { approve = true, note = '' } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (!payment.paySlip || !payment.paySlip.uploadedAt) {
      return res.status(400).json({ success: false, message: 'No slip uploaded for this payment' });
    }

    payment.paySlip.reviewStatus = approve ? 'approved' : 'rejected';
    payment.paySlip.reviewedAt = new Date();
    payment.paySlip.reviewedBy = req.user._id;
    payment.paySlip.reviewNote = note || '';

    if (approve) {
      payment.status = 'paid';
      payment.method = 'bank_transfer';
      payment.paidAt = new Date();
    } else {
      payment.status = 'failed';
      payment.method = 'bank_transfer';
      payment.paidAt = null;
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: approve ? 'Pay slip confirmed successfully' : 'Pay slip rejected',
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /payments/finance-summary ──────────────────────────────────────────
const getFinanceSummary = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can view finance summary' });
    }

    const summary = await Payment.aggregate([
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          paidAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'paid'] }, '$total', 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, '$total', 0],
            },
          },
          refundedAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'refunded'] }, '$total', 0],
            },
          },
          failedAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, '$total', 0],
            },
          },
        },
      },
    ]);

    const statusBreakdown = await Payment.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totals: summary[0] || {
          totalInvoices: 0,
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          refundedAmount: 0,
          failedAmount: 0,
        },
        statusBreakdown,
      },
    });
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
  uploadPaySlip,
  confirmPaySlip,
  getFinanceSummary,
};
