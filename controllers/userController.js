const User = require('../models/User');
const jwt = require('jsonwebtoken');

/**
 * Generates a signed JWT for the given user ID.
 * @param {string} id - The user's MongoDB ObjectId.
 * @returns {string} Signed JWT token.
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ─────────────────────────────────────────────
// @desc    Get all technicians (for assignment)
// @route   GET /api/users/technicians
// @access  Private
// ─────────────────────────────────────────────
const getTechnicians = async (req, res, next) => {
  try {
    const technicians = await User.find({ role: 'technician', isActive: true }).select('name email phone avatarUrl');
    res.status(200).json({ success: true, count: technicians.length, data: technicians });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin)
// ─────────────────────────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).select('-__v');
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Get a single user by ID
// @route   GET /api/users/:id
// @access  Private
// ─────────────────────────────────────────────
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-__v');

    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Register / Create a new user
// @route   POST /api/users/register
// @access  Public
// ─────────────────────────────────────────────
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    // Check for duplicate email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role });
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Login user and return JWT
// @route   POST /api/users/login
// @access  Public
// ─────────────────────────────────────────────
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Explicitly select password since it is excluded by default
    const user = await User.findOne({ email, isActive: true }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Update a user by ID
// @route   PUT /api/users/:id
// @access  Private
// ─────────────────────────────────────────────
const updateUser = async (req, res, next) => {
  try {
    // Prevent password update through this endpoint
    const { password, ...updateData } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'User updated successfully', data: user });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────
// @desc    Soft-delete a user by ID
// @route   DELETE /api/users/:id
// @access  Private (Admin)
// ─────────────────────────────────────────────
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTechnicians,
  getAllUsers,
  getUserById,
  createUser,
  loginUser,
  updateUser,
  deleteUser,
};
