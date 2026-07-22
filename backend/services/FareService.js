/**
 * Fare Calculation Service
 *
 * Implements dynamic fare calculation with configurable pricing components:
 * Formula: base_fare + (per_km * distance) + (per_min * duration) * surge_multiplier
 *
 * Performance Characteristics:
 * - Time Complexity: O(1) for fare calculations
 * - Space Complexity: O(1) for fare breakdown objects
 * - Precision: All monetary values rounded to 2 decimal places
 *
 * Optimization Notes:
 * - Surge pricing applied multiplicatively to total base fare
 * - Configurable pricing tiers for different service levels
 * - Built-in validation for reasonable fare bounds
 * - Supports both estimated and final fare calculations
 */
class FareService {
  // Base pricing configuration (in INR)
  static PRICING_CONFIG = {
    baseFare: 50,          // Fixed base fare (₹)
    perKmRate: 12,         // Rate per kilometer (₹/km)
    perMinRate: 2,         // Rate per minute (₹/min)
    minimumFare: 75,       // Minimum fare regardless of distance/time (₹)
    maximumFare: 5000,     // Maximum fare cap for safety (₹)

    // Surge pricing thresholds
    surgePricing: {
      low: 1.0,      // Normal pricing (no surge)
      medium: 1.5,   // 50% surge
      high: 2.0,     // 100% surge
      peak: 2.5      // 150% surge
    },

    // Service level multipliers
    serviceLevels: {
      economy: 1.0,
      comfort: 1.3,
      premium: 1.8
    }
  };

