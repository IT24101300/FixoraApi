const LeaveRequest = require('../models/LeaveRequest');

// ─── POST /leaves ─────────────────────────────────────────────────────────────
// Technician applies for leave
const applyLeave = async (req, res, next) => {
  try {
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate || !reason) {
      return res.status(400).json({ success: false, message: 'startDate, endDate and reason are required' });
    }

    if (startDate > endDate) {
      return res.status(400).json({ success: false, message: 'startDate must be before or equal to endDate' });
    }

    const leave = await LeaveRequest.create({
      technicianId: req.user._id,
      technicianName: req.user.name,
      startDate,
      endDate,
      reason,
    });

    res.status(201).json({ success: true, message: 'Leave request submitted', data: leave });
  } catch (error) {
    next(error);
  }
};

// ─── GET /leaves ──────────────────────────────────────────────────────────────
// Technician gets own; admin gets all (optional ?status filter)
const getLeaves = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (req.user.role === 'technician') {
      filter.technicianId = req.user._id;
    }
    if (status) {
      filter.status = status;
    }

    const leaves = await LeaveRequest.find(filter)
      .populate('technicianId', 'name email')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: leaves });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /leaves/:id/approve ────────────────────────────────────────────────
// Admin approves a leave request
const approveLeave = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }
    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be approved' });
    }

    leave.status = 'approved';
    leave.adminNote = req.body.adminNote || '';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    await leave.save();

    res.status(200).json({ success: true, message: 'Leave request approved', data: leave });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /leaves/:id/reject ─────────────────────────────────────────────────
// Admin rejects a leave request
const rejectLeave = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }
    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be rejected' });
    }

    leave.status = 'rejected';
    leave.adminNote = req.body.adminNote || '';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    await leave.save();

    res.status(200).json({ success: true, message: 'Leave request rejected', data: leave });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /leaves/:id ───────────────────────────────────────────────────────
// Technician cancels a pending leave request
const cancelLeave = async (req, res, next) => {
  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }
    if (leave.technicianId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be cancelled' });
    }

    await leave.deleteOne();
    res.status(200).json({ success: true, message: 'Leave request cancelled' });
  } catch (error) {
    next(error);
  }
};

module.exports = { applyLeave, getLeaves, approveLeave, rejectLeave, cancelLeave };
