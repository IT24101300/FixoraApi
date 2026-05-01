const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Auto-generate invoice numbers: INV-000001, INV-000002, ...
const counterSchema = new mongoose.Schema({ _id: String, seq: Number });
const Counter = mongoose.model('Counter', counterSchema);

const paymentSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: [true, 'Job reference is required'],
      unique: true,
    },
    invoiceNumber: {
      type: String,
      unique: true,
    },
    amount: { type: Number, required: true, min: 0 }, // subtotal before tax
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    method: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank_transfer', null],
      default: null,
    },
    paidAt: { type: Date, default: null },
    dueDate: { type: Date, required: true },
    lineItems: [lineItemSchema],
    refundReason: { type: String, default: '' },
    // Bank Transfer Details
    paySlip: {
      fileName: { type: String, default: '' },
      fileUrl: { type: String, default: '' },
      uploadedAt: { type: Date, default: null },
      reviewStatus: {
        type: String,
        enum: ['not_uploaded', 'pending', 'approved', 'rejected'],
        default: 'not_uploaded',
      },
      reviewedAt: { type: Date, default: null },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      reviewNote: { type: String, default: '' },
    },
    paymentNotes: { type: String, default: '' },
    // Earnings split (calculated when payment status becomes 'paid')
    technicianEarnings: { type: Number, default: 0 }, // 90% of total
    platformFee: { type: Number, default: 0 },         // 10% of total
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Generate sequential invoice number before saving a new document
paymentSchema.pre('save', async function (next) {
  if (!this.isNew) return next();
  try {
    const counter = await Counter.findByIdAndUpdate(
      'invoice',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.invoiceNumber = `INV-${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
