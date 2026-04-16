const Appointment = require('../models/Appointment');

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

    res.status(200).json({ success: true, data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── POST /appointments ──────────────────────────────────────────────────────
const createAppointment = async (req, res, next) => {
  try {
    const { jobId, technicianId, scheduledAt, duration, address, notes } = req.body;

    const appointment = await Appointment.create({
      jobId,
      customerId: req.user.role === 'customer' ? req.user._id : req.body.customerId,
      technicianId,
      scheduledAt,
      duration,
      address,
      notes,
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
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.status(200).json({ success: true, message: 'Appointment cancelled', data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /appointments/:id/confirm ────────────────────────────────────────
const confirmAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed' },
      { new: true }
    );
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    res.status(200).json({ success: true, message: 'Appointment confirmed', data: appointment });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /appointments/:id/complete ───────────────────────────────────────
const completeAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'completed' },
      { new: true }
    );
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
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
