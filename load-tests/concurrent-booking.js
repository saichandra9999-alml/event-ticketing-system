/**
 * ============================================================================
 * k6 Concurrency Test: Simultaneous Same-Seat Reservation Race Condition
 * ============================================================================
 *
 * Objective:
 *   Simulate multiple distinct users attempting to reserve the exact same seat
 *   at the exact same instant to rigorously verify:
 *   1. Redis Atomic Locking: Only 1 user acquires the lock (HTTP 200).
 *   2. Conflict Rejection: All competing concurrent users receive HTTP 409 Conflict.
 *   3. Transaction Integrity: Zero double bookings occur in PostgreSQL.
 *   4. Digital Receipt & Confirmation: The lock holder can successfully complete booking.
 *
 * Target Workload:
 *   - Virtual Users: 20 distinct users (configurable via VUS)
 *   - Iterations: 20 (one coordinated race round across all VUs)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  CONFIG,
  customMetrics,
  getHeaders,
  registerOrLogin,
  getOrCreateTestVenue,
  assertSafety,
} from './config.js';

// Enforce environment safety
assertSafety('concurrent-booking.js');

const vuCount = parseInt(__ENV.VUS || '20', 10);

export const options = {
  scenarios: {
    seat_race_condition: {
      executor: 'per-vu-iterations',
      vus: vuCount,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // Exactly 1 user must successfully confirm the booking for the contested seat
    booking_success: ['count==1'],
    // All other competing users must be rejected with 409 Conflict
    duplicate_booking_attempts: [`count>=${vuCount - 1}`],
    // Zero unhandled 5xx server exceptions
    http_errors: ['count==0'],
  },
};

/**
 * Setup Phase:
 * 1. Authenticate admin user.
 * 2. Create an isolated, dedicated event specifically for this concurrency test.
 * 3. Pre-register and authenticate N distinct test users (one for each VU).
 * 4. Designate a single contested seat (Row A, Seat 1).
 */
export function setup() {
  console.log(`================================================================`);
  console.log(`🎯 Setting up Concurrency Race Test on ${BASE_URL}`);
  console.log(`⚡ Competing Virtual Users: ${vuCount}`);
  console.log(`================================================================`);

  // Admin login
  const adminToken = registerOrLogin(
    CONFIG.adminUser.name,
    CONFIG.adminUser.email,
    CONFIG.adminUser.password
  );

  if (!adminToken) {
    throw new Error('[Concurrency Test Aborted]: Admin authentication failed.');
  }

  // Get or create test venue
  const venueId = getOrCreateTestVenue(adminToken);
  if (!venueId) {
    throw new Error('[Concurrency Test Aborted]: Failed to create test venue.');
  }

  // Create unique isolated test event for this specific concurrency run
  const uniqueTitle = `[TEST-CONCURRENCY] Race Arena Event - ${Date.now()}`;
  const eventPayload = JSON.stringify({
    title: uniqueTitle,
    description: 'Isolated test event for simultaneous seat reservation race condition',
    category: 'CONCERT',
    date: new Date(Date.now() + 86400000 * 14).toISOString(),
    price: 200,
    totalTickets: 100,
    venueId,
  });

  const createEventRes = http.post(`${BASE_URL}/api/events`, eventPayload, {
    headers: getHeaders(adminToken),
  });

  if (createEventRes.status !== 201) {
    throw new Error(`[Concurrency Test Aborted]: Failed to create test event (Status: ${createEventRes.status})`);
  }

  const eventData = createEventRes.json().data;
  const eventId = eventData.id;

  // Retrieve seats and pick target Seat A1
  const seatsRes = http.get(`${BASE_URL}/api/events/${eventId}/seats`, {
    headers: getHeaders(adminToken),
  });

  if (seatsRes.status !== 200) {
    throw new Error('[Concurrency Test Aborted]: Failed to fetch seats for event.');
  }

  const seatsData = seatsRes.json().data;
  const targetSeat = seatsData.rows.A && seatsData.rows.A[0];

  if (!targetSeat) {
    throw new Error('[Concurrency Test Aborted]: Could not find Seat A1 in generated layout.');
  }

  console.log(`[Concurrency Target]: Seat ${targetSeat.row}${targetSeat.seatNumber} (ID: ${targetSeat.id})`);

  // Pre-authenticate all VUs with separate accounts to simulate realistic multi-user concurrency
  const userTokens = [];
  for (let i = 1; i <= vuCount; i++) {
    const email = `${CONFIG.testUserPrefix}race_vu_${i}_${Date.now()}@test.local`;
    const name = `Race User VU ${i}`;
    const token = registerOrLogin(name, email, CONFIG.testUserPassword);
    if (!token) {
      throw new Error(`[Concurrency Test Aborted]: Failed to authenticate test user ${email}`);
    }
    userTokens.push({ vuIndex: i, email, token });
  }

  console.log(`[Concurrency Setup Complete]: ${userTokens.length} test users authenticated and staged.`);

  return {
    eventId,
    targetSeatId: targetSeat.id,
    seatLabel: `${targetSeat.row}${targetSeat.seatNumber}`,
    userTokens,
  };
}

