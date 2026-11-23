/**
 * ============================================================================
 * k6 Stress Test: Extreme Load Scaling (500 -> 1000 Virtual Users)
 * ============================================================================
 *
 * Objective:
 *   Gradually ramp up virtual users to 500 and then 1000 VUs to determine:
 *   1. System breaking points, saturation ceilings, and maximum throughput (RPS).
 *   2. PostgreSQL connection pool behavior and query latency degradation under stress.
 *   3. Redis pipeline performance during heavy atomic multi-seat lock contentions.
 *   4. Graceful recovery characteristics during ramp-down.
 *
 * CRITICAL SAFETY RULES:
 *   - NEVER run this test against production environments.
 *   - Per user instructions: THE 1000-USER STRESS STAGE REQUIRES EXPLICIT USER APPROVAL.
 *     By default, this script runs up to 500 VUs. To enable the 1000-user stage once approved,
 *     pass `-e ALLOW_1000_VUS=true`.
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

// Verify test environment safety
assertSafety('stress-test.js');

const allow1000VUs = __ENV.ALLOW_1000_VUS === 'true';
const isQuick = __ENV.QUICK === 'true';

// Construct stages based on user approval of the 1000-VU phase
function getStages() {
  if (isQuick) {
    if (allow1000VUs) {
      return [
        { duration: '15s', target: 100 },
        { duration: '30s', target: 500 },
        { duration: '30s', target: 1000 },
        { duration: '15s', target: 0 },
      ];
    }
    return [
      { duration: '15s', target: 100 },
      { duration: '30s', target: 500 },
      { duration: '15s', target: 0 },
    ];
  }

  // Standard full stress stages
  if (allow1000VUs) {
    return [
      { duration: '1m', target: 100 },   // Warm-up to 100 VUs
      { duration: '2m', target: 500 },   // Ramp-up to 500 VUs
      { duration: '2m', target: 500 },   // Sustained 500 VUs
      { duration: '2m', target: 1000 },  // Ramp-up to 1000 VUs (Requires approval)
      { duration: '2m', target: 1000 },  // Sustained 1000 VUs
      { duration: '1m', target: 0 },     // Ramp-down recovery
    ];
  }

  // Safe default: Cap at 500 VUs until user explicitly approves 1000-VU phase
  return [
    { duration: '1m', target: 100 },   // Warm-up to 100 VUs
    { duration: '2m', target: 500 },   // Ramp-up to 500 VUs
    { duration: '2m', target: 500 },   // Sustained 500 VUs
    { duration: '1m', target: 0 },     // Ramp-down recovery
  ];
}

export const options = {
  stages: getStages(),
  thresholds: {
    // Under stress, latency degrades gracefully; thresholds track degradation boundaries
    http_req_duration: ['p(95)<3000'],
    // Error rate tolerance under extreme stress (identifies saturation cliff)
    http_req_failed: ['rate<0.20'],
  },
};

/**
 * Setup Phase: Initialize test entities
 */
export function setup() {
  console.log(`================================================================`);
  console.log(`🔥 Starting Stress Test against ${BASE_URL}`);
  if (allow1000VUs) {
    console.log(`⚠️  1000-VU STAGE ENABLED (User Approval Granted)`);
  } else {
    console.log(`ℹ️  Capped at 500 VUs (1000-VU stage requires approval: -e ALLOW_1000_VUS=true)`);
  }
  console.log(`================================================================`);

  // Authenticate admin user
  const adminToken = registerOrLogin(
    CONFIG.adminUser.name,
    CONFIG.adminUser.email,
    CONFIG.adminUser.password
  );

  if (!adminToken) {
    throw new Error('[Stress Test Aborted]: Failed to authenticate admin user.');
  }

  // Ensure dedicated test venue exists
  const venueId = getOrCreateTestVenue(adminToken);
  if (!venueId) {
    throw new Error('[Stress Test Aborted]: Failed to acquire or create test venue.');
  }

  // Ensure dedicated stress test event exists
  const eventId = getOrCreateTestEvent(adminToken, venueId, '[TEST-LOAD] Extreme Stress Concert');
  if (!eventId) {
    throw new Error('[Stress Test Aborted]: Failed to acquire or create test event.');
  }

  return { venueId, eventId, adminToken };
}

/**
 * VU Stress Execution
 */
export default function (data) {
  const vuId = __VU;
  const userEmail = `${CONFIG.testUserPrefix}stress_vu_${vuId}@test.local`;
  const userName = `Stress User VU ${vuId}`;
  const token = registerOrLogin(userName, userEmail, CONFIG.testUserPassword);

  if (!token) {
    customMetrics.httpErrors.add(1);
    sleep(1);
    return;
  }

  const headers = getHeaders(token);
  const eventId = data.eventId;

  // 1. High-frequency reads: View events
  group('01. Stress Browse Events', () => {
    const res = http.get(`${BASE_URL}/api/events`, { headers });
    const ok = check(res, { 'events status is 200': (r) => r.status === 200 });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  // 2. High-frequency reads: View seats
  let availableSeats = [];
  group('02. Stress Seat Availability Inspection', () => {
    const res = http.get(`${BASE_URL}/api/events/${eventId}/available-seats`, { headers });
    const ok = check(res, { 'available seats status is 200': (r) => r.status === 200 });
    if (ok) {
      try {
        const json = res.json();
        if (Array.isArray(json.data)) {
          availableSeats = json.data;
        }
      } catch (e) {}
    } else {
      customMetrics.httpErrors.add(1);
    }
  });

  // 3. Intensive Write Operations: Seat Locking & Booking
  if (availableSeats.length > 0) {
    const seat = availableSeats[Math.floor(Math.random() * availableSeats.length)];

    group('03. Stress Lock & Booking Transaction', () => {
      // Temporary Lock attempt
      const lockPayload = JSON.stringify({
        eventId,
        seatIds: [seat.id],
      });

      const lockStart = Date.now();
      const lockRes = http.post(`${BASE_URL}/api/bookings/lock`, lockPayload, { headers });
      customMetrics.lockDuration.add(Date.now() - lockStart);

      if (lockRes.status === 200) {
        customMetrics.lockSuccess.add(1);

        // Immediate confirmation attempt to test PostgreSQL transaction isolation under stress
        const confirmPayload = JSON.stringify({
          eventId,
          seatIds: [seat.id],
          paymentMethod: 'CARD',
          simulateFailure: false,
        });

        const bookStart = Date.now();
        const confirmRes = http.post(`${BASE_URL}/api/bookings/confirm`, confirmPayload, { headers });
        customMetrics.bookingDuration.add(Date.now() - bookStart);

        if (confirmRes.status === 201) {
          customMetrics.bookingSuccess.add(1);
        } else {
          customMetrics.bookingFailure.add(1);
          customMetrics.httpErrors.add(1);
        }
      } else if (lockRes.status === 409) {
        // High concurrency conflict - expected behavior under stress
        customMetrics.lockConflict.add(1);
        customMetrics.duplicateBookingAttempts.add(1);
      } else {
        // 5xx server crash or unhandled error
        customMetrics.httpErrors.add(1);
      }
    });
  }

  // Pacing pause between stress iterations
  sleep(0.5);
}

export function teardown(data) {
  console.log(`================================================================`);
  console.log(`🏁 Stress test execution completed for ${BASE_URL}`);
  console.log(`================================================================`);
}
