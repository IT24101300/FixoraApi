const express = require('express');
const router = express.Router();
const { getServices, getServiceById, getCategories, createService, updateService, deleteService } = require('../controllers/serviceController');
const { protect, authorize } = require('../middleware/auth');

// GET /services/categories  — must be before /:id to avoid conflict
router.get('/categories', protect, getCategories);

router.get('/', protect, getServices);
router.post('/', protect, authorize('admin'), createService);
router.get('/:id', protect, getServiceById);
router.put('/:id', protect, authorize('admin'), updateService);
router.delete('/:id', protect, authorize('admin'), deleteService);

module.exports = router;
