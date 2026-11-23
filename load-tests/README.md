# Eventix Load & Concurrency Testing Suite (Grafana k6)

This directory contains a suite of load, stress, and concurrency test scripts built with [Grafana k6](https://k6.io/) for the **Eventix Real-Time Event Ticketing System**.

---

## 📋 Table of Contents

- [Architectural Overview](#architectural-overview)
- [Test Scripts Summary](#test-scripts-summary)
- [How to Install k6 on Windows](#how-to-install-k6-on-windows)
- [Configuration & Environment Variables](#configuration--environment-variables)
- [Running Each Test](#running-each-test)
  - [1. Smoke Test (Basic API Availability)](#1-smoke-test-basic-api-availability)
  - [2. Load Test (100 Concurrent Virtual Users)](#2-load-test-100-concurrent-virtual-users)
  - [3. Stress Test (500 to 1000 Virtual Users)](#3-stress-test-500-to-1000-virtual-users)
  - [4. Concurrent Booking Test (Race Condition Simulation)](#4-concurrent-booking-test-race-condition-simulation)
- [Understanding & Interpreting Metrics](#understanding--interpreting-metrics)
- [Configurable Performance Thresholds & Scalability Limitations](#configurable-performance-thresholds--scalability-limitations)
- [Safety & Test Data Isolation](#safety--test-data-isolation)
- [Phase 1 Benchmark Results: Baseline vs. Optimized](#-phase-1-benchmark-results-baseline-vs-optimized)

---

## 🏗️ Architectural Overview

The test suite interacts directly with the Eventix backend architecture:

```
                            ┌──────────────────────────────────┐
                            │     Grafana k6 Test Engine       │
                            │  (VUs, Scenarios, Custom Metrics) │
                            └────────────────┬─────────────────┘
                                             │ HTTP REST
                                             ▼
                            ┌──────────────────────────────────┐
                            │   Node.js / Express Server (:5000)│
                            │   (JWT Auth, Controllers, Routes) │
                            └────────┬────────────────┬────────┘
                                     │                │
                        Atomic Redis │                │ PostgreSQL ACID
                        Locking (TTL)│                │ Transactions
                                     ▼                ▼
                              ┌─────────────┐  ┌─────────────┐
                              │    Redis    │  │ PostgreSQL  │
                              │ (Key Store) │  │  (Prisma)   │
                              └─────────────┘  └─────────────┘
```

1. **Authentication (`/api/auth/*`)**: Users are registered and authenticated to receive JWT Bearer tokens.
2. **Event & Seat Catalog (`/api/events/*`)**: High-concurrency reads simulating attendee seat map browsing.
3. **Atomic Redis Locking (`/api/bookings/lock`)**: Distributed temporary locking (`seat_lock:{eventId}:{seatId}`) with 300s TTL.
4. **Booking Confirmation (`/api/bookings/confirm`)**: PostgreSQL `$transaction` blocks executing seat status transition (`LOCKED` -> `BOOKED`), simulated payment verification, ticket decrement, and Redis lock cleanup.

---

## 📂 Test Scripts Summary

| File | Purpose | VUs | Target Duration |
| :--- | :--- | :--- | :--- |
| `config.js` | Shared configuration, custom metrics, and API helper functions | N/A | N/A |
| `smoke-test.js` | Verifies basic API availability and endpoint sanity | 1 | 15s |
| `load-test.js` | Simulates realistic attendee traffic with 100 concurrent users | 100 | ~3m 30s |
| `stress-test.js` | Scaled load testing to 500 and 1000 VUs to identify saturation limits | 500 – 1000 | ~7m – 10m |
| `concurrent-booking.js` | Simulates race conditions: multiple VUs locking the exact same seat | 20 | ~10s |

---

## 💻 How to Install k6 on Windows

You can install k6 on Windows using any of the following methods:

### Method 1: Windows Package Manager (`winget`) — Recommended
Open PowerShell as Administrator:
```powershell
winget install k6 --source winget
```

### Method 2: Chocolatey
```powershell
choco install k6
```

### Method 3: Scoop
```powershell
scoop install k6
```

### Method 4: Official MSI Installer
1. Download the latest Windows installer from [Grafana k6 Releases](https://github.com/grafana/k6/releases).
2. Run `k6-vX.XX.X-windows-amd64.msi`.
3. Complete the installation wizard.

### Method 5: Standalone Binary (Zip)
1. Download `k6-vX.XX.X-windows-amd64.zip` from GitHub Releases.
2. Extract `k6.exe` to a folder (e.g., `C:\Tools\k6\`).
3. Add that directory to your Windows system `PATH`.

### Method 6: Docker (Alternative)
If Docker is running locally:
```bash
docker run --rm -i -v ${PWD}:/scripts -w /scripts grafana/k6 run smoke-test.js
```

### Verify Installation
Confirm k6 is ready in your terminal:
```powershell
k6 version
```

---

## ⚙️ Configuration & Environment Variables

All test parameters can be overridden using k6 environment flags (`-e KEY=VALUE`):

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `BASE_URL` | `http://localhost:5000` | Backend API base URL |
| `ADMIN_EMAIL` | `k6_admin@test.local` | Admin user email for test setup |
| `ADMIN_PASSWORD` | `Password123!` | Admin user password |
| `USER_PREFIX` | `k6_user_` | Prefix for dynamically generated test accounts |
| `USER_PASSWORD` | `Password123!` | Default password for virtual users |
| `QUICK` | `false` | Set to `true` for shortened development iterations |
| `ALLOW_1000_VUS` | `false` | **Required safety flag to authorize the 1000-VU stress test stage** |
| `THRESH_AVG_RESP_TIME` | `800` | Target maximum average response time (ms) |
| `THRESH_P90_RESP_TIME` | `1000` | Target p90 latency threshold (ms) |
| `THRESH_P95_RESP_TIME` | `1500` | Target p95 latency threshold (ms) |
| `THRESH_ERROR_RATE` | `0.05` | Target maximum HTTP failure rate (5%) |

---

## 🚀 Running Each Test

Navigate into the `load-tests/` directory:
```powershell
cd d:\Event-Ticketing-System\load-tests
```

### 1. Smoke Test (Basic API Availability)
Runs a single-user sanity check across `/api/health`, `/api/auth/profile`, `/api/venues`, `/api/events`, and `/api/bookings/my-bookings`.

```powershell
# Standard run against local backend
k6 run smoke-test.js

# Custom API base URL
k6 run -e BASE_URL=http://localhost:5000 smoke-test.js
```

**Expected Outcome**:
- 100% of checks pass (`status === 200`).
- Error rate is 0.00%.
- Average response time is under 100ms.

---

### 2. Load Test (100 Concurrent Virtual Users)
Simulates realistic attendee browsing, seat inspection, seat locking, and checkout confirmation at 100 concurrent VUs.

```powershell
# Full 3.5-minute load test profile (1m ramp-up -> 2m hold -> 30s ramp-down)
k6 run load-test.js

# Quick 1-minute development validation run
k6 run -e QUICK=true load-test.js
```

**Expected Outcome**:
- 100 concurrent users active without server crashes.
- Successful bookings (`booking_success`) recorded.
- Concurrency conflicts (`duplicate_booking_attempts`) handled gracefully with 409 responses.
- p95 latency remains within configured thresholds.

---

### 3. Stress Test (500 to 1000 Virtual Users)
Gradually increases system load to identify capacity limits and observe system behavior under extreme pressure.

> [!WARNING]
> **STRICT SAFETY POLICY**: Stress testing must **NEVER** be launched against a production system. Per user instructions, the 1000-user stage requires explicit approval.

#### Running the 500-VU Stage (Default Safe Mode)
By default, the script ramps up to 500 VUs and does **not** proceed to 1000 VUs:
```powershell
k6 run stress-test.js
```

#### Running the 1000-VU Stage (Explicit Approval Required)
When user approval has been provided:
```powershell
k6 run -e ALLOW_1000_VUS=true stress-test.js

# Quick stress validation run
k6 run -e ALLOW_1000_VUS=true -e QUICK=true stress-test.js
```

**Expected Outcome**:
- Identifies the maximum Requests Per Second (RPS) threshold.
- Observes database connection pool saturation.
- Measures graceful degradation without unhandled node process termination.

---

### 4. Concurrent Booking Test (Race Condition Simulation)
Reproduces high-concurrency race conditions: **20 distinct users all attempt to reserve the exact same seat simultaneously**.

```powershell
# Run with 20 concurrent competing users
k6 run concurrent-booking.js

# Scale race competition to 50 concurrent users
k6 run -e VUS=50 concurrent-booking.js
```

#### How the Concurrency Test Proves System Integrity:
1. **Pre-test setup**: Creates an isolated test event and identifies Seat `A1`.
2. **Simultaneous execution**: All 20 VUs fire `POST /api/bookings/lock` for Seat `A1` at the exact same millisecond.
3. **Atomic lock verification**:
   - **Exactly 1 user** receives `200 OK` and proceeds to confirm booking (`201 Created`).
   - **19 competing users** immediately receive `409 Conflict` ("Seat A1 is currently locked by another user").
4. **Post-test database audit**: Queries the PostgreSQL database to confirm that **exactly one booking exists** and seat status is `BOOKED`.
5. **Zero double bookings occurred!**

---

## 📊 Understanding & Interpreting Metrics

k6 outputs standard and custom performance metrics at the conclusion of each run:

### Standard k6 Metrics
- **`http_reqs`**: Total number of HTTP requests executed across the test.
- **`http_reqs / s`**: Throughput (requests processed per second).
- **`http_req_duration`**:
  - `avg`: Mean round-trip latency.
  - `min` / `med` / `max`: Minimum, median, and maximum latency observed.
  - `p(90)`: 90% of requests completed faster than this time.
  - `p(95)`: 95% of requests completed faster than this time.
- **`http_req_failed`**: Percentage of requests returning HTTP status codes outside 2xx/3xx.

### Custom Eventix Metrics
- **`http_errors`**: Counter tracking any unexpected 4xx (except legitimate 409 conflicts) or 5xx server errors.
- **`booking_success`**: Counter tracking successfully confirmed bookings (`HTTP 201`).
- **`booking_failure`**: Counter tracking failed booking confirmations.
- **`lock_success`**: Counter tracking acquired 5-minute Redis locks (`HTTP 200`).
- **`lock_conflict`**: Counter tracking seat locks rejected due to concurrent reservation (`HTTP 409`).
- **`duplicate_booking_attempts`**: Counter tracking rejected race condition attempts on occupied seats.
- **`booking_duration`**: Trend measuring the execution duration of PostgreSQL booking confirmation transactions.
- **`lock_duration`**: Trend measuring the round-trip execution latency of atomic Redis seat locks.

---

## ⚠️ Configurable Performance Thresholds & Scalability Limitations

> [!IMPORTANT]
> **Passing a performance threshold in k6 does NOT automatically prove production scalability.**

While automated performance thresholds (`http_req_duration: ['p(95)<1500']`, `http_req_failed: ['rate<0.05']`) ensure software regressions do not degrade baseline performance, they cannot simulate the full reality of production deployment:

1. **Database Connection Pool Exhaustion**: In production, hundreds of concurrent PostgreSQL transactions can exhaust the database connection pool (`pg Pool`), leading to queued connection timeouts.
2. **Single-Process Event Loop Contention**: A single Node.js process is CPU-bound to one event loop thread. Production scalability requires clustering or multi-instance container horizontal scaling behind an Nginx or AWS ALB load balancer.
3. **Network Realities**: Local benchmarks run on loopback (`127.0.0.1`) with sub-millisecond network round trips. Production traffic introduces geographic latency, SSL handshake overhead, packet retransmissions, and CDN caching layers.
4. **Redis Distributed State**: In a distributed multi-node production deployment, Redis cluster failover, keyspace event replication, and network partitions must be accounted for.
5. **Third-Party Payment Gateways**: The current tests use simulated in-memory payments (`processSimulatedPayment`). Real payment gateways (e.g. Razorpay, Stripe) introduce external HTTP latency, webhook delays, and third-party rate limits.

---

## 🛡️ Safety & Test Data Isolation

To protect existing data and maintain system safety:

1. **Prefix Isolation**: All automated test users are created with the prefix `k6_user_` or `k6_admin@test.local`.
2. **Event Isolation**: Dedicated test events are prefixed with `[TEST-LOAD]` or `[TEST-CONCURRENCY]`. Existing events and real customer bookings are never modified or locked.
3. **Zero Real Payments**: Tests strictly utilize the backend's simulated payment provider (`paymentMethod: 'CARD' / 'UPI'`), ensuring no financial transactions occur.
4. **Non-Destructive Operations**: Test scripts never execute destructive database operations (`DROP`, `TRUNCATE`, or bulk deletes of customer records).
5. **Production Blocker**: `assertSafety()` checks the target URL and environment variable, throwing an immediate error if targeted against a production domain.

---

## 📈 Phase 1 Benchmark Results: Baseline vs. Optimized

### 1. Benchmark Test Environment
- **Platform**: Multi-container Docker Compose environment on Windows
  - **Database**: PostgreSQL 16 Alpine (`max_connections = 100`)
  - **Cache & Locks**: Redis Alpine (`ioredis` with keyspace expiration events enabled)
  - **Backend API**: Node.js / Express 5.x container (`eventix_backend`)
- **Test Engine**: Grafana k6 v2.4.0 (Linux/amd64)
- **Profile**: 100 Concurrent Virtual Users over 3m 30s (1m ramp-up -> 2m sustained load @ 100 VUs -> 30s ramp-down)
- **Target Event**: Isolated fresh test event (`[TEST-LOAD] 100-VU Benchmark Concert`) with 100 generated seats across Rows A–J.

### 2. Measured Metrics Comparison

| Metric | Baseline (Pre-Optimization) | Post-Optimization (Actual Measured) | Absolute Change | Relative Improvement | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Total HTTP Requests** | 5,131 | **7,604** | +2,473 reqs | **+48.2% Total Volume** | 🚀 |
| **Throughput (RPS)** | 24.2266 req/s | **35.7773 req/s** | +11.5507 req/s | **~47.7% Improvement** | 🚀 |
| **Average Latency** | 2.82 s | **1.74 s** | -1.08 s | **-38.3% Faster** | 🚀 |
| **Median Latency (p50)** | ~2.1 s | **831.91 ms** | -1.27 s | **Sub-second Median** | 🚀 |
| **p90 Latency** | 7.13 s | **4.88 s** | -2.25 s | **-31.6% Reduction** | 🚀 |
| **p95 Latency** | 9.88 s | **5.72 s** | -4.16 s | **-42.1% Reduction** | 🚀 |
| **Maximum Tail Latency** | 15.71 s | **6.27 s** | -9.44 s | **-60.1% Drop in Max** | 🚀 |
| **Booking Duration (p95)**| 4.51 s | **2.86 s** | -1.65 s | **-36.6% Reduction** | 🚀 |
| **HTTP Failure Rate** | 2.57% (132 / 5,131) | **1.72% (131 / 7,604)** | -0.85% | **-33.1% Lower Rate** | ✅ PASSED |
| **Checks Succeeded** | N/A | **100.00% (5,932 / 5,932)**| 0 failed checks | **100% Application Integrity** | ✅ |
| **Successful Bookings** | 100 (Full event) | **100 (Full event)** | 100 | **100% Booking Success** | ✅ |
| **Lock Conflicts (409)** | 27 | **28** | +1 | **Normal Race Behavior** | ℹ️ |
| **Booking Failures** | 4 | **2** | -2 | **50% Reduction** | ✅ |
| **HTTP Errors** | N/A | **2** | 2 | **< 0.03% Error Rate** | ✅ |

### 3. Thresholds Evaluation & Explicit Disclosures

- **`http_req_failed < 0.05`**: **PASSED** (Actual: **1.72%**; 131 non-2xx / 7,604 requests). The failure rate is well within the 5% tolerance threshold.

#### Verified HTTP Response Breakdown (131 Non-2xx Responses):
The 131 non-2xx responses categorized during the test reflect specific response categories, not all unexpected application errors:
- **28 x HTTP 409 Conflicts**: Normal race-condition rejections when multiple VUs attempted to lock the same seat simultaneously (handled gracefully by Redis atomic locking).
- **101 x HTTP 400 Duplicate-Registration Responses**: Expected pre-check responses (`User already exists with this email`) when virtual users reused test accounts before falling back to `/api/auth/login`.
- **2 x Booking Failures**: Unsuccessful booking confirmation requests (`HTTP 4xx/5xx`) under peak database transaction concurrency.

These response categories verify that the application handled race conditions and pre-existing accounts predictably, with only 2 actual booking failures across 7,604 requests.

#### Explicit Disclosure of Latency Thresholds Not Met:
Under 100 concurrent virtual users, the following latency thresholds were **not met**:
- ❌ **HTTP Latency (p90)**: Target `< 1.00s` | **Actual: 4.88s** (reduced from 7.13s baseline)
- ❌ **HTTP Latency (p95)**: Target `< 1.50s` | **Actual: 5.72s** (reduced from 9.88s baseline: 9.88s → 5.72s)
- ❌ **Average HTTP Latency**: Target `< 800ms` | **Actual: 1.74s** (reduced from 2.82s baseline)
- ❌ **Booking Duration (p95)**: Target `< 2.00s` | **Actual: 2.86s** (reduced from 4.51s baseline: 4.51s → 2.86s)

#### Architectural Root Cause for Latency Threshold Failure:
Per strict application safety guidelines, the following conservative design constraints were intentionally maintained:
1. **Event Row-Level Write Lock Preserved**: The `availableTickets` counter decrement was intentionally retained inside the interactive Prisma `$transaction` (`tx.event.update`) to guarantee strict atomic counter consistency and avoid fire-and-forget risks. Because all 100 VUs book tickets for the same concert, concurrent booking confirmations are sequentially serialized at the database row level.
2. **Authentication Caching Deferred**: Cryptographic JWT validation and per-request database user lookups were left un-cached to avoid any token revocation, user deletion, or account-disabling edge cases.

---

### 4. Functional Test Success vs. Performance Threshold Success

It is vital to clearly separate **functional correctness** from **performance threshold criteria**:

- **Functional Test Success (100% Passed)**:
  - All **5,932 / 5,932** functional checks succeeded (100.00%).
  - Exactly 100 bookings were confirmed for the 100-capacity event with **zero double bookings** or database corruption.
  - Redis 5-minute atomic seat locks and HTTP 409 conflict protections worked accurately under heavy race conditions.
  - All 9 backend integration tests passed cleanly.
- **Performance Threshold Success (Partial)**:
  - While throughput increased by **+48.2%** (7,604 reqs vs. 5,131), average latency decreased by **-38.3%**, and maximum tail latency was cut by **-60.1%** (6.27s vs. 15.71s), the strict sub-second SLA latency targets require architectural de-serialization of the event counter and token caching.

---

### 5. Applied Safe Optimizations in Phase 1
1. **Removed Redundant Inline Expired-Lock Cleanup**: Eliminated full-table scan DB queries from `getSeatsByEvent` and `getAvailableSeatsByEvent` in `seat.controller.js`. Read-only seat listings now rely entirely on dynamic Redis state and the 10-second background cleanup interval.
2. **Targeted PostgreSQL Indexes Added**:
   - `Seat`: Added compound index `Seat_status_lockExpiresAt_idx` on `(status, lockExpiresAt)`, replacing table scans in background cleanup with $O(\log N)$ Index Scans (cost dropped from 15.60 to 0.15).
   - `Booking`: Added compound index `Booking_userId_createdAt_idx` on `(userId, createdAt DESC)`, converting sequential scans and in-memory sorts on `my-bookings` into direct Bitmap Index Scans.
3. **Calibrated Connection Pool**: Configured `pg.Pool` with `max: 20` (leaving 80% of PostgreSQL's 100-connection limit safely free) and a finite 5000ms connection timeout, completely eliminating connection hang lockups.

### 6. Conclusions
The Phase 1 targeted optimizations successfully delivered an **approximately 47.7% throughput increase** (24.2266 req/s → 35.7773 req/s; +48.2% total volume), slashed p95 response times by **4.16 seconds (-42.1%, 9.88s → 5.72s)**, reduced booking p95 from **4.51s down to 2.86s (-36.6%)**, and dropped maximum latency from **15.71s down to 6.27s (-60.1%)** under 100 concurrent virtual users, while preserving 100% data integrity, atomic booking safety, and passing all 9 backend integration tests.
