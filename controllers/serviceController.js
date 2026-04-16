const Service = require('../models/Service');

// ─── GET /services ───────────────────────────────────────────────────────────
const getServices = async (req, res, next) => {
  try {
    const { category, active } = req.query;
    const filter = {};
    if (category) filter.category = new RegExp(category, 'i');
    if (active !== undefined) filter.isActive = active === 'true';
    else filter.isActive = true; // default: only active services

    const services = await Service.find(filter).sort({ category: 1, name: 1 });
    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (error) {
    next(error);
  }
};

// ─── GET /services/:id ───────────────────────────────────────────────────────
const getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.status(200).json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
};

// ─── GET /services/categories ────────────────────────────────────────────────
const getCategories = async (req, res, next) => {
  try {
    const categories = await Service.distinct('category', { isActive: true });
    res.status(200).json({ success: true, data: categories.sort() });
  } catch (error) {
    next(error);
  }
};

// ─── POST /services ──────────────────────────────────────────────────────────
const createService = async (req, res, next) => {
  try {
    const { name, description, category, basePrice, currency, estimatedDuration, icon } = req.body;
    const service = await Service.create({ name, description, category, basePrice, currency, estimatedDuration, icon });
    res.status(201).json({ success: true, message: 'Service created', data: service });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /services/:id ───────────────────────────────────────────────────────
const updateService = async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.status(200).json({ success: true, message: 'Service updated', data: service });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /services/:id ────────────────────────────────────────────────────
const deleteService = async (req, res, next) => {
  try {
    // Soft delete — just deactivate
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.status(200).json({ success: true, message: 'Service deactivated' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getServices, getServiceById, getCategories, createService, updateService, deleteService };
