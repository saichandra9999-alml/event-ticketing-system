const prisma = require('../config/db');
const { sendSuccess, sendError } = require('../utils/responseHandler');

/**
 * Create a new Venue
 * POST /api/venues
 */
const createVenue = async (req, res, next) => {
  try {
    const { name, address, city, capacity, rows, cols } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return sendError(res, 'Venue name is required', 400);
    }

    if (!address || typeof address !== 'string' || address.trim() === '') {
      return sendError(res, 'Venue address is required', 400);
    }

    if (!city || typeof city !== 'string' || city.trim() === '') {
      return sendError(res, 'City is required', 400);
    }

    const parsedCapacity = parseInt(capacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      return sendError(res, 'Valid positive capacity is required', 400);
    }

    const parsedRows = parseInt(rows, 10) || 10;
    const parsedCols = parseInt(cols, 10) || 10;

    const venue = await prisma.venue.create({
      data: {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        capacity: parsedCapacity,
        rows: parsedRows,
        cols: parsedCols,
      },
    });

    return sendSuccess(res, 'Venue created successfully', venue, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all Venues
 * GET /api/venues
 */
const getVenues = async (req, res, next) => {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 'Venues retrieved successfully', venues);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Venue by ID
 * GET /api/venues/:id
 */
const getVenueById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        events: true,
      },
    });

    if (!venue) {
      return sendError(res, 'Venue not found', 404);
    }

    return sendSuccess(res, 'Venue details retrieved successfully', venue);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVenue,
  getVenues,
  getVenueById,
};
