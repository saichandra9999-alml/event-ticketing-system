const express = require('express');
const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} = require('../controllers/event.controller');
const {
  getSeatsByEvent,
  getAvailableSeatsByEvent,
} = require('../controllers/seat.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Public event routes
router.get('/', getEvents);
router.get('/:id', getEventById);

// Public seat viewing routes
router.get('/:eventId/seats', getSeatsByEvent);
router.get('/:eventId/available-seats', getAvailableSeatsByEvent);

// Protected event routes
router.post('/', protect, createEvent);
router.put('/:id', protect, updateEvent);
router.delete('/:id', protect, deleteEvent);

module.exports = router;
