const SupportTicket = require('../models/SupportTicket');

const canAccessTicket = (ticket, user) => {
  if (!ticket || !user) return false;
  if (user.role === 'admin') return true;

  const createdBy = ticket.createdBy?._id || ticket.createdBy;
  return createdBy && createdBy.toString() === user._id.toString();
};

// ─── GET /support/tickets ────────────────────────────────────────────────────
const getTickets = async (req, res, next) => {
  try {
    const { status, priority, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    // Customers only see their own tickets
    if (req.user.role === 'customer') filter.createdBy = req.user._id;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (search) {
      filter.$or = [
        { subject: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate('createdBy', 'name email')
        .populate('assignedTo', 'name email')
        .select('-messages') // Exclude messages in list view for performance
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SupportTicket.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: tickets,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /support/tickets/:id ────────────────────────────────────────────────
const getTicketById = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('messages.senderId', 'name email');

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this ticket' });
    }

    res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

// ─── POST /support/tickets ───────────────────────────────────────────────────
const createTicket = async (req, res, next) => {
  try {
    const { subject, description, priority } = req.body;

    const ticket = await SupportTicket.create({
      subject,
      description,
      priority,
      createdBy: req.user._id,
    });

    res.status(201).json({ success: true, message: 'Support ticket created', data: ticket });
  } catch (error) {
    next(error);
  }
};

// ─── PUT /support/tickets/:id ───────────────────────────────────────────────
const updateTicket = async (req, res, next) => {
  try {
    const { subject, description, priority } = req.body;

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    
    // Only the ticket creator (customer) can edit
    const createdById = ticket.createdBy?._id || ticket.createdBy;
    if (createdById.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the ticket creator can edit this ticket' });
    }
    if (ticket.status === 'closed') {
      return res.status(409).json({ success: false, message: 'Closed tickets cannot be edited' });
    }

    if (subject !== undefined) ticket.subject = subject;
    if (description !== undefined) ticket.description = description;
    if (priority !== undefined) ticket.priority = priority;

    await ticket.save();
    await ticket.populate('createdBy', 'name email');
    await ticket.populate('assignedTo', 'name email');
    await ticket.populate('messages.senderId', 'name email');

    res.status(200).json({ success: true, message: 'Ticket updated', data: ticket });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /support/tickets/:id/status ──────────────────────────────────────
const updateTicketStatus = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can update ticket status' });
    }

    const { status } = req.body;
    const allowed = ['open', 'in_progress', 'resolved', 'closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('messages.senderId', 'name email');

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    res.status(200).json({ success: true, message: 'Ticket status updated', data: ticket });
  } catch (error) {
    next(error);
  }
};

// ─── POST /support/tickets/:id/messages ─────────────────────────────────────
const sendMessage = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required' });
    }

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to message on this ticket' });
    }
    if (ticket.status === 'closed') {
      return res.status(409).json({ success: false, message: 'Cannot send message on a closed ticket' });
    }

    const message = { senderId: req.user._id, content: content.trim() };
    ticket.messages.push(message);

    // Re-open resolved tickets when the customer sends a new message
    if (ticket.status === 'resolved' && req.user.role === 'customer') {
      ticket.status = 'open';
    }
    if (ticket.status === 'open' && req.user.role === 'admin') {
      ticket.status = 'in_progress';
    }

    await ticket.save();

    const newMessage = ticket.messages[ticket.messages.length - 1];
    res.status(201).json({
      success: true,
      message: 'Message sent',
      data: {
        id: newMessage._id,
        ticketId: ticket._id,
        senderId: req.user._id,
        senderName: req.user.name,
        content: newMessage.content,
        sentAt: newMessage.sentAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /support/tickets/:id/close ───────────────────────────────────────
const closeTicket = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    if (!canAccessTicket(ticket, req.user)) {
      return res.status(403).json({ success: false, message: 'Not authorized to close this ticket' });
    }

    ticket.status = 'closed';
    await ticket.save();

    await ticket.populate('createdBy', 'name email');
    await ticket.populate('assignedTo', 'name email');
    await ticket.populate('messages.senderId', 'name email');

    res.status(200).json({ success: true, message: 'Ticket closed', data: ticket });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  updateTicketStatus,
  sendMessage,
  closeTicket,
};
