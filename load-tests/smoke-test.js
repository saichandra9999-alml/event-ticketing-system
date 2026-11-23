/**
 * ============================================================================
 * k6 Smoke Test: Baseline API Availability & Sanity Verification
 * ============================================================================
 *
 * Objective:
 *   Verify that all primary HTTP endpoints are reachable, return valid JSON,
 *   respond with expected status codes, and maintain minimal baseline latencies
 *   before launching higher-load tests.
 *
 * Target Workload:
 *   - Virtual Users (VUs): 1 (minimal single-user sanity check)
 *   - Duration: 15s (or configurable via DURATION / VUS)
 *
 * Safety:
 *   - Non-destructive read and authentication operations only.
 *   - Does not lock seats or generate bookings.
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import {
  BASE_URL,
  CONFIG,
  customMetrics,
  getHeaders,
  registerOrLogin,
  assertSafety,
} from './config.js';

// Enforce test environment safety check
assertSafety('smoke-test.js');

export const options = {
  vus: parseInt(__ENV.VUS || '1', 10),
  duration: __ENV.DURATION || '15s',
  thresholds: {
    // 95% of requests must complete under 500ms
    http_req_duration: ['p(95)<500', 'avg<300'],
    // Less than 1% failure rate
    http_req_failed: ['rate<0.01'],
    // Zero unhandled HTTP errors allowed during smoke test
    http_errors: ['count==0'],
  },
};

export function setup() {
  console.log(`[Smoke Test Setup]: Targeting ${BASE_URL}`);

  // Health check verification
  const healthRes = http.get(`${BASE_URL}/api/health`, { headers: getHeaders() });
  const healthOk = check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'health check returns operational status': (r) => {
      try {
        return r.json().data.status === 'OK';
      } catch (e) {
        return false;
      }
    },
  });

  if (!healthOk) {
    customMetrics.httpErrors.add(1);
    throw new Error(`[Smoke Test Aborted]: Health check failed at ${BASE_URL}/api/health (Status: ${healthRes.status})`);
  }

  // Obtain test user token
  const testEmail = `${CONFIG.testUserPrefix}smoke@test.local`;
  const token = registerOrLogin('Smoke Test User', testEmail, CONFIG.testUserPassword);

  if (!token) {
    customMetrics.httpErrors.add(1);
    throw new Error('[Smoke Test Aborted]: Failed to obtain valid authentication token.');
  }

  return { token, testEmail };
}

export default function (data) {
  const token = data.token;
  const headers = getHeaders(token);

  // 1. Health Endpoint
  group('01. Health Check Endpoint', () => {
    const res = http.get(`${BASE_URL}/api/health`, { headers: getHeaders() });
    const ok = check(res, {
      'health status is 200': (r) => r.status === 200,
      'health response has success true': (r) => {
        try {
          return r.json().success === true;
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  // 2. Authentication Profile Check
  group('02. Authenticated Profile Endpoint', () => {
    const res = http.get(`${BASE_URL}/api/auth/profile`, { headers });
    const ok = check(res, {
      'profile status is 200': (r) => r.status === 200,
      'profile email matches test account': (r) => {
        try {
          return r.json().data.email === data.testEmail;
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  // 3. Venues Listing
  group('03. Venues Listing Endpoint', () => {
    const res = http.get(`${BASE_URL}/api/venues`, { headers });
    const ok = check(res, {
      'venues status is 200': (r) => r.status === 200,
      'venues data is an array': (r) => {
        try {
          return Array.isArray(r.json().data);
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  // 4. Events Listing & Seat Query
  let eventId = null;
  group('04. Events Listing Endpoint', () => {
    const res = http.get(`${BASE_URL}/api/events`, { headers });
    const ok = check(res, {
      'events status is 200': (r) => r.status === 200,
      'events data is an array': (r) => {
        try {
          return Array.isArray(r.json().data);
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) {
      customMetrics.httpErrors.add(1);
    } else {
      try {
        const events = res.json().data;
        if (events && events.length > 0) {
          eventId = events[0].id;
        }
      } catch (e) {}
    }
  });

  // 5. Event Details & Seat Layout (if event exists)
  if (eventId) {
    group('05. Event Details & Seat Layout Endpoints', () => {
      // Event Details
      const detailRes = http.get(`${BASE_URL}/api/events/${eventId}`, { headers });
      const detailOk = check(detailRes, {
        'event detail status is 200': (r) => r.status === 200,
      });
      if (!detailOk) customMetrics.httpErrors.add(1);

      // Event Full Seat Layout
      const seatsRes = http.get(`${BASE_URL}/api/events/${eventId}/seats`, { headers });
      const seatsOk = check(seatsRes, {
        'seat layout status is 200': (r) => r.status === 200,
        'seat layout contains rows object': (r) => {
          try {
            return typeof r.json().data.rows === 'object';
          } catch (e) {
            return false;
          }
        },
      });
      if (!seatsOk) customMetrics.httpErrors.add(1);

      // Event Available Seats
      const availRes = http.get(`${BASE_URL}/api/events/${eventId}/available-seats`, { headers });
      const availOk = check(availRes, {
        'available seats status is 200': (r) => r.status === 200,
        'available seats is an array': (r) => {
          try {
            return Array.isArray(r.json().data);
          } catch (e) {
            return false;
          }
        },
      });
      if (!availOk) customMetrics.httpErrors.add(1);
    });
  }

  // 6. User Booking History
  group('06. User Booking History Endpoint', () => {
    const res = http.get(`${BASE_URL}/api/bookings/my-bookings`, { headers });
    const ok = check(res, {
      'my-bookings status is 200': (r) => r.status === 200,
      'my-bookings data is an array': (r) => {
        try {
          return Array.isArray(r.json().data);
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) customMetrics.httpErrors.add(1);
  });

  // Brief pacing sleep between iterations
  sleep(1);
}

export function teardown(data) {
  console.log(`[Smoke Test Completed]: Baseline API sanity checks passed for ${BASE_URL}`);
}
