const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * User Schema
 * Defines the structure and validation rules for a user document in MongoDB.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Exclude password from query results by default
    },
    role: {
      type: String,
      enum: ['customer', 'technician', 'admin'],
      default: 'customer',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Technician-specific fields
    workingHours: {
      startTime: {
        type: String, // Format: "HH:mm" (24-hour, e.g., "09:00")
        default: '09:00',
      },
      endTime: {
        type: String, // Format: "HH:mm"
        default: '17:00',
      },
    },
    availableDates: {
      type: [String], // Array of dates in YYYY-MM-DD format
      default: [],
    },
    unavailableDates: {
      type: [String], // Blackout dates in YYYY-MM-DD format
      default: [],
    },
    specializations: {
      type: [String], // Service names the technician handles
      default: [],
    },
    passwordResetCodeHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Pre-save hook: Hash password before saving to the database.
 * Only runs when the password field has been modified.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Instance method: Compare a plain-text password with the stored hashed password.
 * @param {string} candidatePassword - The plain-text password to compare.
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
