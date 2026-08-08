const prisma = require('../config/db');
const { redis, redisSub } = require('../config/redis');

/**
 * Generate 100 seats for an event across Rows A-J (10 seats per row)
 * - Rows A-B: VIP (1.5x base price)
 * - Rows C-F: Premium (1.2x base price)
 * - Rows G-J: Regular (1.0x base price)
 */
const generateSeatsForEvent = async (eventId, basePrice) => {
  const rowConfig = [
    { rows: ['A', 'B'], type: 'VIP', priceMultiplier: 1.5 },
    { rows: ['C', 'D', 'E', 'F'], type: 'Premium', priceMultiplier: 1.2 },
    { rows: ['G', 'H', 'I', 'J'], type: 'Regular', priceMultiplier: 1.0 },
  ];

  const seatsToCreate = [];

  for (const config of rowConfig) {
    for (const row of config.rows) {
      for (let seatNumber = 1; seatNumber <= 10; seatNumber++) {
        seatsToCreate.push({
          eventId,
          row,
          seatNumber,
          type: config.type,
          price: Math.round(basePrice * config.priceMultiplier * 100) / 100,
          status: 'AVAILABLE',
          lockExpiresAt: null,
          bookedById: null,
        });
      }
    }
  }

  await prisma.seat.createMany({
    data: seatsToCreate,
    skipDuplicates: true,
  });

  return seatsToCreate.length;
};

/**
 * Initialize Redis Keyspace Event Subscriber for native TTL Expired Locks
 * Pattern: seat_lock:{eventId}:{seatId}
 */
const initRedisKeyspaceListener = async () => {
  try {
    // Enable keyspace events on Redis server
    await redis.config('SET', 'notify-keyspace-events', 'KEA').catch((err) => {
      console.warn('[Redis Config Warning]: Could not set notify-keyspace-events via command:', err.message);
    });

    // Subscribe to expired key events on db 0
    await redisSub.subscribe('__keyevent@0__:expired');

    redisSub.on('message', async (channel, message) => {
      if (channel === '__keyevent@0__:expired' && message.startsWith('seat_lock:')) {
        // Format: seat_lock:{eventId}:{seatId}
        const parts = message.split(':');
        if (parts.length === 3) {
          const eventId = parts[1];
          const seatId = parts[2];

          console.log(`[Redis Expiration Event]: Lock expired for seat ${seatId} on event ${eventId}`);

          // Update PostgreSQL DB state to AVAILABLE
          try {
            await prisma.seat.updateMany({
              where: {
                id: seatId,
                status: 'LOCKED',
              },
              data: {
                status: 'AVAILABLE',
                bookedById: null,
                lockExpiresAt: null,
              },
            });

            // Emit Socket.IO real-time event
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
              io.emit('seats_released', {
                reason: 'lock_expired',
                seatIds: [seatId],
                eventId,
                timestamp: new Date().toISOString(),
              });
            }
          } catch (dbErr) {
            console.error('[Redis Expiration Error]: Failed to sync DB status:', dbErr.message);
          }
        }
      }
    });

    console.log('[Redis Service]: Native TTL Keyspace expiration listener initialized');
  } catch (error) {
    console.error('[Redis Keyspace Error]:', error.message);
  }
};

/**
 * Helper fallback cleanup task (syncs PostgreSQL if Redis keys expire offline)
 */
const cleanupExpiredLocks = async () => {
  try {
    const now = new Date();

    const expiredSeats = await prisma.seat.findMany({
      where: {
        status: 'LOCKED',
        lockExpiresAt: {
          lte: now,
        },
      },
      select: { id: true, eventId: true },
    });

    if (expiredSeats.length > 0) {
      const expiredIds = expiredSeats.map((s) => s.id);

      await prisma.seat.updateMany({
        where: { id: { in: expiredIds } },
        data: {
          status: 'AVAILABLE',
          lockExpiresAt: null,
          bookedById: null,
        },
      });

      try {
        const { getIO } = require('../socket');
        const io = getIO();
        if (io) {
          io.emit('seats_released', {
            reason: 'lock_expired',
            seatIds: expiredIds,
            timestamp: now.toISOString(),
          });
        }
      } catch (err) {
        // Socket.io not ready
      }
    }
  } catch (error) {
    console.error('[Seat Service]: Error during DB fallback cleanup:', error.message);
  }
};

let cleanupInterval = null;
const startLockCleanupTask = (intervalMs = 10000) => {
  initRedisKeyspaceListener();
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupExpiredLocks, intervalMs);
  }
};

const stopLockCleanupTask = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

module.exports = {
  generateSeatsForEvent,
  cleanupExpiredLocks,
  startLockCleanupTask,
  stopLockCleanupTask,
  initRedisKeyspaceListener,
};
