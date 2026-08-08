require('dotenv').config();
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { io: ClientIO } = require('socket.io-client');
const prisma = require('../src/config/db');
const { redis, redisSub } = require('../src/config/redis');
const { stopLockCleanupTask } = require('../src/services/seat.service');

let serverInstance = null;
let clientSocket = null;
let API_BASE = 'http://127.0.0.1:5000';

const receivedSocketEvents = [];

const request = (path, method = 'GET', body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (err) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

describe('Milestone 10 Comprehensive End-to-End Suite', () => {
  let user1Token = '';
  let user2Token = '';
  let venueId = '';
  let eventId = '';
  let seatA1 = null;
  let seatA2 = null;

  before(async () => {
    const app = require('../src/app');
    const { initSocket } = require('../src/socket');
    const { startLockCleanupTask } = require('../src/services/seat.service');

    serverInstance = http.createServer(app);
    initSocket(serverInstance);
    startLockCleanupTask();

    await new Promise((resolve) => serverInstance.listen(0, resolve));

    const port = serverInstance.address().port;
    API_BASE = `http://127.0.0.1:${port}`;
    console.log(`[Test Setup]: Test HTTP server running on ${API_BASE}`);

    clientSocket = ClientIO(API_BASE, {
      transports: ['websocket', 'polling'],
    });

    clientSocket.on('seats_locked', (data) => receivedSocketEvents.push({ type: 'seats_locked', data }));
    clientSocket.on('seats_released', (data) => receivedSocketEvents.push({ type: 'seats_released', data }));
    clientSocket.on('seats_booked', (data) => receivedSocketEvents.push({ type: 'seats_booked', data }));

    await new Promise((resolve) => clientSocket.once('connect', resolve));
    console.log('[Test Setup]: Socket.IO test client connected');
  });

  after(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    stopLockCleanupTask();
    await redis.quit();
    await redisSub.quit();
    await prisma.$disconnect();
    console.log('[Test Teardown]: Resources cleanly closed.');
  });

  test('1. Health Check Endpoint', async () => {
    const res = await request('/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  test('2. Authentication: Register, Login & Protected Routes', async () => {
    const testEmail1 = `m10_u1_${Date.now()}@example.com`;
    const regRes1 = await request('/api/auth/register', 'POST', {
      name: 'Milestone10 User 1',
      email: testEmail1,
      password: 'password123',
    });
    assert.strictEqual(regRes1.status, 201);

    const loginRes1 = await request('/api/auth/login', 'POST', {
      email: testEmail1,
      password: 'password123',
    });
    assert.strictEqual(loginRes1.status, 200);
    assert.ok(loginRes1.body.token);
    user1Token = loginRes1.body.token;

    const testEmail2 = `m10_u2_${Date.now()}@example.com`;
    await request('/api/auth/register', 'POST', {
      name: 'Milestone10 User 2',
      email: testEmail2,
      password: 'password123',
    });
    const loginRes2 = await request('/api/auth/login', 'POST', {
      email: testEmail2,
      password: 'password123',
    });
    user2Token = loginRes2.body.token;

    // Protected Route Access with Token
    const profileRes = await request('/api/auth/profile', 'GET', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert.strictEqual(profileRes.status, 200);
    assert.strictEqual(profileRes.body.data.email, testEmail1);

    // Protected Route Rejection without Token
    const unauthProfile = await request('/api/auth/profile', 'GET');
    assert.strictEqual(unauthProfile.status, 401);
  });

  test('3. Events & Venues: Listing and Event Details', async () => {
    const vRes = await request(
      '/api/venues',
      'POST',
      { name: 'M10 Audit Arena', address: '1 Audit St', city: 'Techville', capacity: 100 },
      { Authorization: `Bearer ${user1Token}` }
    );
    assert.strictEqual(vRes.status, 201);
    venueId = vRes.body.data.id;

    const eRes = await request(
      '/api/events',
      'POST',
      {
        title: 'Milestone 10 Production Concert',
        description: 'End-to-end verification event',
        category: 'CONCERT',
        date: '2026-12-31T23:59:59.000Z',
        price: 250,
        totalTickets: 100,
        venueId,
      },
      { Authorization: `Bearer ${user1Token}` }
    );
    assert.strictEqual(eRes.status, 201);
    eventId = eRes.body.data.id;

    // Event Listing Query
    const listRes = await request('/api/events');
    assert.strictEqual(listRes.status, 200);
    assert.ok(listRes.body.data.length > 0);

    // Event Detail Query
    const detailRes = await request(`/api/events/${eventId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.data.id, eventId);
  });

  test('4. Seats: Generation & Layout Availability Query', async () => {
    const seatsRes = await request(`/api/events/${eventId}/seats`);
    assert.strictEqual(seatsRes.status, 200);
    assert.strictEqual(seatsRes.body.data.totalSeats, 100);

    seatA1 = seatsRes.body.data.rows.A[0];
    seatA2 = seatsRes.body.data.rows.A[1];
    assert.ok(seatA1 && seatA2);

    const availRes = await request(`/api/events/${eventId}/available-seats`);
    assert.strictEqual(availRes.status, 200);
    assert.ok(availRes.body.data.length >= 100);
  });

  test('5. Redis Seat Locking, TTL Verification & Concurrency Conflict', async () => {
    assert.ok(seatA1, 'seatA1 must be defined');

    // User 1 locks seat A1
    const lockRes1 = await request(
      '/api/bookings/lock',
      'POST',
      { eventId, seatIds: [seatA1.id] },
      { Authorization: `Bearer ${user1Token}` }
    );
    assert.strictEqual(lockRes1.status, 200);
    assert.strictEqual(lockRes1.body.data.lockedCount, 1);

    // Verify Redis Key & TTL
    const redisKey = `seat_lock:${eventId}:${seatA1.id}`;
    const ttl = await redis.ttl(redisKey);
    assert.ok(ttl > 0 && ttl <= 300, `TTL should be <= 300 seconds, got: ${ttl}`);

    // Concurrency Protection: User 2 attempts to lock same seat A1 -> Expect 409 Conflict
    const lockRes2 = await request(
      '/api/bookings/lock',
      'POST',
      { eventId, seatIds: [seatA1.id] },
      { Authorization: `Bearer ${user2Token}` }
    );
    assert.strictEqual(lockRes2.status, 409);
  });

  test('6. Payment Simulation: Failed Payment Seat Release', async () => {
    assert.ok(seatA2, 'seatA2 must be defined');

    // User 2 locks seat A2
    await request(
      '/api/bookings/lock',
      'POST',
      { eventId, seatIds: [seatA2.id] },
      { Authorization: `Bearer ${user2Token}` }
    );

    // User 2 executes payment with simulateFailure = true -> Expect 400 Bad Request
    const failRes = await request(
      '/api/bookings/confirm',
      'POST',
      { eventId, seatIds: [seatA2.id], paymentMethod: 'CARD', simulateFailure: true },
      { Authorization: `Bearer ${user2Token}` }
    );
    assert.strictEqual(failRes.status, 400);

    // Verify seat A2 status returned to AVAILABLE
    const seatsRes = await request(`/api/events/${eventId}/seats`);
    const seatA2Updated = seatsRes.body.data.rows.A[1];
    assert.strictEqual(seatA2Updated.status, 'AVAILABLE');

    // Verify Redis lock key was removed
    const redisKey = `seat_lock:${eventId}:${seatA2.id}`;
    const exists = await redis.exists(redisKey);
    assert.strictEqual(exists, 0);
  });

  test('7. Payment Simulation: Successful Booking & Digital Receipt', async () => {
    assert.ok(seatA1, 'seatA1 must be defined');

    // User 1 confirms seat A1 with paymentMethod = 'UPI'
    const confirmRes = await request(
      '/api/bookings/confirm',
      'POST',
      { eventId, seatIds: [seatA1.id], paymentMethod: 'UPI', simulateFailure: false },
      { Authorization: `Bearer ${user1Token}` }
    );
    assert.strictEqual(confirmRes.status, 201);
    assert.strictEqual(confirmRes.body.data.payment.status, 'SUCCESS');
    assert.ok(confirmRes.body.data.payment.transactionId.startsWith('TXN_SIM_'));

    // Verify seat A1 status is BOOKED
    const seatsRes = await request(`/api/events/${eventId}/seats`);
    const seatA1Updated = seatsRes.body.data.rows.A[0];
    assert.strictEqual(seatA1Updated.status, 'BOOKED');
  });

  test('8. Booking History & User Isolation Protection', async () => {
    // User 1 fetches history -> Contains confirmed booking
    const myRes1 = await request('/api/bookings/my-bookings', 'GET', null, {
      Authorization: `Bearer ${user1Token}`,
    });
    assert.strictEqual(myRes1.status, 200);
    assert.ok(myRes1.body.data.length >= 1);

    // User 2 fetches history -> Does NOT contain User 1's booking
    const myRes2 = await request('/api/bookings/my-bookings', 'GET', null, {
      Authorization: `Bearer ${user2Token}`,
    });
    assert.strictEqual(myRes2.status, 200);
    const user2BookingIds = myRes2.body.data.map((b) => b.id);
    assert.strictEqual(user2BookingIds.includes(myRes1.body.data[0].id), false);

    // Unauthorized request -> Expect 401 Unauthorized
    const unauthRes = await request('/api/bookings/my-bookings', 'GET');
    assert.strictEqual(unauthRes.status, 401);
  });

  test('9. Socket.IO Real-Time Event Emissions', async () => {
    // Verify that during previous test steps, Socket.IO client received real-time events
    const hasSeatsLockedEvent = receivedSocketEvents.some((e) => e.type === 'seats_locked');
    const hasSeatsReleasedEvent = receivedSocketEvents.some((e) => e.type === 'seats_released');
    const hasSeatsBookedEvent = receivedSocketEvents.some((e) => e.type === 'seats_booked');

    assert.ok(hasSeatsLockedEvent, 'Socket.IO must emit seats_locked event');
    assert.ok(hasSeatsReleasedEvent, 'Socket.IO must emit seats_released event');
    assert.ok(hasSeatsBookedEvent, 'Socket.IO must emit seats_booked event');
  });
});
