const express = require('express');
const { createVenue, getVenues, getVenueById } = require('../controllers/venue.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Public routes
router.get('/', getVenues);
router.get('/:id', getVenueById);

// Protected routes
router.post('/', protect, createVenue);

module.exports = router;
