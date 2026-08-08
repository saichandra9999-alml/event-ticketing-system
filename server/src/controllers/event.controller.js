const prisma = require('../config/db');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { generateSeatsForEvent } = require('../services/seat.service');

/**
 * Create a new Event
 * POST /api/events
 */
const createEvent = async (req, res, next) => {
  try {
    const { title, description, category, date, price, totalTickets, imageUrl, venueId } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return sendError(res, 'Event title is required', 400);
    }

    if (!description || typeof description !== 'string' || description.trim() === '') {
      return sendError(res, 'Event description is required', 400);
    }

    if (!date || isNaN(Date.parse(date))) {
      return sendError(res, 'Valid event date is required', 400);
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return sendError(res, 'Valid non-negative price is required', 400);
    }

    const parsedTotalTickets = parseInt(totalTickets, 10);
    if (isNaN(parsedTotalTickets) || parsedTotalTickets <= 0) {
      return sendError(res, 'Valid total tickets capacity is required', 400);
    }

    if (!venueId) {
      return sendError(res, 'Venue ID is required', 400);
    }

    // Verify Venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    });

    if (!venue) {
      return sendError(res, 'Specified Venue does not exist', 404);
    }

    const event = await prisma.event.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        category: category ? category.trim().toUpperCase() : 'CONCERT',
        date: new Date(date),
        price: parsedPrice,
        totalTickets: parsedTotalTickets,
        availableTickets: parsedTotalTickets,
        imageUrl: imageUrl || null,
        venueId,
        createdById: req.user.id,
      },
      include: {
        venue: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Automatically generate 100 default seats for the event (Rows A-J)
    await generateSeatsForEvent(event.id, parsedPrice);

    return sendSuccess(res, 'Event created successfully', event, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all Events (with optional category & search filter)
 * GET /api/events
 */
const getEvents = async (req, res, next) => {
  try {
    const { category, search, venueId } = req.query;

    const whereClause = {};

    if (category) {
      whereClause.category = category.trim().toUpperCase();
    }

    if (venueId) {
      whereClause.venueId = venueId;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        venue: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    return sendSuccess(res, 'Events retrieved successfully', events);
  } catch (error) {
    next(error);
  }
};

/**
 * Get Event by ID
 * GET /api/events/:id
 */
const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        venue: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!event) {
      return sendError(res, 'Event not found', 404);
    }

    return sendSuccess(res, 'Event details retrieved successfully', event);
  } catch (error) {
    next(error);
  }
};

/**
 * Update Event by ID
 * PUT /api/events/:id
 */
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, category, date, price, totalTickets, imageUrl } = req.body;

    const existingEvent = await prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      return sendError(res, 'Event not found', 404);
    }

    // Check ownership/permissions
    if (existingEvent.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'You are not authorized to update this event', 403);
    }

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description) updateData.description = description.trim();
    if (category) updateData.category = category.trim().toUpperCase();
    if (date && !isNaN(Date.parse(date))) updateData.date = new Date(date);
    if (price !== undefined) updateData.price = parseFloat(price);
    if (totalTickets !== undefined) {
      const newTotal = parseInt(totalTickets, 10);
      const diff = newTotal - existingEvent.totalTickets;
      updateData.totalTickets = newTotal;
      updateData.availableTickets = Math.max(0, existingEvent.availableTickets + diff);
    }
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        venue: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return sendSuccess(res, 'Event updated successfully', updatedEvent);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete Event by ID
 * DELETE /api/events/:id
 */
const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existingEvent = await prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      return sendError(res, 'Event not found', 404);
    }

    if (existingEvent.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'You are not authorized to delete this event', 403);
    }

    await prisma.event.delete({
      where: { id },
    });

    return sendSuccess(res, 'Event deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
};
