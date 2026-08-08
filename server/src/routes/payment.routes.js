const express = require('express');
const { getPaymentDetails } = require('../controllers/booking.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// GET /api/payments/:paymentId
router.get('/:paymentId', protect, getPaymentDetails);

module.exports = router;
