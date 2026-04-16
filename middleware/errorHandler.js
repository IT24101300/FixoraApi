/**
 * Global error-handling middleware.
 * Must be registered LAST in Express (after all routes).
 *
 * Handles:
 *  - Mongoose CastError       → 400 Bad Request
 *  - Mongoose ValidationError → 422 Unprocessable Entity
 *  - Mongoose duplicate key   → 409 Conflict
 *  - JWT errors               → 401 Unauthorized
 *  - Unexpected errors        → 500 Internal Server Error
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose: invalid ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field '${err.path}': ${err.value}`;
  }

  // Mongoose: schema validation failures
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // MongoDB: duplicate key (unique constraint)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `A record with this ${field} already exists`;
  }

  // JWT: expired token
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Session expired, please log in again';
  }

  // JWT: malformed token
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  // Log stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${err.stack}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * 404 Not Found middleware.
 * Catches requests to undefined routes.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };
