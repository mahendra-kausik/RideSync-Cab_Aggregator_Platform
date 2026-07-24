# Authentication System Documentation

## Overview

The authentication system implements JWT-based authentication with OTP verification for phone registration and email/password login for admin users. It includes role-based access control and comprehensive security features.

## Features Implemented

### ✅ Password Hashing
- Uses bcrypt with 12 salt rounds (exceeds minimum requirement of 10)
- Secure password comparison utilities
- Automatic password hashing in User model

### ✅ JWT Token Management
- Access tokens (24h expiration)
- Refresh tokens (7d expiration)
- Token verification with proper error handling
- Role-based token payload

### ✅ OTP System
- 6-digit OTP generation
- Console logging simulation for development
- Attempt limiting (max 3 attempts)
- 5-minute expiration with TTL indexing
- Dev-only endpoint for OTP retrieval

### ✅ Role-Based Access Control
- Middleware for role authorization
- Support for rider, driver, and admin roles
- Flexible role combinations
- Proper error responses

### ✅ Rate Limiting
- Authentication endpoints: 5 requests per 15 minutes
- OTP endpoints: 3 requests per 5 minutes
- IP-based rate limiting

## API Endpoints

### Phone Registration
```http
POST /api/auth/register-phone
Content-Type: application/json

{
  "phone": "1234567890",
  "name": "John Doe",
  "role": "rider"
}

// For drivers, include additional fields:
{
  "phone": "1234567890",
  "name": "Jane Driver",
  "role": "driver",
  "licenseNumber": "DL123456789",
  "vehicleDetails": {
    "make": "Toyota",
    "model": "Camry",
    "plateNumber": "ABC123",
    "color": "Blue",
    "year": 2020
  }
}
```

### OTP Verification
```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone": "1234567890",
  "otp": "123456",
  "password": "securePassword123",
  "tempUserData": {
    "name": "John Doe",
    "role": "rider"
  }
}
```

### Admin Email Login
```http
POST /api/auth/login-email
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "adminPassword123"
}
```

### Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "admin@example.com"
}
```

### Development OTP Retrieval
```http
GET /api/auth/dev/otp/1234567890
```

## Middleware Usage

### Protect Routes with Authentication
```javascript
const { requireAuth } = require('../middleware/auth');

router.get('/protected', requireAuth, (req, res) => {
  // req.user contains authenticated user data
  res.json({ user: req.user });
});
```

### Role-Based Protection
```javascript
const { requireAdmin, requireDriver, requireRiderOrDriver } = require('../middleware/auth');

// Admin only
router.get('/admin/users', requireAdmin, adminController.getUsers);

// Driver only
router.post('/driver/location', requireDriver, driverController.updateLocation);

// Rider or Driver
router.post('/rides/book', requireRiderOrDriver, rideController.bookRide);
```

### Custom Role Authorization
```javascript
const { authorizeRoles } = require('../middleware/auth');

// Multiple specific roles
router.get('/special', authorizeRoles(['admin', 'driver']), controller.specialEndpoint);
```

## Security Features

### Input Validation
- Joi schema validation for all endpoints
- Phone number format validation (E.164)
- Email format validation
- Password strength requirements

### Rate Limiting
- Prevents brute force attacks
- Different limits for different endpoint types
- IP-based tracking

### Token Security
- JWT with proper issuer and audience claims
- Secure token extraction from headers
- Token expiration handling
- Refresh token support

### Error Handling
- Consistent error response format
- No sensitive information leakage
- Proper HTTP status codes
- Detailed error logging

## Environment Variables Required

```bash
# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-here

# Database
MONGO_URI=mongodb://localhost:27017/cab_aggregator

# Optional: PII Encryption
ENCRYPTION_KEY=test-encryption-key-exactly-32bb

# Development
NODE_ENV=development
```

## Testing

The authentication system includes comprehensive tests:

- **Unit Tests**: Password hashing, JWT operations, OTP generation
- **Middleware Tests**: Role-based authorization
- **Integration Tests**: Full endpoint testing (requires database)

Run tests:
```bash
npm test
```

## Development Notes

### OTP Simulation
In development mode, OTPs are logged to the console:
```
📱 SMS Simulation - OTP for 1234567890: 123456
⏰ OTP expires at: 2024-01-01T12:05:00.000Z
```

### Password Reset Simulation
Password reset links are logged to the console:
```
📧 Email Simulation - Password Reset for admin@example.com
🔗 Reset Link: http://localhost:3000/reset-password?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
⏰ Reset token expires in 1 hour
```

### Dev OTP Endpoint
Use the development endpoint to retrieve OTPs for testing:
```bash
curl http://localhost:5000/api/auth/dev/otp/1234567890
```

## Requirements Compliance

This implementation satisfies the following requirements:

- **1.1**: Phone registration with OTP verification ✅
- **1.2**: JWT token authentication with 5-minute OTP expiration ✅
- **1.3**: OTP attempt limiting (3 attempts, 15-minute lockout) ✅
- **1.5**: Dev-only OTP endpoint for testing ✅
- **5.5**: Admin email/password login with forgot password ✅
- **8.1**: Role-based access control and secure authentication ✅

All password hashing uses bcrypt with minimum 10 salt rounds as specified.