/**
 * ============================================================================
 * k6 Load Test: 100 Concurrent Virtual Users Simulation
 * ============================================================================
 *
 * Objective:
 *   Simulate realistic traffic with 100 concurrent virtual users browsing events,
 *   inspecting interactive seat layouts, locking seats in Redis, and executing
 *   simulated checkout confirmations.
 *
 * Load Profile:
 *   - Ramp-up: 0 -> 100 VUs over 1 minute
 *   - Sustained Load: 100 VUs for 2 minutes
 *   - Ramp-down: 100 -> 0 VUs over 30 seconds
 *   (Supports QUICK=true for 1-minute validation)
 *
 * Target Metrics & Thresholds:
 *   - Total HTTP Requests & Requests Per Second
 *   - Average Response Time (< 800ms)
 *   - p90 Latency (< 1000ms)
 *   - p95 Latency (< 1500ms)
 *   - Failed Request Percentage (< 5%)
 *   - HTTP Error Counts (Counter)
 *   - Booking Success & Failure Counts (Counters)
 *   - Duplicate / Conflict Lock Attempts (Counter)
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import {
  BASE_URL,
  CONFIG,
  customMetrics,
  getHeaders,
  registerOrLogin,
  getOrCreateTestVenue,
  getOrCreateTestEvent,
  assertSafety,
} from './config.js';

// Safety verification against accidental production targets
assertSafety('load-test.js');

const isQuick = __ENV.QUICK === 'true';

export const options = {
  stages: isQuick
    ? [
        { duration: '15s', target: 20 },
        { duration: '30s', target: 100 },
        { duration: '15s', target: 0 },
      ]
    : [
        { duration: __ENV.RAMP_UP || '1m', target: 100 },
        { duration: __ENV.HOLD_LOAD || '2m', target: 100 },
        { duration: __ENV.RAMP_DOWN || '30s', target: 0 },
      ],
  thresholds: {
    // Latency thresholds (configurable via environment variables)
    http_req_duration: [
      `p(90)<${CONFIG.thresholds.p90ResponseTime}`,
      `p(95)<${CONFIG.thresholds.p95ResponseTime}`,
      `avg<${CONFIG.thresholds.avgResponseTime}`,
    ],
    // Failed request percentage threshold
    http_req_failed: [`rate<${CONFIG.thresholds.errorRate}`],
    // Booking transaction duration trend
    booking_duration: ['p(95)<2000'],
  },
};

/**
 * Setup Phase: Ensure dedicated test venue and event exist with available seats
 */
export function setup() {
  console.log(`[Load Test Setup]: Initializing 100-VU load test against ${BASE_URL}`);

  // Authenticate admin user
  const adminToken = registerOrLogin(
    CONFIG.adminUser.name,
    CONFIG.adminUser.email,
    CONFIG.adminUser.password
  );

  if (!adminToken) {
    throw new Error('[Load Test Aborted]: Failed to authenticate admin user for test setup.');
  }

  // Ensure dedicated test venue exists
  const venueId = getOrCreateTestVenue(adminToken);
  if (!venueId) {
    throw new Error('[Load Test Aborted]: Failed to acquire or create test venue.');
  }

  // Ensure dedicated fresh test event exists with 100 generated seats for this benchmark run
  const freshEventTitle = `[TEST-LOAD] 100-VU Benchmark Concert - ${Date.now()}`;
  const eventId = getOrCreateTestEvent(adminToken, venueId, freshEventTitle);
  if (!eventId) {
    throw new Error('[Load Test Aborted]: Failed to acquire or create test event.');
  }

  console.log(`[Load Test Setup]: Test Venue ID: ${venueId}`);
  console.log(`[Load Test Setup]: Test Event ID: ${eventId}`);

  return { venueId, eventId, adminToken };
}

/**
 * Default VU Execution: Simulated Attendee Journey
 */
