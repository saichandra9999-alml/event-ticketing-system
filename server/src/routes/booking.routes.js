const express = require('express');
const { lockSeats, confirmBooking, cancelLock, getMyBookings } = require('../controllers/booking.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Booking routes requiring authentication
router.get('/my-bookings', protect, getMyBookings);
router.post('/lock', protect, lockSeats);
router.post('/confirm', protect, confirmBooking);
router.post('/cancel', protect, cancelLock);

module.exports = router;
