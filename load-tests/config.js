/**
 * ============================================================================
 * k6 Load Testing Configuration & Reusable Helper Module
 * ============================================================================
 *
 * IMPORTANT ARCHITECTURAL NOTE ON PERFORMANCE THRESHOLDS:
 * Passing a performance threshold in k6 does NOT automatically prove production
 * scalability. Local or staging test environments typically lack:
 *   1. Real-world network latency, jitter, and packet loss.
 *   2. Multi-tier load balancing, SSL termination, and reverse proxy overhead.
 *   3. Database connection pool exhaustion under long-tail transaction concurrency.
 *   4. Multi-instance distributed cache synchronizations.
 *   5. Real payment gateway webhooks and third-party rate limits.
 *
 * Performance thresholds serve as regression baselines and stability gates,
 * not absolute guarantees of production capacity.
 */

import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

// Base target URL (defaults to local backend API on port 5000)
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

// Environment-driven test configuration
export const CONFIG = {
  baseUrl: BASE_URL,
  adminUser: {
    name: __ENV.ADMIN_NAME || 'k6 Load Admin',
    email: __ENV.ADMIN_EMAIL || 'k6_admin@test.local',
    password: __ENV.ADMIN_PASSWORD || 'Password123!',
  },
  testUserPrefix: __ENV.USER_PREFIX || 'k6_user_',
  testUserPassword: __ENV.USER_PASSWORD || 'Password123!',
  safety: {
    targetEnv: __ENV.TARGET_ENV || 'local',
    allow1000VUs: __ENV.ALLOW_1000_VUS === 'true',
  },
  thresholds: {
    avgResponseTime: parseInt(__ENV.THRESH_AVG_RESP_TIME || '800', 10),
    p90ResponseTime: parseInt(__ENV.THRESH_P90_RESP_TIME || '1000', 10),
    p95ResponseTime: parseInt(__ENV.THRESH_P95_RESP_TIME || '1500', 10),
    errorRate: parseFloat(__ENV.THRESH_ERROR_RATE || '0.05'),
  },
};

// ============================================================================
// Custom Performance & Concurrency Metrics
// ============================================================================
export const customMetrics = {
  // Counts any unhandled 4xx or 5xx HTTP response (excluding intentional 409 conflicts)
  httpErrors: new Counter('http_errors'),

  // Counts successful ticket booking completions (HTTP 201)
  bookingSuccess: new Counter('booking_success'),

  // Counts failed ticket booking completions (HTTP 4xx/5xx)
  bookingFailure: new Counter('booking_failure'),

  // Counts duplicate booking/locking attempts rejected due to seat concurrency conflicts (HTTP 409)
  duplicateBookingAttempts: new Counter('duplicate_booking_attempts'),

  // Counts successful temporary Redis seat locks (HTTP 200)
  lockSuccess: new Counter('lock_success'),

  // Counts seat locking conflicts rejected by Redis/DB (HTTP 409)
  lockConflict: new Counter('lock_conflict'),

  // Trend tracking response duration for booking confirmation transactions
  bookingDuration: new Trend('booking_duration', true),

  // Trend tracking response duration for Redis seat locking requests
  lockDuration: new Trend('lock_duration', true),
};

// ============================================================================
// Helper Utilities & API Wrappers
// ============================================================================

/**
 * Build HTTP headers with optional JWT Authorization Bearer token
 * @param {string|null} token
 * @returns {object}
 */
export function getHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Register a user account
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {object} k6 response
 */
export function registerUser(name, email, password) {
  const url = `${BASE_URL}/api/auth/register`;
  const payload = JSON.stringify({ name, email, password });
  return http.post(url, payload, { headers: getHeaders() });
}

/**
 * Log in a user and return the JWT Bearer token
 * @param {string} email
 * @param {string} password
 * @returns {string|null} token
 */
export function loginUser(email, password) {
  const url = `${BASE_URL}/api/auth/login`;
  const payload = JSON.stringify({ email, password });
  const res = http.post(url, payload, { headers: getHeaders() });

  if (res.status === 200) {
    try {
      const json = res.json();
      return json.token || null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Ensure a user exists and return their JWT token (idempotent: login or register)
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {string|null} token
 */
export function registerOrLogin(name, email, password) {
  let token = loginUser(email, password);
  if (token) return token;

  // Try registering
  const regRes = registerUser(name, email, password);
  if (regRes.status === 201 || regRes.status === 400) {
    token = loginUser(email, password);
  }
  return token;
}

/**
 * Retrieve or create a dedicated test venue for load testing
 * @param {string} token
 * @returns {string|null} venueId
 */
export function getOrCreateTestVenue(token) {
  const getRes = http.get(`${BASE_URL}/api/venues`, { headers: getHeaders(token) });
  if (getRes.status === 200) {
    try {
      const json = getRes.json();
      if (json.data && json.data.length > 0) {
        // Find existing test venue or return the first available
        const existing = json.data.find((v) => v.name.startsWith('[TEST-LOAD]'));
        if (existing) return existing.id;
        return json.data[0].id;
      }
    } catch (e) {}
  }

  // Create dedicated test venue
  const payload = JSON.stringify({
    name: '[TEST-LOAD] Performance Test Arena',
    address: '100 Performance Way',
    city: 'Benchmark City',
    capacity: 100,
    rows: 10,
    cols: 10,
  });

  const createRes = http.post(`${BASE_URL}/api/venues`, payload, { headers: getHeaders(token) });
  if (createRes.status === 201) {
    try {
      return createRes.json().data.id;
    } catch (e) {}
  }
  return null;
}

/**
 * Retrieve or create a dedicated test event for load testing
 * @param {string} token
 * @param {string} venueId
 * @param {string} title
 * @returns {string|null} eventId
 */
export function getOrCreateTestEvent(token, venueId, title = '[TEST-LOAD] High-Concurrency Concert') {
  const getRes = http.get(`${BASE_URL}/api/events`, { headers: getHeaders(token) });
  if (getRes.status === 200) {
    try {
      const json = getRes.json();
      if (json.data && json.data.length > 0) {
        const existing = json.data.find((e) => e.title === title && e.availableTickets > 5);
        if (existing) return existing.id;
      }
    } catch (e) {}
  }

  // Create new test event (auto generates 100 seats across rows A-J)
  const payload = JSON.stringify({
    title,
    description: 'Automated k6 load test event for performance validation',
    category: 'CONCERT',
    date: new Date(Date.now() + 86400000 * 30).toISOString(),
    price: 150,
    totalTickets: 100,
    venueId,
  });

  const createRes = http.post(`${BASE_URL}/api/events`, payload, { headers: getHeaders(token) });
  if (createRes.status === 201) {
    try {
      return createRes.json().data.id;
    } catch (e) {}
  }
  return null;
}

/**
 * Safety check: Abort script if accidentally executed against a production target
 * @param {string} scriptName
 */
export function assertSafety(scriptName) {
  if (CONFIG.safety.targetEnv === 'production' || BASE_URL.includes('production') || BASE_URL.includes('prod.eventix')) {
    throw new Error(
      `[CRITICAL SAFETY VIOLATION]: Attempted to run ${scriptName} against PRODUCTION (${BASE_URL})! ` +
      `Stress and load testing must ONLY be executed in a dedicated local or isolated staging environment.`
    );
  }
}
