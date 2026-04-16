const express = require('express');
const router = express.Router();
const {
  getJobs,
  getJobById,
  createJob,
  updateJob,
  updateJobStatus,
  assignTechnician,
  deleteJob,
  getJobAppointments,
  getJobPayment,
} = require('../controllers/jobController');
const { protect, authorize } = require('../middleware/auth');

// All job routes require authentication
router.use(protect);

router.get('/', getJobs);
router.post('/', authorize('admin', 'customer'), createJob);
router.get('/:id', getJobById);
router.put('/:id', authorize('admin'), updateJob);
router.patch('/:id/status', authorize('admin', 'technician'), updateJobStatus);
router.patch('/:id/assign', authorize('admin'), assignTechnician);
router.delete('/:id', authorize('admin'), deleteJob);
router.get('/:id/appointments', getJobAppointments);
router.get('/:id/payment', getJobPayment);

module.exports = router;
