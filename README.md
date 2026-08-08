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
├── README.md                       # Documentation
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
