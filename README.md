# RideSync: A cab aggregator platform

## 📋 Project Description

A comprehensive ride-hailing platform (similar to Ola/Uber) featuring real-time ride booking, driver matching, secure payments, and live location tracking. Built with modern web technologies and enterprise-grade security.

### 🌟 Key Features

- **Real-time Ride Booking:** Instant ride requests with fare estimation
- **Smart Driver Matching:** Geospatial algorithm matches nearest available drivers
- **Secure Authentication:** Phone/email-based login with OTP verification and JWT tokens
- **Payment Simulation:** Mock and cash payment flows (no live payment gateway)
- **Live Tracking:** WebSocket-based real-time location updates
- **Security First:** Rate limiting, CORS, CSP, input sanitization, PII encryption
- **Admin Dashboard:** Comprehensive analytics and user management
- **Graceful Degradation:** Circuit breaker patterns for fault tolerance
- **High Test Coverage:** 71.76% code coverage with 578 automated tests

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or later recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) & Docker Compose (for containerized setup)
- [MongoDB](https://www.mongodb.com/) (v6.0 or later, if running locally)
- [Redis](https://redis.io/) (optional, for session management and rate limiting)

### Installation

#### Option 1: Docker Setup (Recommended)
1. Clone the repository
   ```bash
   git clone https://github.com/mahendra-kausik/RideSync-Cab_Aggregator_Platform.git
   cd RideSync-Cab_Aggregator_Platform
   ```

2. Set up environment variables
   ```powershell
   # PowerShell (Windows):
   Copy-Item .env.example .env
   # macOS / Linux:
   # cp .env.example .env
   # Edit .env and set required values (especially JWT_SECRET)
   # Generate JWT_SECRET (OpenSSL): openssl rand -base64 32
   ```

3. Run with Docker Compose
   ```bash
   docker-compose up --build
   ```

4. Access the application
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000/api
   - MongoDB: localhost:27017
   - Redis: localhost:6379

#### Option 2: Local Development Setup
1. Clone the repository
   ```bash
   git clone https://github.com/mahendra-kausik/RideSync-Cab_Aggregator_Platform.git
   cd RideSync-Cab_Aggregator_Platform
   ```

2. Install dependencies
   ```bash
   # Set up the backend:
   cd backend
   npm install

   # Set up the frontend:
   cd ../frontend
   npm install
   ```

3. Set up environment variables
   ```powershell
   # In backend directory (PowerShell)
   Copy-Item ..\.env.example .env
   # In frontend directory (PowerShell)
   Copy-Item .env.example .env

   # macOS / Linux equivalents (use on non-Windows):
   # cp ../.env.example .env
   # cp .env.example .env
   ```

4. Run the application
   ```bash
   # You will need two separate terminals.

   # In the first terminal, start the backend:
   cd backend
   npm run dev

   # In the second terminal, start the frontend:
   cd frontend
   npm run dev
   ```

## 📁 Project Structure

```
RideSync-Cab_Aggregator_Platform/
├── frontend/                    # React + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Route-based page components
│   │   ├── services/           # API service layer
│   │   ├── context/            # React context providers
│   │   └── utils/              # Frontend utilities
│   └── package.json
├── backend/                     # Express.js + MongoDB Backend
│   ├── controllers/            # Route controllers
│   ├── models/                 # Mongoose schemas (User, Ride, OTP)
│   ├── middleware/             # Auth, validation, security
│   ├── services/               # Business logic (matching, fare, sockets)
│   ├── utils/                  # Utilities (encryption, session, logger)
│   ├── config/                 # Configuration files
│   ├── __tests__/              # Test suites (578 tests, 71.76% coverage)
│   │   ├── unit/              # Unit tests (23 suites)
│   │   ├── integration/       # Integration tests (3 suites)
│   │   └── system/            # End-to-end system tests
│   └── package.json
├── docs/                        # Comprehensive Documentation
│   ├── API_DOCUMENTATION.md   # REST API reference
│   ├── TESTING.md             # Testing guide
│   ├── QUICKSTART.md          # Quick setup guide
│   └── ENV_REFERENCE.md       # Environment variables
├── .github/                     # CI/CD Configuration
│   └── workflows/
│       └── ci-cd.yml          # Automated testing pipeline
├── docker-compose.yml          # Multi-container orchestration
├── .env.example                # Environment template
└── README.md                   # This file
```

## 📚 Documentation
- **[API Documentation](docs/API_DOCUMENTATION.md)** — Complete REST API reference with authentication, rides, payments
- **[Testing Guide](docs/TESTING.md)** — How to run tests, coverage reports, and CI/CD
- **[Quickstart Guide](docs/QUICKSTART.md)** — Fast setup and development guide
- **[Environment Reference](docs/ENV_REFERENCE.md)** — All environment variables explained

### 📋 Additional Resources
- **Architecture:** Microservices-inspired with modular backend structure
- **Security:** OWASP Top 10 compliant, PCI-DSS considerations for payments
- **Testing:** Unit (71.76%), Integration, and System tests with Jest & Supertest

## 🧪 Testing

### Current Test Metrics
- ✅ **578 Total Tests** (574 passing, 4 known issues)
- ✅ **71.76% Code Coverage** (Statement coverage)
- ✅ **23 Test Suites** covering all major components
- ✅ **99.3% Pass Rate**

### Test Commands

```bash
# Backend tests
cd backend
npm test                    # Run all tests (unit + integration + system)
npm run test:unit           # Run unit tests only (23 suites)
npm run test:integration    # Run integration tests only
npm run test:coverage       # Generate full coverage report (71.76%)
npm run test:watch          # Run tests in watch mode

# Run specific test files
npm test -- controllers-auth.test.js
npm test -- --testPathPattern=middleware

# Frontend tests
cd frontend
npm run dev                 # Run frontend dev server (Vite)
npm run build               # Build for production
npm run preview             # Preview production build
npm run lint                # Run ESLint
npm run type-check          # TypeScript type checking

# CI/CD Pipeline
# Automated testing runs on:
# - Push to main branche
# - Pull requests to main
# - View results: GitHub Actions tab
```

### Test Coverage by Module
- **Controllers:** 76.3% (auth: 80%, payment: 87%, security: 100%)
- **Middleware:** 79.4% (advancedSecurity: 98%, security: 96%)
- **Models:** 87.6% (OTP: 100%, Ride: 79%, User: 89%)
- **Services:** 55.8% (GracefulDegradation: 100%, socketHandlers: 100%)
- **Utils:** 64.6% (sessionManager: 95%, securityValidator: 94%)

## 🛡️ Security Features

- **Authentication:** JWT tokens with session management and token rotation
- **Rate Limiting:** Configurable limits on auth (5/15min), OTP (3/5min), API (100/15min)
- **Input Validation:** XSS and SQL injection protection
- **Encryption:** AES-256-GCM for PII data (phone numbers, sensitive info)
- **Security Headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Session Management:** Hijacking detection, blacklist support, automatic cleanup
- **Brute Force Protection:** Account lockout after failed attempts
- **CORS:** Configurable origin restrictions

## 🚀 Technology Stack

### Backend
- **Runtime:** Node.js v18+
- **Framework:** Express.js
- **Database:** MongoDB 6.0+ with Mongoose ODM
- **Authentication:** JWT (jsonwebtoken), bcrypt
- **Real-time:** Socket.IO for WebSocket communication
- **Testing:** Jest 29.x, Supertest, MongoDB Memory Server
- **Security:** Helmet, express-rate-limit, validator

### Frontend
- **Framework:** React 18
- **Language:** TypeScript
- **Build Tool:** Vite
- **UI:** Tailwind CSS, React Icons
- **Maps:** Mapbox GL JS
- **State:** React Context API
- **HTTP:** Axios
- **Real-time:** Socket.IO Client

### DevOps
- **Containerization:** Docker & Docker Compose
- **CI/CD:** GitHub Actions
- **Version Control:** Git/GitHub
- **Code Quality:** ESLint, Prettier
- **Coverage:** Istanbul/nyc
