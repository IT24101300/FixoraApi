const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware — verifies the JWT from the Authorization header.
 * Attaches the authenticated user object to req.user on success.
 */
const protect = async (req, res, next) => {
  let token;

  // Extract Bearer token from the Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  try {
    // Verify token and decode payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request (exclude password)
    req.user = await User.findById(decoded.id).select('-password -__v');

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: 'User account no longer active' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }
};

/**
 * Authorize middleware — restricts access to specific roles.
 * Must be used after the `protect` middleware.
 * @param {...string} roles - Allowed roles (e.g., 'admin', 'user').
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not permitted to access this resource`,
      });
    }
    next();
  };
};

module.exports = { protect, authorize };
