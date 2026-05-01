const User = require('../models/User');
const jwt = require('jsonwebtoken');

/** Generate a signed JWT for the given user ID */
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── Register ────────────────────────────────────────────────────────────────
// POST /auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const user = await User.create({ name, email, phone, password, role });
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        workingHours: user.workingHours,
        availableDates: user.availableDates,
        unavailableDates: user.unavailableDates,
        specializations: user.specializations,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
// POST /auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email, isActive: true }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        workingHours: user.workingHours,
        availableDates: user.availableDates,
        unavailableDates: user.unavailableDates,
        specializations: user.specializations,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Logout ──────────────────────────────────────────────────────────────────
// POST /auth/logout  (token invalidation is handled client-side)
const logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// ─── Get current user profile ────────────────────────────────────────────────
// GET /auth/me
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// ─── Update profile ──────────────────────────────────────────────────────────
// PUT /auth/profile
const updateProfile = async (req, res, next) => {
  try {
    const { name, email, phone, avatarUrl, specializations } = req.body;
    
    // If updating email, check for duplicates
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(409).json({ success: false, message: 'Email already in use' });
      }
    }

    const updateFields = {
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(avatarUrl && { avatarUrl }),
      ...(specializations !== undefined && { specializations }),
    };

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );
    res.status(200).json({ success: true, message: 'Profile updated', data: user });
  } catch (error) {
    next(error);
  }
};

// ─── Change password ─────────────────────────────────────────────────────────
// PUT /auth/password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save(); // triggers bcrypt pre-save hook

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── Update technician availability ──────────────────────────────────────────
// PUT /auth/availability
const updateAvailability = async (req, res, next) => {
  try {
    // Only technicians can update availability
    if (req.user.role !== 'technician') {
      return res.status(403).json({ success: false, message: 'Only technicians can set availability' });
    }

    const { workingHours, availableDates, unavailableDates } = req.body;
    const updateData = {};

    if (workingHours) {
      if (!workingHours.startTime || !workingHours.endTime) {
        return res.status(400).json({ success: false, message: 'Both startTime and endTime are required' });
      }
      updateData.workingHours = workingHours;
    }

    if (availableDates) {
      updateData.availableDates = availableDates; // Array of "YYYY-MM-DD"
    }

    if (unavailableDates !== undefined) {
      updateData.unavailableDates = unavailableDates; // Array of "YYYY-MM-DD"
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, logout, getMe, updateProfile, changePassword, updateAvailability };
