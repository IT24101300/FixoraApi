const Job = require('../models/Job');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Service = require('../models/Service');

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const canAccessJob = (job, user) => {
  if (!job || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'technician') {
    const technicianId = job.technicianId?._id || job.technicianId;
    return technicianId && technicianId.toString() === user._id.toString();
  }
  if (user.role === 'customer') {
    const customerId = job.customerId?._id || job.customerId;
    return customerId && customerId.toString() === user._id.toString();
  }
  return false;
};

// ─── GET /jobs ───────────────────────────────────────────────────────────────
const getJobs = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, search, priority, view } = req.query;
    const filter = {};

    if (req.user.role === 'customer') {
      if (view === 'booked') {
        filter.customerId = req.user._id;
      } else if (view === 'available') {
        filter.status = 'pending';
      }
    }
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
    if (!canAccessJob(job, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this job' });
    }

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
};

// ─── POST /jobs ──────────────────────────────────────────────────────────────
const createJob = async (req, res, next) => {
  try {
    const {
      title,
      description,
      priority,
      address,
      scheduledAt,
      estimatedDuration,
      notes,
      estimatedAmount,
      technicianId,
      customerId,
    } = req.body;

    if (!scheduledAt || !technicianId || !customerId) {
      return res.status(400).json({
        success: false,
        message: 'scheduledAt, technicianId and customerId are required',
      });
    }

    const technician = await User.findOne({ _id: technicianId, role: 'technician', isActive: true });
    if (!technician) {
      return res.status(400).json({ success: false, message: 'Invalid technicianId' });
    }

    const job = await Job.create({
      title,
      description,
      priority,
      address,
      scheduledAt,
      estimatedDuration,
      notes,
      customerId,
      technicianId,
    });

    await Appointment.create({
      jobId: job._id,
      customerId,
      technicianId,
      scheduledAt,
      duration: estimatedDuration || 60,
      address,
      notes: notes || '',
      status: 'scheduled',
    });

    // Automatically create an invoice for the job
    const amount = estimatedAmount || 100; // Default $100 if not provided
    const tax = Math.round((amount * 0.1) * 100) / 100; // 10% tax
    const total = amount + tax;

    const payment = await Payment.create({
      jobId: job._id,
      amount,
      tax,
      total,
      currency: 'USD',
      status: 'pending',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
      lineItems: [
        {
          description: title,
          quantity: 1,
          unitPrice: amount,
          total: amount,
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: 'Job created successfully with invoice',
      data: {
        job,
        payment,
      },
    });
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

    const existing = await Job.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Job not found' });

    if (req.user.role === 'technician') {
      if (!existing.technicianId || existing.technicianId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Technician can update only assigned jobs' });
      }
    }

    existing.status = status;
    await existing.save();

    res.status(200).json({ success: true, message: 'Job status updated', data: existing });
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

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const technician = await User.findById(technicianId);
    if (!technician) {
      return res.status(404).json({ success: false, message: 'Technician not found' });
    }

    job.technicianId = technicianId;
    await job.save();
    await job.populate('customerId technicianId', 'name email phone');

    // Create or update appointment for this job
    let appointment = await Appointment.findOne({ jobId: req.params.id });
    if (!appointment) {
      appointment = await Appointment.create({
        jobId: req.params.id,
        jobTitle: job.title,
        customerId: job.customerId._id,
        customerName: job.customerId.name,
        technicianId,
        technicianName: technician.name,
        scheduledAt: job.scheduledAt,
        duration: job.estimatedDuration,
        status: 'scheduled',
        address: job.address,
        notes: job.notes || '',
      });
    } else {
      appointment.technicianId = technicianId;
      appointment.technicianName = technician.name;
      appointment.status = 'scheduled';
      await appointment.save();
    }

    res.status(200).json({ success: true, message: 'Technician assigned', data: job });
  } catch (error) {
    console.error('assignTechnician error:', error);
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
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (!canAccessJob(job, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this job appointments' });
    }

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
    // Get the job with customer details
    const job = await Job.findById(req.params.id).populate({
      path: 'customerId',
      select: 'name email phone'
    });

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (!canAccessJob(job, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this job payment' });
    }

    // Get the payment for this job
    const payment = await Payment.findOne({ jobId: req.params.id });
    
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found for this job' });
    }

    // Build response with customer data included
    const response = {
      ...payment.toObject(),
      jobId: {
        _id: job._id,
        title: job.title,
        status: job.status,
        customerId: job.customerId
      }
    };

    res.status(200).json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};

// ─── GET /jobs/available-technicians ────────────────────────────────────────
const getAvailableTechnicians = async (req, res, next) => {
  try {
    const { scheduledAt, duration = 60, serviceName } = req.query;
    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: 'scheduledAt is required' });
    }

    const slotStart = new Date(scheduledAt);
    const slotEnd = new Date(slotStart.getTime() + Number(duration) * 60000);

    const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const slotDayKey = DAY_KEYS[slotStart.getDay()];
    const slotStartMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
    const slotEndMinutes   = slotEnd.getHours()   * 60 + slotEnd.getMinutes();

    // Build base filter — if serviceName provided, only return matching specialists
    const techFilter = { role: 'technician', isActive: true };
    if (serviceName) {
      const normalizedServiceName = String(serviceName).trim();
      if (normalizedServiceName) {
        techFilter.specializations = {
          $regex: `^${escapeRegExp(normalizedServiceName)}$`,
          $options: 'i',
        };
      }
    }

    const technicians = await User.find(techFilter)
      .select('name email phone avatarUrl workingHours availableDates specializations');

    // Filter by working-day and working-hours schedule
    const scheduledTechs = technicians.filter((tech) => {
      // Working days check — skip if not configured
      if (tech.availableDates && tech.availableDates.length > 0) {
        if (!tech.availableDates.includes(slotDayKey)) return false;
      }

      // Working hours check — skip if not configured
      if (tech.workingHours && tech.workingHours.startTime && tech.workingHours.endTime) {
        const [wStartH, wStartM] = tech.workingHours.startTime.split(':').map(Number);
        const [wEndH,   wEndM  ] = tech.workingHours.endTime.split(':').map(Number);
        const wStartMinutes = wStartH * 60 + wStartM;
        const wEndMinutes   = wEndH   * 60 + wEndM;
        if (slotStartMinutes < wStartMinutes || slotEndMinutes > wEndMinutes) return false;
      }

      return true;
    });

    console.log(`\nAfter schedule filter: ${scheduledTechs.length} technicians`);

    const technicianIds = scheduledTechs.map((t) => t._id);

    const existingAppointments = await Appointment.find({
      technicianId: { $in: technicianIds },
      status: { $in: ['scheduled', 'confirmed'] },
      scheduledAt: {
        $gte: new Date(slotStart.getTime() - 24 * 60 * 60000),
        $lte: new Date(slotEnd.getTime() + 24 * 60 * 60000),
      },
    }).select('technicianId scheduledAt duration');

    const busyTechnicianIds = new Set(
      existingAppointments
        .filter((a) => {
          const start = new Date(a.scheduledAt);
          const end = new Date(start.getTime() + Number(a.duration || 60) * 60000);
          return start < slotEnd && end > slotStart;
        })
        .map((a) => a.technicianId.toString())
    );

    const available = scheduledTechs
      .filter((tech) => !busyTechnicianIds.has(tech._id.toString()))
      .map(({ _id, name, email, phone, avatarUrl, specializations }) => ({ _id, name, email, phone, avatarUrl, specializations }));

    console.log(`After busy filter: ${available.length} technicians available`);
    console.log('=====================================\n');

    res.status(200).json({ success: true, count: available.length, data: available });
  } catch (error) {
    next(error);
  }
};

// ─── POST /jobs/book (customer) ──────────────────────────────────────────────
const bookService = async (req, res, next) => {
  try {
    const { serviceId, address, scheduledAt, notes } = req.body;

    if (!serviceId || !address || !scheduledAt) {
      return res.status(400).json({
        success: false,
        message: 'serviceId, address and scheduledAt are required',
      });
    }

    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const job = await Job.create({
      title: service.name,
      description: service.description,
      customerId: req.user._id,
      address,
      scheduledAt: new Date(scheduledAt),
      estimatedDuration: service.estimatedDuration,
      notes: notes || '',
      priority: 'medium',
      serviceName: service.name,
    });

    const subtotal = service.basePrice;
    const tax = parseFloat((subtotal * 0.1).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));

    const payment = await Payment.create({
      jobId: job._id,
      amount: subtotal,
      tax,
      total,
      currency: service.currency || 'USD',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      lineItems: [
        {
          description: service.name,
          quantity: 1,
          unitPrice: subtotal,
          total: subtotal,
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: 'Service booked successfully',
      data: { job, payment },
    });
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
  getAvailableTechnicians,
  bookService,
};