  /**
   * Calculate fare for a ride based on distance, duration, and surge conditions
   *
   * @param {number} distance - Distance in kilometers
   * @param {number} duration - Duration in minutes
   * @param {number} surgeMultiplier - Surge pricing multiplier (default: 1.0)
   * @param {string} serviceLevel - Service level: 'economy', 'comfort', 'premium' (default: 'economy')
   * @returns {Object} Detailed fare breakdown with all components
   */
  static calculateFare(distance, duration, surgeMultiplier = 1.0, serviceLevel = 'economy') {
    try {
      // Input validation
      this._validateFareInputs(distance, duration, surgeMultiplier, serviceLevel);

      const config = this.PRICING_CONFIG;
      const serviceLevelMultiplier = config.serviceLevels[serviceLevel] || 1.0;

      // Calculate base components
      const baseFare = config.baseFare * serviceLevelMultiplier;
      const distanceFare = distance * config.perKmRate * serviceLevelMultiplier;
      const timeFare = duration * config.perMinRate * serviceLevelMultiplier;

      // Calculate subtotal before surge
      const subtotal = baseFare + distanceFare + timeFare;

      // Apply surge pricing
      const surgeFare = subtotal * (surgeMultiplier - 1.0);
      const totalBeforeCap = subtotal + surgeFare;

      // Apply minimum and maximum fare caps
      let totalFare = Math.max(totalBeforeCap, config.minimumFare);
      totalFare = Math.min(totalFare, config.maximumFare);

      // Determine if fare was capped
      const wasMinimumApplied = totalBeforeCap < config.minimumFare;
      const wasMaximumApplied = totalBeforeCap > config.maximumFare;

      return {
        // Individual components
        baseFare: this._roundToTwoDecimals(baseFare),
        distanceFare: this._roundToTwoDecimals(distanceFare),
        timeFare: this._roundToTwoDecimals(timeFare),
        surgeFare: this._roundToTwoDecimals(surgeFare),

        // Totals
        subtotal: this._roundToTwoDecimals(subtotal),
        totalFare: this._roundToTwoDecimals(totalFare),

        // Metadata
        surgeMultiplier: surgeMultiplier,
        serviceLevel: serviceLevel,
        serviceLevelMultiplier: serviceLevelMultiplier,

        // Fare adjustments
        adjustments: {
          minimumFareApplied: wasMinimumApplied,
          maximumFareApplied: wasMaximumApplied,
          originalTotal: wasMinimumApplied || wasMaximumApplied ?
            this._roundToTwoDecimals(totalBeforeCap) : null
        },

        // Trip details
        tripDetails: {
          distance: this._roundToTwoDecimals(distance),
          duration: Math.round(duration),
          estimatedAt: new Date()
        },

        // Pricing breakdown for transparency
        breakdown: {
          baseRate: config.baseFare,
          perKmRate: config.perKmRate,
          perMinRate: config.perMinRate,
          currency: 'INR'
        }
      };

    } catch (error) {
      console.error('Fare calculation error:', error);
      throw new Error(`Fare calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate surge multiplier based on current demand conditions
   *
   * @param {Object} demandData - Current demand metrics
   * @param {number} demandData.activeRides - Number of active rides
   * @param {number} demandData.availableDrivers - Number of available drivers
   * @param {number} demandData.pendingRequests - Number of pending ride requests
   * @param {boolean} demandData.isPeakHour - Whether it's currently peak hour
   * @returns {number} Calculated surge multiplier
   */
  static calculateSurgeMultiplier(demandData) {
    try {
      const { activeRides = 0, availableDrivers = 1, pendingRequests = 0, isPeakHour = false } = demandData;

      // Calculate demand-to-supply ratio
      const demandSupplyRatio = (activeRides + pendingRequests) / Math.max(availableDrivers, 1);

      // Base surge calculation
      let surgeMultiplier = 1.0;

      // Apply surge based on demand-supply ratio
      if (demandSupplyRatio > 3.0) {
        surgeMultiplier = this.PRICING_CONFIG.surgePricing.peak; // 2.5x
      } else if (demandSupplyRatio > 2.0) {
        surgeMultiplier = this.PRICING_CONFIG.surgePricing.high; // 2.0x
      } else if (demandSupplyRatio > 1.5) {
        surgeMultiplier = this.PRICING_CONFIG.surgePricing.medium; // 1.5x
      }

      // Additional surge for peak hours
      if (isPeakHour && surgeMultiplier < this.PRICING_CONFIG.surgePricing.medium) {
        surgeMultiplier = Math.max(surgeMultiplier, this.PRICING_CONFIG.surgePricing.medium);
      }

      return this._roundToTwoDecimals(surgeMultiplier);

    } catch (error) {
      console.error('Surge calculation error:', error);
      return 1.0; // Default to no surge on error
    }
  }

  /**
   * Estimate fare for a potential ride (used for fare estimation endpoint)
   *
   * @param {number} distance - Distance in kilometers
   * @param {number} duration - Duration in minutes
   * @param {Object} options - Additional options
   * @param {string} options.serviceLevel - Service level
   * @param {Object} options.demandData - Current demand data for surge calculation
   * @returns {Object} Fare estimate with range and surge info
   */
  static estimateFare(distance, duration, options = {}) {
    try {
      const { serviceLevel = 'economy', demandData = {} } = options;

      // Calculate current surge multiplier
      const currentSurge = this.calculateSurgeMultiplier(demandData);

      // Calculate fare with current conditions
      const currentFare = this.calculateFare(distance, duration, currentSurge, serviceLevel);

      // Calculate fare range (no surge to peak surge)
      const minFare = this.calculateFare(distance, duration, 1.0, serviceLevel);
      const maxFare = this.calculateFare(distance, duration, this.PRICING_CONFIG.surgePricing.peak, serviceLevel);

      return {
        estimatedFare: currentFare.totalFare,
        fareRange: {
          minimum: minFare.totalFare,
          maximum: maxFare.totalFare
        },
        currentSurge: currentSurge,
        surgeActive: currentSurge > 1.0,
        breakdown: currentFare.breakdown,
        serviceLevel: serviceLevel,
        estimatedAt: new Date(),

        // Additional context
        context: {
          hasSurge: currentSurge > 1.0,
          surgeReason: this._getSurgeReason(demandData),
          estimatedPickupTime: this._estimatePickupTime(demandData)
        }
      };

    } catch (error) {
      console.error('Fare estimation error:', error);
      throw new Error(`Fare estimation failed: ${error.message}`);
    }
  }

  /**
   * Calculate final fare after ride completion with actual metrics
   *
   * @param {Object} rideData - Completed ride data
   * @param {number} rideData.actualDistance - Actual distance traveled
   * @param {number} rideData.actualDuration - Actual ride duration
   * @param {number} rideData.estimatedFare - Originally estimated fare
   * @param {string} rideData.serviceLevel - Service level used
   * @param {number} rideData.surgeMultiplier - Surge multiplier at booking time
   * @returns {Object} Final fare calculation with comparison to estimate
   */
  static calculateFinalFare(rideData) {
    try {
      const {
        actualDistance,
        actualDuration,
        estimatedFare,
        serviceLevel = 'economy',
        surgeMultiplier = 1.0
      } = rideData;

      // Calculate final fare based on actual metrics
      const finalFare = this.calculateFare(actualDistance, actualDuration, surgeMultiplier, serviceLevel);

      // Compare with original estimate
      const fareComparison = {
        estimated: estimatedFare,
        actual: finalFare.totalFare,
        difference: this._roundToTwoDecimals(finalFare.totalFare - estimatedFare),
        percentageChange: this._roundToTwoDecimals(
          ((finalFare.totalFare - estimatedFare) / estimatedFare) * 100
        )
      };

      return {
        ...finalFare,
        comparison: fareComparison,
        finalizedAt: new Date(),

        // Billing information
        billing: {
          chargeAmount: finalFare.totalFare,
          currency: 'INR',
          breakdown: finalFare.breakdown,
          adjustments: finalFare.adjustments
        }
      };

    } catch (error) {
      console.error('Final fare calculation error:', error);
      throw new Error(`Final fare calculation failed: ${error.message}`);
    }
  }

  /**
   * Get pricing configuration for display purposes
   *
   * @returns {Object} Current pricing configuration
   */
  static getPricingConfig() {
    return {
      ...this.PRICING_CONFIG,
      lastUpdated: new Date(),
      version: '1.0.0'
    };
  }

  // Private helper methods

  /**
   * Validate fare calculation inputs
   *
   * @private
   * @param {number} distance - Distance to validate
   * @param {number} duration - Duration to validate
   * @param {number} surgeMultiplier - Surge multiplier to validate
   * @param {string} serviceLevel - Service level to validate
   */
  static _validateFareInputs(distance, duration, surgeMultiplier, serviceLevel) {
    if (typeof distance !== 'number' || distance < 0 || distance > 1000) {
      throw new Error('Distance must be a positive number less than 1000km');
    }

    if (typeof duration !== 'number' || duration < 0 || duration > 1440) {
      throw new Error('Duration must be a positive number less than 1440 minutes (24 hours)');
    }

    if (typeof surgeMultiplier !== 'number' || surgeMultiplier < 1.0 || surgeMultiplier > 5.0) {
      throw new Error('Surge multiplier must be between 1.0 and 5.0');
    }

    if (!Object.prototype.hasOwnProperty.call(this.PRICING_CONFIG.serviceLevels, serviceLevel)) {
      throw new Error(`Invalid service level: ${serviceLevel}`);
    }
  }

  /**
   * Round number to two decimal places
   *
   * @private
   * @param {number} value - Value to round
   * @returns {number} Rounded value
   */
  static _roundToTwoDecimals(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * Get human-readable surge reason
   *
   * @private
   * @param {Object} demandData - Demand data
   * @returns {string} Surge reason
   */
  static _getSurgeReason(demandData) {
    const { activeRides = 0, availableDrivers = 1, isPeakHour = false } = demandData;
    const ratio = (activeRides) / Math.max(availableDrivers, 1);

    if (ratio > 3.0) {
      return 'Very high demand';
    }
    if (ratio > 2.0) {
      return 'High demand';
    }
    if (ratio > 1.5) {
      return 'Increased demand';
    }
    if (isPeakHour) {
      return 'Peak hours';
    }
    return 'Normal pricing';
  }

  /**
   * Estimate pickup time based on demand
   *
   * @private
   * @param {Object} demandData - Demand data
   * @returns {number} Estimated pickup time in minutes
   */
  static _estimatePickupTime(demandData) {
    const { availableDrivers = 1, pendingRequests = 0 } = demandData;
    const basePickupTime = 5; // Base 5 minutes
    const demandDelay = Math.min(pendingRequests / availableDrivers * 2, 15); // Max 15 min delay

    return Math.round(basePickupTime + demandDelay);
  }
}

module.exports = FareService;