const express = require('express');
const router = express.Router();
const {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  confirmAppointment,
  completeAppointment,
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', getAppointments);
router.post('/', authorize('admin', 'customer'), createAppointment);
router.get('/:id', getAppointmentById);
router.put('/:id', authorize('admin', 'technician'), updateAppointment);
router.patch('/:id/cancel', cancelAppointment);
router.patch('/:id/confirm', authorize('admin', 'technician'), confirmAppointment);
router.patch('/:id/complete', authorize('admin', 'technician'), completeAppointment);

module.exports = router;
