const Appointment = require('../models/Appointment');
const Job = require('../models/Job');

const canAccessAppointment = (appointment, user) => {
  if (!appointment || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return appointment.customerId && appointment.customerId.toString() === user._id.toString();
  if (user.role === 'technician') return appointment.technicianId && appointment.technicianId.toString() === user._id.toString();
  return false;
};

const hasSlotConflict = async (technicianId, scheduledAt, duration, excludeId = null) => {
  const slotStart = new Date(scheduledAt);
  const slotEnd = new Date(slotStart.getTime() + Number(duration || 60) * 60000);

  const query = {
    technicianId,
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledAt: {
      $gte: new Date(slotStart.getTime() - 24 * 60 * 60000),
      $lte: new Date(slotEnd.getTime() + 24 * 60 * 60000),
    },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await Appointment.find(query).select('scheduledAt duration');
  return existing.some((item) => {
    const start = new Date(item.scheduledAt);
    const end = new Date(start.getTime() + Number(item.duration || 60) * 60000);
    return start < slotEnd && end > slotStart;
  });
};

// ─── GET /appointments ───────────────────────────────────────────────────────
const getAppointments = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (req.user.role === 'customer') filter.customerId = req.user._id;
    if (req.user.role === 'technician') filter.technicianId = req.user._id;
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate('jobId', 'title description')
        .populate('customerId', 'name email phone')
        .populate('technicianId', 'name email phone')
        .sort({ scheduledAt: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Appointment.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: appointments,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /appointments/:id ───────────────────────────────────────────────────
const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('jobId', 'title description')
      .populate('customerId', 'name email phone')
      .populate('technicianId', 'name email phone');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (!canAccessAppointment(appointment, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this appointment' });
    }

    res.status(200).json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /appointments ──────────────────────────────────────────────────────
const createAppointment = async (req, res, next) => {
  try {
    const { jobId, technicianId, scheduledAt, duration, address, notes } = req.body;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const chosenTechnicianId = technicianId || job.technicianId;
    if (!chosenTechnicianId) {
      return res.status(400).json({ success: false, message: 'technicianId is required' });
    }

    if (await hasSlotConflict(chosenTechnicianId, scheduledAt, duration || 60)) {
      return res.status(409).json({ success: false, message: 'Technician is not available for this time slot' });
    }

    const customerId = req.user.role === 'customer' ? req.user._id : req.body.customerId || job.customerId;

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId is required' });
    }

    const appointment = await Appointment.create({
      jobId,
      customerId,
      technicianId: chosenTechnicianId,
      scheduledAt,
      duration,
      address: address || job.address,
      notes,
    });

    await Job.findByIdAndUpdate(jobId, {
      customerId,
      technicianId: chosenTechnicianId,
      scheduledAt,
      status: 'in_progress',
    });

    const populated = await appointment.populate([
      { path: 'jobId', select: 'title description' },
      { path: 'customerId', select: 'name email phone' },
      { path: 'technicianId', select: 'name email phone' },
    ]);

    res.status(201).json({ success: true, message: 'Appointment created', data: populated });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /appointments/:id ───────────────────────────────────────────────────
const updateAppointment = async (req, res, next) => {
  try {
    // Status changes must use PATCH /cancel
    const { status, ...safeUpdate } = req.body;

    const existing = await Appointment.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.user.role === 'technician' && existing.technicianId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Technician can update only assigned appointments' });
    }

    const nextTechnicianId = safeUpdate.technicianId || existing.technicianId;
    const nextScheduledAt = safeUpdate.scheduledAt || existing.scheduledAt;
    const nextDuration = safeUpdate.duration || existing.duration;

    const hasConflict = await hasSlotConflict(nextTechnicianId, nextScheduledAt, nextDuration, existing._id);
    if (hasConflict) {
      return res.status(409).json({ success: false, message: 'Technician is not available for this time slot' });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { $set: safeUpdate },
      { new: true, runValidators: true }
    ).populate('jobId customerId technicianId', 'name email phone title');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    res.status(200).json({ success: true, message: 'Appointment updated', data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /appointments/:id/cancel ─────────────────────────────────────────
const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.user.role !== 'admin' && appointment.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only admin or booking customer can cancel appointment' });
    }

    appointment.status = 'cancelled';
    await appointment.save();
    await Job.findByIdAndUpdate(appointment.jobId, { status: 'cancelled' });

    res.status(200).json({ success: true, message: 'Appointment cancelled', data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /appointments/:id/confirm ────────────────────────────────────────
const confirmAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.user.role === 'technician' && appointment.technicianId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Technician can confirm only assigned appointments' });
    }

    appointment.status = 'confirmed';
    await appointment.save();
    await Job.findByIdAndUpdate(appointment.jobId, { status: 'in_progress' });

    res.status(200).json({ success: true, message: 'Appointment confirmed', data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /appointments/:id/complete ───────────────────────────────────────
const completeAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (req.user.role === 'technician' && appointment.technicianId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Technician can complete only assigned appointments' });
    }

    appointment.status = 'completed';
    await appointment.save();
    await Job.findByIdAndUpdate(appointment.jobId, { status: 'completed' });

    res.status(200).json({ success: true, message: 'Appointment completed', data: appointment });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  confirmAppointment,
  completeAppointment,
};
