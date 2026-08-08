const prisma = require('../config/db');
const { redis, isRedisConnected } = require('../config/redis');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { processSimulatedPayment } = require('../services/payment.service');
const { cleanupExpiredLocks } = require('../services/seat.service');

const LOCK_TTL_SECONDS = 300; // 5 minutes

/**
 * Lock seats temporarily in Redis (TTL: 300 seconds)
 * POST /api/bookings/lock
 */
const lockSeats = async (req, res, next) => {
  try {
    if (!isRedisConnected()) {
      return sendError(res, 'Redis temporary lock service is unavailable. Please try again', 503);
    }

    const { eventId, seatIds } = req.body;

    if (!eventId || typeof eventId !== 'string') {
      return sendError(res, 'Event ID is required', 400);
    }

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return sendError(res, 'At least one seat ID must be provided', 400);
    }

    const uniqueSeatIds = [...new Set(seatIds)];
    if (uniqueSeatIds.length !== seatIds.length) {
      return sendError(res, 'Duplicate seat IDs in request', 400);
    }

    // 1. Verify seats exist in PostgreSQL & check permanent BOOKED status
    const seats = await prisma.seat.findMany({
      where: {
        id: { in: uniqueSeatIds },
        eventId,
      },
    });

    if (seats.length !== uniqueSeatIds.length) {
      return sendError(res, 'One or more specified seats do not exist for this event', 404);
    }

    for (const seat of seats) {
      if (seat.status === 'BOOKED') {
        return sendError(res, `Seat ${seat.row}${seat.seatNumber} is already permanently booked`, 409);
      }
    }

    // 2. Check Redis temporary locks for all requested seats
    const redisKeys = uniqueSeatIds.map((seatId) => `seat_lock:${eventId}:${seatId}`);
    const existingLocks = await redis.mget(...redisKeys);

    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);

    for (let i = 0; i < uniqueSeatIds.length; i++) {
      const lockVal = existingLocks[i];
      if (lockVal) {
        try {
          const lockData = JSON.parse(lockVal);
          if (lockData.userId !== req.user.id) {
            const seatObj = seats.find((s) => s.id === uniqueSeatIds[i]);
            return sendError(
              res,
              `Seat ${seatObj ? seatObj.row + seatObj.seatNumber : uniqueSeatIds[i]} is currently locked by another user`,
              409
            );
          }
        } catch (e) {
          return sendError(res, 'Conflict checking Redis lock', 409);
        }
      }
    }

    // 3. Atomic Multi-Lock Acquisition via Redis Pipeline
    const pipeline = redis.pipeline();
    const lockPayload = JSON.stringify({
      userId: req.user.id,
      eventId,
      lockedAt: now.toISOString(),
      expiresAt: lockExpiresAt.toISOString(),
    });

    for (const key of redisKeys) {
      pipeline.set(key, lockPayload, 'EX', LOCK_TTL_SECONDS);
    }

    const pipelineResults = await pipeline.exec();
    const failedSet = pipelineResults.find(([err]) => err !== null);
    if (failedSet) {
      return sendError(res, 'Failed to acquire temporary Redis seat lock', 500);
    }

    // 4. Update PostgreSQL DB state for database query consistency
    await prisma.seat.updateMany({
      where: {
        id: { in: uniqueSeatIds },
      },
      data: {
        status: 'LOCKED',
        bookedById: req.user.id,
        lockExpiresAt,
      },
    });

    // 5. Broadcast Socket.IO Real-time Event
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('seats_locked', {
          eventId,
          seatIds: uniqueSeatIds,
          lockedById: req.user.id,
          lockExpiresAt: lockExpiresAt.toISOString(),
          timestamp: now.toISOString(),
        });
      }
    } catch (err) {
      // Ignore if socket not ready
    }

    return sendSuccess(res, 'Seats locked successfully for 5 minutes via Redis', {
      eventId,
      seatIds: uniqueSeatIds,
      lockedCount: uniqueSeatIds.length,
      lockExpiresAt: lockExpiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm booking with Payment Simulation & Transaction
 * POST /api/bookings/confirm
 */
const confirmBooking = async (req, res, next) => {
  try {
    if (!isRedisConnected()) {
      return sendError(res, 'Redis lock service is unavailable', 503);
    }

    const { eventId, seatIds, paymentMethod = 'CARD', simulateFailure = false } = req.body;

    if (!eventId || typeof eventId !== 'string') {
      return sendError(res, 'Event ID is required', 400);
    }

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return sendError(res, 'At least one seat ID must be provided', 400);
    }

    const uniqueSeatIds = [...new Set(seatIds)];
    const redisKeys = uniqueSeatIds.map((seatId) => `seat_lock:${eventId}:${seatId}`);

    // 1. Verify User holds the active Redis locks
    const redisLocks = await redis.mget(...redisKeys);

    for (let i = 0; i < uniqueSeatIds.length; i++) {
      const lockVal = redisLocks[i];
      if (!lockVal) {
        return sendError(res, 'Seat lock expired. Please select the seats again.', 409);
      }

      try {
        const lockData = JSON.parse(lockVal);
        if (lockData.userId !== req.user.id) {
          return sendError(res, 'You do not own the active Redis lock for these seats', 403);
        }
      } catch (e) {
        return sendError(res, 'Invalid Redis lock state', 400);
      }
    }

    // 2. Fetch seats & compute total amount
    const seats = await prisma.seat.findMany({
      where: {
        id: { in: uniqueSeatIds },
        eventId,
      },
    });

    if (seats.length !== uniqueSeatIds.length) {
      return sendError(res, 'One or more specified seats do not exist', 404);
    }

    let totalAmount = 0;
    for (const seat of seats) {
      if (seat.status === 'BOOKED') {
        return sendError(res, `Seat ${seat.row}${seat.seatNumber} is already booked`, 409);
      }
      totalAmount += seat.price;
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    // 3. Execute Payment Simulation
    const paymentResult = await processSimulatedPayment({
      amount: totalAmount,
      paymentMethod,
      simulateFailure,
    });

    // 4. Handle Payment FAILURE
    if (!paymentResult.success) {
      // Remove Redis lock keys
      await redis.del(...redisKeys);

      // Reset PostgreSQL seat status to AVAILABLE
      await prisma.seat.updateMany({
        where: { id: { in: uniqueSeatIds } },
        data: {
          status: 'AVAILABLE',
          bookedById: null,
          lockExpiresAt: null,
        },
      });

      // Broadcast seats_released event
      try {
        const { getIO } = require('../socket');
        const io = getIO();
        if (io) {
          io.emit('seats_released', {
            reason: 'payment_failed',
            seatIds: uniqueSeatIds,
            eventId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        // Ignore if socket not ready
      }

      return sendError(res, paymentResult.message, 400, {
        transactionId: paymentResult.transactionId,
        paymentStatus: 'FAILED',
      });
    }

    // 5. Handle Payment SUCCESS: Execute PostgreSQL Transaction
    const booking = await prisma.$transaction(async (tx) => {
      // Update seats to BOOKED
      await tx.seat.updateMany({
        where: { id: { in: uniqueSeatIds } },
        data: {
          status: 'BOOKED',
          lockExpiresAt: null,
        },
      });

      // Create Booking record
      const newBooking = await tx.booking.create({
        data: {
          userId: req.user.id,
          eventId,
          bookingStatus: 'CONFIRMED',
          totalAmount,
          bookingSeats: {
            create: uniqueSeatIds.map((seatId) => ({ seatId })),
          },
          payment: {
            create: {
              amount: totalAmount,
              currency: 'USD',
              status: 'SUCCESS',
              transactionId: paymentResult.transactionId,
              paymentMethod: paymentResult.paymentMethod,
            },
          },
        },
        include: {
          bookingSeats: {
            include: {
              seat: true,
            },
          },
          event: {
            select: { id: true, title: true, date: true, price: true },
          },
          payment: true,
        },
      });

      // Decrement available tickets
      await tx.event.update({
        where: { id: eventId },
        data: {
          availableTickets: {
            decrement: uniqueSeatIds.length,
          },
        },
      });

      return newBooking;
    });

    // 6. Remove Redis Lock Keys after successful booking
    await redis.del(...redisKeys);

    // 7. Broadcast Socket.IO seats_booked Event
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('seats_booked', {
          eventId,
          seatIds: uniqueSeatIds,
          userId: req.user.id,
          bookingId: booking.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      // Ignore if socket not ready
    }

    return sendSuccess(res, 'Demo Payment successful and booking confirmed', booking, 201);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, error.statusCode);
    }
    next(error);
  }
};

/**
 * Cancel Redis locked seats immediately
 * POST /api/bookings/cancel
 */
const cancelLock = async (req, res, next) => {
  try {
    const { eventId, seatIds } = req.body;

    if (!Array.isArray(seatIds) || seatIds.length === 0) {
      return sendError(res, 'At least one seat ID must be provided to cancel lock', 400);
    }

    const uniqueSeatIds = [...new Set(seatIds)];
    const keysToDelete = [];

    if (eventId) {
      for (const seatId of uniqueSeatIds) {
        keysToDelete.push(`seat_lock:${eventId}:${seatId}`);
      }
    }

    // Release Redis Keys
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }

    // Release PostgreSQL DB status
    await prisma.seat.updateMany({
      where: {
        id: { in: uniqueSeatIds },
        status: 'LOCKED',
        bookedById: req.user.id,
      },
      data: {
        status: 'AVAILABLE',
        bookedById: null,
        lockExpiresAt: null,
      },
    });

    // Real-time WebSocket event broadcast
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.emit('seats_released', {
          reason: 'user_cancelled',
          seatIds: uniqueSeatIds,
          releasedById: req.user.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      // Ignore if socket not ready
    }

    return sendSuccess(res, 'Seat locks released successfully from Redis', {
      releasedCount: uniqueSeatIds.length,
      seatIds: uniqueSeatIds,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get booking history for authenticated user
 * GET /api/bookings/my-bookings
 */
const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        event: {
          include: {
            venue: true,
          },
        },
        bookingSeats: {
          include: {
            seat: true,
          },
        },
        payment: true,
      },
    });

    return sendSuccess(res, 'User booking history retrieved successfully', bookings);
  } catch (error) {
    next(error);
  }
};

/**
 * Get payment details by paymentId
 * GET /api/payments/:paymentId
 */
const getPaymentDetails = async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ id: paymentId }, { transactionId: paymentId }],
      },
      include: {
        booking: {
          include: {
            event: { select: { id: true, title: true, date: true } },
            bookingSeats: { include: { seat: true } },
          },
        },
      },
    });

    if (!payment) {
      return sendError(res, 'Payment record not found', 404);
    }

    if (payment.booking.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, 'You are not authorized to view this payment', 403);
    }

    return sendSuccess(res, 'Payment details retrieved successfully', payment);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  lockSeats,
  confirmBooking,
  cancelLock,
  getMyBookings,
  getPaymentDetails,
};
