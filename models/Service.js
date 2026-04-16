const mongoose = require('mongoose');

/**
 * Service Schema
 * Represents a type of service offered by Fixora (e.g., AC Repair, Plumbing).
 * Used by admins to manage the service catalogue.
 */
const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      // e.g. "Electrical", "Plumbing", "HVAC", "Cleaning", "General"
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    estimatedDuration: {
      type: Number, // minutes
      default: 60,
    },
    icon: {
      type: String, // emoji or icon name for UI
      default: '🔧',
    },
    isActive: {
      type: Boolean,
      default: true,
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

module.exports = mongoose.model('Service', serviceSchema);
