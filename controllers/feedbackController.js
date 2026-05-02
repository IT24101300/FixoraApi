const Feedback = require('../models/Feedback');
const Job = require('../models/Job');

// ─── GET /feedback/eligible-jobs ────────────────────────────────────────────
const getEligibleJobsForFeedback = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can view eligible jobs for feedback' });
    }

    const jobs = await Job.find({
      customerId: req.user._id,
      status: 'completed',
      technicianId: { $ne: null },
    })
      .select('title technicianId completedAt updatedAt createdAt')
      .populate('technicianId', 'name email')
      .sort({ updatedAt: -1 });

    const jobIds = jobs.map((job) => job._id);
    const existingFeedback = await Feedback.find({ jobId: { $in: jobIds } }).select('jobId');
    const feedbackJobIdSet = new Set(existingFeedback.map((f) => f.jobId.toString()));

    const eligibleJobs = jobs.filter((job) => !feedbackJobIdSet.has(job._id.toString()));

    res.status(200).json({
      success: true,
      count: eligibleJobs.length,
      data: eligibleJobs,
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /feedback ──────────────────────────────────────────────────────────
const createFeedback = async (req, res, next) => {
  try {
    const { jobId, rating, comment, tags } = req.body;

    // Verify job exists and is completed
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (job.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Feedback can only be submitted for completed jobs' });
    }

    // Only the job's customer can leave feedback
    if (job.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the customer of this job can submit feedback' });
    }

    const feedback = await Feedback.create({
      jobId,
      customerId: req.user._id,
      technicianId: job.technicianId,
      rating,
      comment,
      tags: tags || [],
    });

    res.status(201).json({ success: true, message: 'Feedback submitted successfully', data: feedback });
  } catch (error) {
    next(error);
  }
};

// ─── GET /feedback/job/:jobId ────────────────────────────────────────────────
const getFeedbackByJob = async (req, res, next) => {
  try {
    const feedback = await Feedback.findOne({ jobId: req.params.jobId })
      .populate('customerId', 'name')
      .populate('technicianId', 'name');
    if (!feedback) return res.status(404).json({ success: false, message: 'No feedback for this job' });
    res.status(200).json({ success: true, data: feedback });
  } catch (error) {
    next(error);
  }
};

// ─── GET /feedback/technician/:technicianId ───────────────────────────────────
const getFeedbackByTechnician = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [feedbacks, total] = await Promise.all([
      Feedback.find({ technicianId: req.params.technicianId })
        .populate('customerId', 'name')
        .populate('jobId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Feedback.countDocuments({ technicianId: req.params.technicianId }),
    ]);

    // Calculate average rating
    const avgResult = await Feedback.aggregate([
      { $match: { technicianId: require('mongoose').Types.ObjectId.createFromHexString(req.params.technicianId) } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const avgRating = avgResult[0]?.avgRating?.toFixed(1) || '0.0';

    res.status(200).json({
      success: true,
      data: feedbacks,
      total,
      page: Number(page),
      limit: Number(limit),
      averageRating: parseFloat(avgRating),
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /feedback/my  (current user's submitted feedback) ───────────────────
const getMyFeedback = async (req, res, next) => {
  try {
    const feedbacks = await Feedback.find({ customerId: req.user._id })
      .populate('jobId', 'title')
      .populate('technicianId', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: feedbacks.length, data: feedbacks });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFeedback,
  getFeedbackByJob,
  getFeedbackByTechnician,
  getMyFeedback,
  getEligibleJobsForFeedback,
};
