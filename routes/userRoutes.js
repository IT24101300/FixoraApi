const express = require('express');
const router = express.Router();

const {
  getTechnicians,
  getAllUsers,
  getUserById,
  createUser,
  loginUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');

const { protect, authorize } = require('../middleware/auth');

// ─── Public Routes ──────────────────────────────────────────────────────────
router.post('/register', createUser);
router.post('/login', loginUser);

// ─── Protected Routes ───────────────────────────────────────────────────────
router.get('/technicians', protect, getTechnicians);
router.get('/', protect, authorize('admin'), getAllUsers);

// GET  /api/users/:id       →  Retrieve a single user by ID
router.get('/:id', protect, getUserById);

// PUT  /api/users/:id       →  Update user details by ID
router.put('/:id', protect, updateUser);

// DELETE /api/users/:id     →  Soft-delete a user by ID (Admin only)
router.delete('/:id', protect, authorize('admin'), deleteUser);

module.exports = router;
