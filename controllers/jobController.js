const Job = require('../models/Job');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');

// ─── GET /jobs ───────────────────────────────────────────────────────────────
const getJobs = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, search, priority } = req.query;
    const filter = {};

    if (req.user.role === 'customer') filter.customerId = req.user._id;
    if (req.user.role === 'technician') filter.technicianId = req.user._id;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    // Keyword search on title and description
    if (search) filter.$or = [
      { title: new RegExp(search, 'i') },
      { description: new RegExp(search, 'i') },
      { address: new RegExp(search, 'i') },
    ];

    const skip = (Number(page) - 1) * Number(limit);
    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate('customerId', 'name email phone')
        .populate('technicianId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Job.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: jobs,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /jobs/:id ───────────────────────────────────────────────────────────
const getJobById = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('technicianId', 'name email phone');

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};

// ─── POST /jobs ──────────────────────────────────────────────────────────────
const createJob = async (req, res, next) => {
  try {
    const { title, description, priority, address, scheduledAt, estimatedDuration, notes } = req.body;

    const job = await Job.create({
      title,
      description,
      priority,
      address,
      scheduledAt,
      estimatedDuration,
      notes,
      customerId: req.user.role === 'customer' ? req.user._id : req.body.customerId,
    });

    res.status(201).json({ success: true, message: 'Job created successfully', data: job });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /jobs/:id ───────────────────────────────────────────────────────────
const updateJob = async (req, res, next) => {
  try {
    // Prevent direct status change via full update — use PATCH /status instead
    const { status, technicianId, customerId, ...safeUpdate } = req.body;

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { $set: safeUpdate },
      { new: true, runValidators: true }
    ).populate('customerId technicianId', 'name email phone');

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    res.status(200).json({ success: true, message: 'Job updated successfully', data: job });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /jobs/:id/status ──────────────────────────────────────────────────
const updateJobStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    res.status(200).json({ success: true, message: 'Job status updated', data: job });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /jobs/:id/assign ──────────────────────────────────────────────────
const assignTechnician = async (req, res, next) => {
  try {
    const { technicianId } = req.body;
    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'technicianId is required' });
    }

    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { technicianId },
      { new: true }
    ).populate('customerId technicianId', 'name email phone');

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    res.status(200).json({ success: true, message: 'Technician assigned', data: job });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /jobs/:id ────────────────────────────────────────────────────────
const deleteJob = async (req, res, next) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    res.status(200).json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── GET /jobs/:id/appointments ──────────────────────────────────────────────
const getJobAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ jobId: req.params.id })
      .populate('customerId technicianId', 'name email phone')
      .sort({ scheduledAt: 1 });

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
};

// ─── GET /jobs/:id/payment ───────────────────────────────────────────────────
const getJobPayment = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ jobId: req.params.id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found for this job' });

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getJobs,
  getJobById,
  createJob,
  updateJob,
  updateJobStatus,
  assignTechnician,
  deleteJob,
  getJobAppointments,
  getJobPayment,
};
