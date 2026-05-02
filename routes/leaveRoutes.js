const express = require('express');
const router = express.Router();
const { applyLeave, getLeaves, approveLeave, rejectLeave, cancelLeave } = require('../controllers/leaveController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/', authorize('technician'), applyLeave);
router.get('/', authorize('technician', 'admin'), getLeaves);
router.patch('/:id/approve', authorize('admin'), approveLeave);
router.patch('/:id/reject', authorize('admin'), rejectLeave);
router.delete('/:id', authorize('technician', 'admin'), cancelLeave);

module.exports = router;
