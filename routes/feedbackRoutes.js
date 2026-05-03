const express = require('express');
const router = express.Router();
const {
	createFeedback,
	getFeedbackByJob,
	getFeedbackByTechnician,
	getMyFeedback,
	getEligibleJobsForFeedback,
	getAllFeedback,
} = require('../controllers/feedbackController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/', createFeedback);                                      // Submit feedback for a job
router.get('/all', getAllFeedback);                                     // All feedback (admin only)
router.get('/my', getMyFeedback);                                      // My submitted feedback
router.get('/eligible-jobs', getEligibleJobsForFeedback);              // Completed jobs pending feedback
router.get('/job/:jobId', getFeedbackByJob);                          // Feedback for a specific job
router.get('/technician/:technicianId', getFeedbackByTechnician);     // All feedback for a technician

module.exports = router;