export default function (data) {
  const vuId = __VU;
  const iterId = __ITER;

  // Derive per-VU unique user credentials to ensure isolated authenticated sessions
  const userEmail = `${CONFIG.testUserPrefix}load_vu_${vuId}@test.local`;
  const userName = `Load User VU ${vuId}`;
  const token = registerOrLogin(userName, userEmail, CONFIG.testUserPassword);

  if (!token) {
    customMetrics.httpErrors.add(1);
    sleep(1);
    return;
  }

  const headers = getHeaders(token);
  const eventId = data.eventId;

  // 1. Browse All Events
  group('01. Browse Events Feed', () => {
    const res = http.get(`${BASE_URL}/api/events`, { headers });
    const ok = check(res, {
      'events listing status is 200': (r) => r.status === 200,
    });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  sleep(Math.random() * 0.5 + 0.5);

  // 2. View Target Event Details & Seat Map
  let availableSeats = [];
  group('02. View Event & Seat Availability', () => {
    const eventRes = http.get(`${BASE_URL}/api/events/${eventId}`, { headers });
    check(eventRes, {
      'event details status is 200': (r) => r.status === 200,
    });

    const availRes = http.get(`${BASE_URL}/api/events/${eventId}/available-seats`, { headers });
    const ok = check(availRes, {
      'available seats status is 200': (r) => r.status === 200,
    });

    if (ok) {
      try {
        const body = availRes.json();
        if (Array.isArray(body.data)) {
          availableSeats = body.data;
        }
      } catch (e) {}
    } else {
      customMetrics.httpErrors.add(1);
    }
  });

  sleep(Math.random() * 0.5 + 0.5);

  // 3. Simulated Seat Selection & Booking Attempt
  // VUs select a seat and attempt to lock & checkout
  if (availableSeats.length > 0) {
    // Pick a seat (distribute across available seats)
    const targetSeat = availableSeats[Math.floor(Math.random() * availableSeats.length)];

    group('03. Lock & Confirm Seat Booking', () => {
      // Step A: Attempt temporary Redis Lock (5 min TTL)
      const lockPayload = JSON.stringify({
        eventId,
        seatIds: [targetSeat.id],
      });

      const lockStart = Date.now();
      const lockRes = http.post(`${BASE_URL}/api/bookings/lock`, lockPayload, { headers });
      customMetrics.lockDuration.add(Date.now() - lockStart);

      if (lockRes.status === 200) {
        customMetrics.lockSuccess.add(1);

        // Step B: User Think Time (Simulating payment details entry)
        sleep(1);

        // Step C: Confirm Booking with simulated payment (No real charges)
        const confirmPayload = JSON.stringify({
          eventId,
          seatIds: [targetSeat.id],
          paymentMethod: 'CARD',
          simulateFailure: false,
        });

        const bookStart = Date.now();
        const confirmRes = http.post(`${BASE_URL}/api/bookings/confirm`, confirmPayload, { headers });
        customMetrics.bookingDuration.add(Date.now() - bookStart);

        if (confirmRes.status === 201) {
          customMetrics.bookingSuccess.add(1);
          check(confirmRes, {
            'booking confirmed with 201': (r) => r.status === 201,
            'booking has payment status SUCCESS': (r) => {
              try {
                return r.json().data.payment.status === 'SUCCESS';
              } catch (e) {
                return false;
              }
            },
          });
        } else {
          customMetrics.bookingFailure.add(1);
          customMetrics.httpErrors.add(1);
        }
      } else if (lockRes.status === 409) {
        // Seat already locked by another VU or booked - expected concurrency conflict
        customMetrics.lockConflict.add(1);
        customMetrics.duplicateBookingAttempts.add(1);
      } else {
        // Unexpected server error
        customMetrics.httpErrors.add(1);
      }
    });
  }

  // 4. Check User's Personal Booking History
  group('04. Fetch Booking History', () => {
    const res = http.get(`${BASE_URL}/api/bookings/my-bookings`, { headers });
    const ok = check(res, {
      'my-bookings status is 200': (r) => r.status === 200,
    });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  // Pacing pause before next iteration
  sleep(1);
}

export function teardown(data) {
  console.log(`[Load Test Completed]: 100-VU load test finished against ${BASE_URL}`);
}
