const express = require('express');
const router = express.Router();
const {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  updateTicketStatus,
  sendMessage,
  closeTicket,
} = require('../controllers/supportController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/tickets', getTickets);
router.post('/tickets', createTicket);
router.get('/tickets/:id', getTicketById);
router.put('/tickets/:id', updateTicket);
router.patch('/tickets/:id/status', authorize('admin'), updateTicketStatus);
router.post('/tickets/:id/messages', sendMessage);
router.patch('/tickets/:id/close', authorize('admin', 'customer'), closeTicket);

module.exports = router;