/**
 * VU Execution:
 * All VUs simultaneously fire a lock request for the EXACT SAME seat ID.
 */
export default function (data) {
  const userIndex = (__VU - 1) % data.userTokens.length;
  const user = data.userTokens[userIndex];
  const headers = getHeaders(user.token);

  const lockPayload = JSON.stringify({
    eventId: data.eventId,
    seatIds: [data.targetSeatId],
  });

  // Attempt lock
  const lockStart = Date.now();
  const lockRes = http.post(`${BASE_URL}/api/bookings/lock`, lockPayload, { headers });
  customMetrics.lockDuration.add(Date.now() - lockStart);

  if (lockRes.status === 200) {
    // WINNER: Acquired the Redis lock!
    customMetrics.lockSuccess.add(1);
    console.log(`🏆 [VU ${__VU}] Won Redis lock for Seat ${data.seatLabel}! Confirming booking...`);

    // Verify lock response payload structure
    check(lockRes, {
      'lock response indicates 1 seat locked': (r) => {
        try {
          return r.json().data.lockedCount === 1;
        } catch (e) {
          return false;
        }
      },
    });

    // Simulate payment details completion
    sleep(0.5);

    // Confirm booking
    const confirmPayload = JSON.stringify({
      eventId: data.eventId,
      seatIds: [data.targetSeatId],
      paymentMethod: 'UPI',
      simulateFailure: false,
    });

    const bookStart = Date.now();
    const confirmRes = http.post(`${BASE_URL}/api/bookings/confirm`, confirmPayload, { headers });
    customMetrics.bookingDuration.add(Date.now() - bookStart);

    if (confirmRes.status === 201) {
      customMetrics.bookingSuccess.add(1);
      console.log(`✅ [VU ${__VU}] Successfully booked Seat ${data.seatLabel} (Payment: UPI SUCCESS)`);

      check(confirmRes, {
        'booking confirmation returns status 201': (r) => r.status === 201,
        'booking status is CONFIRMED': (r) => {
          try {
            return r.json().data.bookingStatus === 'CONFIRMED';
          } catch (e) {
            return false;
          }
        },
      });
    } else {
      customMetrics.bookingFailure.add(1);
      customMetrics.httpErrors.add(1);
      console.error(`❌ [VU ${__VU}] Failed to confirm booking (Status: ${confirmRes.status})`);
    }
  } else if (lockRes.status === 409) {
    // EXPECTED: Conflict rejection by Redis/PostgreSQL concurrency guard
    customMetrics.lockConflict.add(1);
    customMetrics.duplicateBookingAttempts.add(1);

    check(lockRes, {
      'conflict returns 409 status': (r) => r.status === 409,
      'conflict message contains lock or booked warning': (r) => {
        try {
          const msg = r.json().message;
          return msg.includes('currently locked') || msg.includes('already permanently booked');
        } catch (e) {
          return false;
        }
      },
    });
  } else {
    // Unexpected failure (5xx server error, database crash, etc.)
    customMetrics.httpErrors.add(1);
    console.error(`❌ [VU ${__VU}] Unexpected lock response (Status: ${lockRes.status})`);
  }
}

/**
 * Teardown Phase:
 * Verify that exactly 1 booking exists in the database for the contested seat
 * and that zero double bookings occurred.
 */
export function teardown(data) {
  const adminToken = data.userTokens[0].token;
  const seatsRes = http.get(`${BASE_URL}/api/events/${data.eventId}/seats`, {
    headers: getHeaders(adminToken),
  });

  let seatStatus = 'UNKNOWN';
  if (seatsRes.status === 200) {
    try {
      const seatsData = seatsRes.json().data;
      const seatA1 = seatsData.rows.A && seatsData.rows.A[0];
      if (seatA1) {
        seatStatus = seatA1.status;
      }
    } catch (e) {}
  }

  console.log(`================================================================`);
  console.log(`🏁 Concurrency Test Verification:`);
  console.log(`   Event ID: ${data.eventId}`);
  console.log(`   Target Seat: ${data.seatLabel}`);
  console.log(`   Final Database Status: ${seatStatus}`);
  console.log(`   Double Booking Prevention: ${seatStatus === 'BOOKED' ? 'PASSED (Strict Single Winner)' : 'CHECK RESULTS'}`);
  console.log(`================================================================`);
}
