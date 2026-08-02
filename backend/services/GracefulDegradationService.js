/**
 * Graceful Degradation Service
 * Handles fallback mechanisms when external services fail
 */

const { AppError, ErrorLogger } = require('../middleware/errorHandler');

/**
 * Circuit breaker pattern implementation
 */
class CircuitBreaker {
  constructor(name, threshold = 5, timeout = 60000, resetTimeout = 30000) {
    this.name = name;
    this.threshold = threshold; // Number of failures before opening circuit
    this.timeout = timeout; // Request timeout
    this.resetTimeout = resetTimeout; // Time before attempting to close circuit
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation, fallback = null) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log(`🔄 Circuit breaker ${this.name} attempting to close`);
      } else {
        console.log(`⚡ Circuit breaker ${this.name} is OPEN, using fallback`);
        return fallback ? await fallback() : this.getDefaultFallback();
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
        )
      ]);

      // Success - reset failure count and close circuit
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        console.log(`✅ Circuit breaker ${this.name} closed successfully`);
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      ErrorLogger.logError(error, null);

      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
        console.log(`🚨 Circuit breaker ${this.name} opened after ${this.failureCount} failures`);
      }

      // Use fallback if available
      if (fallback) {
        console.log(`🔄 Using fallback for ${this.name}`);
        return await fallback();
      }

      return this.getDefaultFallback();
    }
  }

  getDefaultFallback() {
    return {
      success: false,
      error: `Service ${this.name} is temporarily unavailable`,
      fallback: true
    };
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Graceful degradation service
 */
class GracefulDegradationService {
  constructor() {
    // Initialize circuit breakers for external services
    this.circuitBreakers = {
      maps: new CircuitBreaker('Maps Service', 3, 5000, 30000),
      sms: new CircuitBreaker('SMS Service', 3, 10000, 60000),
      payment: new CircuitBreaker('Payment Service', 2, 15000, 120000),
      geocoding: new CircuitBreaker('Geocoding Service', 3, 8000, 45000),
      routing: new CircuitBreaker('Routing Service', 3, 5000, 30000)
    };
  }

  /**
   * Routing service (OSRM) with fallback to straight-line distance
   */
  async getRoute(operation, fallback) {
    return await this.circuitBreakers.routing.execute(operation, fallback);
  }

  /**
   * Maps service with fallback to OpenStreetMap
   */
  async getMapsData(operation, coordinates) {
    return await this.circuitBreakers.maps.execute(
      operation,
      () => this.getOpenStreetMapFallback(coordinates)
    );
  }

  /**
   * SMS service with console logging fallback
   */
  async sendSMS(operation, phone, message) {
    return await this.circuitBreakers.sms.execute(
      operation,
      () => this.getConsoleSMSFallback(phone, message)
    );
  }

  /**
   * Payment service with mock payment fallback
   */
  async processPayment(operation, paymentData) {
    return await this.circuitBreakers.payment.execute(
      operation,
      () => this.getMockPaymentFallback(paymentData)
    );
  }

  /**
   * Geocoding service with coordinate-based fallback
   */
  async geocodeAddress(operation, address) {
    return await this.circuitBreakers.geocoding.execute(
      operation,
      () => this.getGeocodingFallback(address)
    );
  }

  /**
   * OpenStreetMap fallback for maps
   */
  async getOpenStreetMapFallback(coordinates) {
    console.log('🗺️  Using OpenStreetMap fallback for maps service');

    return {
      success: true,
      data: {
        tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        center: coordinates || [0, 0],
        zoom: 13,
        fallback: true,
        provider: 'OpenStreetMap'
      }
    };
  }

  /**
   * Console logging fallback for SMS
   */
  async getConsoleSMSFallback(phone, message) {
    console.log('📱 SMS Service Fallback - Console Logging:');
    console.log(`To: ${phone}`);
    console.log(`Message: ${message}`);
    console.log('---');

    // In development, also create a dev endpoint response
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        data: {
          messageId: `dev_${Date.now()}`,
          status: 'delivered',
          fallback: true,
          devNote: 'Check server console for SMS content'
        }
      };
    }

    return {
      success: true,
      data: {
        messageId: `fallback_${Date.now()}`,
        status: 'queued',
        fallback: true
      }
    };
  }

  /**
   * Mock payment fallback
   */
  async getMockPaymentFallback(paymentData) {
    console.log('💳 Payment Service Fallback - Mock Processing:');
    console.log(`Amount: $${paymentData.amount}`);
    console.log(`Method: ${paymentData.method || 'mock'}`);
    console.log('---');

    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate 95% success rate
    const isSuccess = Math.random() > 0.05;

    if (isSuccess) {
      return {
        success: true,
        data: {
          transactionId: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'completed',
          amount: paymentData.amount,
          currency: 'USD',
          fallback: true,
          provider: 'Mock Payment Service'
        }
      };
    } else {
      throw new AppError('Mock payment failed', 402, 'PAYMENT_FAILED');
    }
  }

  /**
   * Geocoding fallback using approximate coordinates
   */
  async getGeocodingFallback(address) {
    console.log('🌍 Geocoding Service Fallback - Approximate Location:');
    console.log(`Address: ${address}`);

    // Simple city-based coordinate mapping for common locations
    const cityCoordinates = {
      'bengaluru': [77.5946, 12.9716],
      'bangalore': [77.5946, 12.9716],
      'mumbai': [72.8777, 19.0760],
      'delhi': [77.1025, 28.7041],
      'chennai': [80.2707, 13.0827],
      'kolkata': [88.3639, 22.5726],
      'hyderabad': [78.4867, 17.3850],
      'pune': [73.8567, 18.5204],
      'new york': [-74.006, 40.7128],
      'los angeles': [-118.2437, 34.0522],
      'chicago': [-87.6298, 41.8781],
      'houston': [-95.3698, 29.7604],
      'phoenix': [-112.0740, 33.4484],
      'philadelphia': [-75.1652, 39.9526],
      'san antonio': [-98.4936, 29.4241],
      'san diego': [-117.1611, 32.7157],
      'dallas': [-96.7970, 32.7767],
      'san jose': [-121.8863, 37.3382]
    };

    // Try to find approximate coordinates
    const addressLower = address.toLowerCase();
    let coordinates = [77.5946, 12.9716]; // Default to Bengaluru, India

    for (const [city, coords] of Object.entries(cityCoordinates)) {
      if (addressLower.includes(city)) {
        coordinates = coords;
        break;
      }
    }

    return {
      success: true,
      data: {
        coordinates,
        address: address,
        accuracy: 'approximate',
        fallback: true,
        provider: 'Fallback Geocoding'
      }
    };
  }

  /**
   * Get health status of all circuit breakers
   */
  getHealthStatus() {
    const status = {};

    for (const [name, breaker] of Object.entries(this.circuitBreakers)) {
      status[name] = breaker.getStatus();
    }

    return {
      timestamp: new Date().toISOString(),
      circuitBreakers: status,
      overallHealth: Object.values(status).every(s => s.state === 'CLOSED') ? 'healthy' : 'degraded'
    };
  }

  /**
   * Reset all circuit breakers (for testing/admin purposes)
   */
  resetAllCircuitBreakers() {
    for (const breaker of Object.values(this.circuitBreakers)) {
      breaker.state = 'CLOSED';
      breaker.failureCount = 0;
      breaker.lastFailureTime = null;
    }

    console.log('🔄 All circuit breakers have been reset');
  }
}

// Export singleton instance
module.exports = new GracefulDegradationService();