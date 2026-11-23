# Eventix — Production Real-Time Event Ticketing & Seat Reservation System

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-v20.x-green.svg)
![Express](https://img.shields.io/badge/Express-v5.x-lightgrey.svg)
![React](https://img.shields.io/badge/React-v19.x-blue.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16+-blue.svg)
![Redis](https://img.shields.io/badge/Redis-v7.x-red.svg)
![Prisma](https://img.shields.io/badge/Prisma-v7.x-teal.svg)
![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.x-black.svg)

**Eventix** is a high-concurrency real-time event ticketing and seat reservation engine built with **Node.js, Express, PostgreSQL, Prisma ORM, Redis, Socket.IO, and React**.

It implements 5-minute atomic seat locking backed by Redis key-value TTL expiration, PostgreSQL database transactions for strict double-booking protection, a simulated payment processor gateway, live WebSocket updates across browser sessions, and a customer booking history dashboard.

---

## 🏗️ System Architecture

```
                                  ┌───────────────────────────────┐
                                  │      React + Vite Client      │
                                  │    (Tailwind CSS, Socket.IO)  │
                                  └──────────────┬────────────────┘
                                                 │
                                     HTTP REST & WebSockets
                                                 │
                                                 ▼
                                  ┌───────────────────────────────┐
                                  │      Express HTTP Server      │
                                  │  (JWT Auth, Controllers, IO)  │
                                  └───────┬───────────────┬───────┘
                                          │               │
                             Temporary    │               │ Permanent
                             Seat Locks   │               │ Data & Transactions
                             (300s TTL)   │               │
                                          ▼               ▼
                                   ┌─────────────┐  ┌─────────────┐
                                   │ Redis Store │  │ PostgreSQL  │
                                   │ (ioredis)   │  │ (Prisma 7)  │
                                   └─────────────┘  └─────────────┘
```

### Real-Time Concurrency Architecture
1. **Redis Temporary Locking**: When a customer selects seats, the backend uses `ioredis` to atomically acquire keys in the format `seat_lock:{eventId}:{seatId}` with a 300-second (5-minute) TTL (`SET key value EX 300 NX`).
2. **Double Booking Prevention**: If a second user attempts to lock an actively locked seat, Redis rejects the operation with a `409 Conflict` error.
3. **Automatic Lock Expiration**: If a user does not complete checkout within 5 minutes, Redis keyspace expiration (`__keyevent@0__:expired`) triggers a server event that resets the seat status to `AVAILABLE` in PostgreSQL and broadcasts a `seats_released` event via Socket.IO.
4. **PostgreSQL Concurrency Protection**: Booking confirmation uses Prisma `$transaction` blocks to wrap seat status updates (`LOCKED` -> `BOOKED`), ticket decrement, `Booking` creation, and `Payment` record insertion.
5. **Payment Gateway Simulation**: Handles simulated payment methods (`CARD`, `UPI`, `NET_BANKING`) with configurable failure testing (`simulateFailure`). Successful payments mark seats permanently `BOOKED` and delete temporary Redis keys; failed payments instantly release seats back to `AVAILABLE`.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js (v5), Socket.IO (v4)
- **Database & ORM**: PostgreSQL 16+, Prisma ORM (v7), `@prisma/adapter-pg`
- **In-Memory Cache & Lock Store**: Redis 7+, `ioredis`
- **Authentication**: JSON Web Tokens (JWT), `bcryptjs`
- **Frontend**: React (v19), Vite, Tailwind CSS (v4), Lucide React Icons
- **Testing**: Node.js Native Test Runner (`node --test`), Custom REST API integration suite
- **Containerization**: Docker, Docker Compose, Nginx

---

## 📁 Project Structure

```
Event-Ticketing-System/
├── docker-compose.yml              # Multi-container production setup
├── README.md                       # Project documentation
├── load-tests/                     # Grafana k6 Load & Concurrency Testing Suite
│   ├── config.js                   # Thresholds, custom metrics & API helpers
│   ├── smoke-test.js               # Baseline API availability verification
│   ├── load-test.js                # 100-VU concurrent user load simulation
│   ├── stress-test.js              # 500-1000 VU stress scaling test
│   ├── concurrent-booking.js       # Simultaneous same-seat race condition test
│   └── README.md                   # Benchmark results & load testing documentation
├── client/                         # React Frontend App
│   ├── .env.example                # Client environment template
│   ├── Dockerfile                  # Multi-stage production Nginx image
│   ├── nginx.conf                  # Nginx proxy & SPA fallback configuration
│   ├── src/
│   │   ├── components/             # Navbar, SeatMap, LockTimer, BookingModal, ReceiptModal, AuthModal
│   │   ├── context/                # AuthContext provider
│   │   ├── pages/                  # EventListPage, EventDetailPage, MyBookingsPage
│   │   └── services/               # Axios API client & Socket.IO singleton
│   └── package.json
└── server/                         # Node.js Express Backend API
    ├── .env.example                # Server environment template
    ├── Dockerfile                  # Production Node.js image
    ├── prisma/                     # Schema definition & migrations
    ├── tests/                      # Automated Milestone 10 test suite
    └── src/
        ├── config/                 # Database & Redis client configuration
        ├── controllers/            # Auth, Event, Venue, Seat, Booking controllers
        ├── middleware/             # Auth (JWT) & Error handling middleware
        ├── routes/                 # Auth, Event, Venue, Booking, Payment routes
        ├── services/               # Seat auto-generation, Redis TTL listener, Payment simulation
        ├── socket/                 # Socket.IO event handler
        ├── app.js                  # Express application setup
        └── index.js                # Server entry point
```

---

## ⚙️ Environment Variables Setup

### Server (`server/.env`)
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# PostgreSQL Connection String
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/event_ticketing_db?schema=public"

# Redis Connection String
REDIS_URL="redis://localhost:6379"

# JWT Authentication
JWT_SECRET=super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d
```

### Client (`client/.env`)
```env
VITE_API_URL="http://localhost:5000"
```

---

## 🚀 Local Development Setup

### 1. Prerequisites
- **Node.js**: v18+ or v20+
- **PostgreSQL**: Running locally on port 5432 (Database name: `event_ticketing_db`)
- **Redis**: Running locally on port 6379 (`redis-cli ping` returns `PONG`)

### 2. Backend Setup
```bash
cd server
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```
*Backend runs on `http://localhost:5000`.*

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## 🐳 Running with Docker Compose

You can spin up the full production stack (PostgreSQL, Redis, Express Backend, Nginx Frontend) with a single command:

```bash
docker-compose up --build
```

- **Frontend App**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`
- **PostgreSQL DB**: `localhost:5432`
- **Redis Server**: `localhost:6379`

---

## 📡 API Reference Overview

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | System health check |
| `POST` | `/api/auth/register` | Public | Register new user account |
| `POST` | `/api/auth/login` | Public | Authenticate user & receive JWT token |
| `GET` | `/api/auth/profile` | Protected | Get logged in user profile |
| `GET` | `/api/events` | Public | List all active events (with search & category filtering) |
| `GET` | `/api/events/:id` | Public | Get event details |
| `POST` | `/api/events` | Admin/Organizer | Create new event & generate 100 seats |
| `GET` | `/api/events/:eventId/seats` | Public | Get 10x10 seat layout matrix enriched with Redis locks |
| `POST` | `/api/bookings/lock` | Protected | Atomically lock seats in Redis for 5 minutes (TTL 300s) |
| `POST` | `/api/bookings/confirm` | Protected | Process simulated payment & confirm PostgreSQL booking |
| `POST` | `/api/bookings/cancel` | Protected | Release active Redis seat locks |
| `GET` | `/api/bookings/my-bookings` | Protected | Get customer booking history & digital receipts |
| `GET` | `/api/payments/:paymentId` | Protected | Fetch transaction details by Payment ID |

---

## ⚡ Performance & Load Testing (k6)

Eventix includes a professional load and concurrency testing suite built with [Grafana k6](https://k6.io/) located in [`load-tests/`](load-tests/). The suite evaluates API availability, concurrent seat contention, Redis distributed locking, and PostgreSQL transactional throughput under realistic traffic profiles.

### 🧪 Test Scenarios Overview
- **Smoke Testing** (`smoke-test.js`): Fast baseline availability and endpoint sanity checks (1 VU).
- **Concurrent Booking Race Testing** (`concurrent-booking.js`): High-concurrency race condition testing where 20+ virtual users simultaneously attempt to reserve the **exact same seat** (Row A, Seat 1) at the exact same millisecond. Validates atomic Redis locking, HTTP 409 conflict rejection, and zero double bookings in PostgreSQL.
- **Stress Testing** (`stress-test.js`): Scaled capacity testing from 500 up to 1000 virtual users to discover saturation limits and recovery behavior.
- **100-VU Load Benchmark** (`load-test.js`): Full user journey benchmark simulating 100 concurrent attendees browsing events, inspecting seat maps, acquiring 5-minute Redis locks, and confirming bookings with simulated payments.

---

### 📊 Verified 100-VU Benchmark Results

Executed against the multi-container Docker environment (Node.js/Express, PostgreSQL 16, Redis 7) over a 3.5-minute load profile (1m ramp-up -> 2m sustained load @ 100 VUs -> 30s ramp-down):

| Metric | Baseline (Pre-Optimization) | Final Measured Benchmark | Target Performance Threshold | Threshold Status |
| :--- | :--- | :--- | :--- | :---: |
| **System Throughput** | 24.2266 req/s | **35.7773 req/s** | N/A | 🚀 **~47.7% improvement** |
| **Total HTTP Requests** | 5,131 requests | **7,604 requests** | N/A | 🚀 (+48.2% total volume) |
| **HTTP Latency (p95)** | 9.88 seconds | **5.72 seconds** | `< 1.50 seconds` | ❌ **Not Met** (-42.1%) |
| **Booking Transaction (p95)**| 4.51 seconds | **2.86 seconds** | `< 2.00 seconds` | ❌ **Not Met** (-36.6%) |
| **Average HTTP Latency** | 2.82 seconds | **1.74 seconds** | `< 800 ms` | ❌ **Not Met** (-38.3%) |
| **HTTP Latency (p90)** | 7.13 seconds | **4.88 seconds** | `< 1.00 second` | ❌ **Not Met** (-31.6%) |
| **Functional Check Success**| N/A | **100.00% (5,932 / 5,932)** | 100% functional integrity | ✅ **PASSED** |
| **HTTP Failure Rate** | 2.57% (132 / 5,131) | **1.72% (131 / 7,604)** | `< 5.00%` | ✅ **PASSED** |
| **Successful Bookings** | 100 confirmed | **100 confirmed (Full event)**| 100 target capacity | ✅ **PASSED** |
| **Maximum Virtual Users** | 100 VUs | **100 VUs** | 100 concurrent VUs | ✅ Met |
| **Test Duration** | 3m 30s | **3 minutes 30 seconds** | 3m 30s | ✅ Met |

---

### 🔍 Analysis: Functional Success vs. Performance Thresholds

1. **100% Functional & Concurrency Integrity**:
   - Zero double-bookings occurred in the database across all runs.
   - All **5,932 / 5,932** functional assertions succeeded with 100% accuracy.
   - HTTP failure rate of 1.72% (131 non-2xx / 7,604) passed the `< 5.00%` threshold.

2. **Verified HTTP Response Breakdown (131 Non-2xx Responses)**:
   The 131 non-2xx responses categorized during the test reflect specific response categories, not all unexpected application errors:
   - **28 x HTTP 409 Conflicts**: Expected race-condition rejections when multiple VUs attempted to lock the same seat simultaneously (handled gracefully by Redis atomic locking).
   - **101 x HTTP 400 Duplicate-Registration Responses**: Expected pre-check responses (`User already exists with this email`) when virtual users reused test accounts before falling back to `/api/auth/login`.
   - **2 x Booking Failures**: Unsuccessful booking confirmation requests (`HTTP 4xx/5xx`) under peak database transaction concurrency.

3. **Explicit Disclosure of Latency Thresholds Not Met**:
   - Despite major reductions in latency (HTTP p95: 9.88s → 5.72s, Booking p95: 4.51s → 2.86s, Average: 2.82s → 1.74s), the configured latency targets were **not met** (Average: 1.74s vs. 800ms target; p90: 4.88s vs. 1.00s target; p95: 5.72s vs. 1.50s target; Booking p95: 2.86s vs. 2.00s target).
   - **Architectural Root Cause**: To maintain absolute data consistency and avoid fire-and-forget risks, the `availableTickets` decrement was strictly preserved inside the interactive PostgreSQL transaction (`tx.event.update`), causing exclusive row-level write locks on the event row during high-volume booking confirmations. Additionally, cryptographic JWT verification and database user lookups were left un-cached to preserve strict authentication security.

For full methodology, reproduction commands, and deep-dive metric analysis, see [`load-tests/README.md`](load-tests/README.md).

---

## 🧪 Automated Testing

Execute the native automated end-to-end test suite covering all 8 milestone domains:

```bash
cd server
npm test
```

**Test Coverage**:
- ✅ Health Check & System Status
- ✅ User Registration, Login & JWT Auth Protection
- ✅ Event & Venue Creation & Querying
- ✅ Seat Generation & Layout Matrix
- ✅ Redis Seat Locking & 5-minute TTL Expiration
- ✅ Double Booking Concurrency Protection (`409 Conflict`)
- ✅ Simulated Payment Gateway (Success & Failure Seat Release)
- ✅ Customer Booking History Isolation Protection

---

---

## 📜 License
This project is open-source under the [ISC License](LICENSE).
