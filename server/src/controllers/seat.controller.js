const prisma = require('../config/db');
const { redis, isRedisConnected } = require('../config/redis');
const { sendSuccess, sendError } = require('../utils/responseHandler');

/**
 * Get all seats for an event, grouped by row (enriched with Redis active lock data)
 * GET /api/events/:eventId/seats
 */
const getSeatsByEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Verify Event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return sendError(res, 'Event not found', 404);
    }

    const seats = await prisma.seat.findMany({
      where: { eventId },
      orderBy: [
        { row: 'asc' },
        { seatNumber: 'asc' },
      ],
    });

    // Enrich seats with active Redis temporary locks if Redis is connected
    if (isRedisConnected() && seats.length > 0) {
      const redisKeys = seats.map((seat) => `seat_lock:${eventId}:${seat.id}`);
      const redisLocks = await redis.mget(...redisKeys);

      for (let i = 0; i < seats.length; i++) {
        const lockVal = redisLocks[i];
        if (seats[i].status !== 'BOOKED') {
          if (lockVal) {
            try {
              const lockData = JSON.parse(lockVal);
              seats[i].status = 'LOCKED';
              seats[i].bookedById = lockData.userId;
              seats[i].lockExpiresAt = lockData.expiresAt;
            } catch (e) {
              // Ignore parse error
            }
          } else if (seats[i].status === 'LOCKED') {
            seats[i].status = 'AVAILABLE';
            seats[i].bookedById = null;
            seats[i].lockExpiresAt = null;
          }
        }
      }
    }

    // Group seats by row
    const groupedSeats = {};
    for (const seat of seats) {
      if (!groupedSeats[seat.row]) {
        groupedSeats[seat.row] = [];
      }
      groupedSeats[seat.row].push(seat);
    }

    return sendSuccess(res, 'Event seats retrieved successfully', {
      totalSeats: seats.length,
      rows: groupedSeats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get only AVAILABLE seats for an event
 * GET /api/events/:eventId/available-seats
 */
const getAvailableSeatsByEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return sendError(res, 'Event not found', 404);
    }

    let seats = await prisma.seat.findMany({
      where: {
        eventId,
        status: { not: 'BOOKED' },
      },
      orderBy: [
        { row: 'asc' },
        { seatNumber: 'asc' },
      ],
    });

    // Filter out active Redis locks
    if (isRedisConnected() && seats.length > 0) {
      const redisKeys = seats.map((seat) => `seat_lock:${eventId}:${seat.id}`);
      const redisLocks = await redis.mget(...redisKeys);

      seats = seats.filter((seat, idx) => !redisLocks[idx]);
    }

    return sendSuccess(res, 'Available seats retrieved successfully', seats);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSeatsByEvent,
  getAvailableSeatsByEvent,
};
