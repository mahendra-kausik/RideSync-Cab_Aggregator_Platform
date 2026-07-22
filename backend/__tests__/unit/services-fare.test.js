/**
 * UNIT TESTS for FareService
 *
 * Tests fare calculation logic in isolation
 * - Base fare calculation
 * - Distance and time-based pricing
 * - Surge pricing
 * - Service level multipliers
 * - Input validation
 *
 * Characteristics:
 * - Fast execution (<1 second per test)
 * - No database dependencies
 * - Pure function testing
 */

const FareService = require('../../services/FareService');

describe('FareService - Basic Fare Calculation', () => {
    describe('calculateFare', () => {
        it('should calculate fare with all components', () => {
            const distance = 10; // km
            const duration = 20; // minutes

            const result = FareService.calculateFare(distance, duration);

            expect(result).toBeDefined();
            expect(result.totalFare).toBeGreaterThan(0);
            expect(result.baseFare).toBe(50);
            expect(result.distanceFare).toBe(120); // 10 * 12
            expect(result.timeFare).toBe(40); // 20 * 2
            expect(result.subtotal).toBe(210); // 50 + 120 + 40
        });

        it('should apply minimum fare when calculated fare is too low', () => {
            const distance = 0.5; // Very short distance
            const duration = 2;   // Very short time

            const result = FareService.calculateFare(distance, duration);

            expect(result.totalFare).toBe(75); // Minimum fare
            expect(result.adjustments.minimumFareApplied).toBe(true);
            expect(result.adjustments.originalTotal).toBeLessThan(75);
        });

        it('should apply maximum fare cap', () => {
            const distance = 500; // Very long distance
            const duration = 600; // Very long duration

            const result = FareService.calculateFare(distance, duration);

            expect(result.totalFare).toBe(5000); // Maximum fare cap
            expect(result.adjustments.maximumFareApplied).toBe(true);
            expect(result.adjustments.originalTotal).toBeGreaterThan(5000);
        });

        it('should include breakdown information', () => {
            const result = FareService.calculateFare(10, 20);

            expect(result.breakdown).toBeDefined();
            expect(result.breakdown.baseRate).toBe(50);
            expect(result.breakdown.perKmRate).toBe(12);
            expect(result.breakdown.perMinRate).toBe(2);
            expect(result.breakdown.currency).toBe('INR');
        });

        it('should include trip details', () => {
            const result = FareService.calculateFare(10, 20);

            expect(result.tripDetails).toBeDefined();
            expect(result.tripDetails.distance).toBe(10);
            expect(result.tripDetails.duration).toBe(20);
            expect(result.tripDetails.estimatedAt).toBeInstanceOf(Date);
        });

        it('should round fare to 2 decimal places', () => {
            const distance = 7.333;
            const duration = 15.777;

            const result = FareService.calculateFare(distance, duration);

            expect(result.totalFare.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
            expect(result.distanceFare.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
        });
    });

    describe('calculateFare - Input Validation', () => {
        it('should throw error for negative distance', () => {
            expect(() => {
                FareService.calculateFare(-5, 20);
            }).toThrow('Distance must be a positive number');
        });

        it('should throw error for negative duration', () => {
            expect(() => {
                FareService.calculateFare(10, -10);
            }).toThrow('Duration must be a positive number');
        });

        it('should throw error for excessive distance', () => {
            expect(() => {
                FareService.calculateFare(1001, 20);
            }).toThrow('Distance must be a positive number less than 1000km');
        });

        it('should throw error for excessive duration', () => {
            expect(() => {
                FareService.calculateFare(10, 1500);
            }).toThrow('Duration must be a positive number less than 1440 minutes');
        });

        it('should throw error for invalid surge multiplier', () => {
            expect(() => {
                FareService.calculateFare(10, 20, 6.0);
            }).toThrow('Surge multiplier must be between 1.0 and 5.0');
        });

        it('should throw error for surge less than 1.0', () => {
            expect(() => {
                FareService.calculateFare(10, 20, 0.5);
            }).toThrow('Surge multiplier must be between 1.0 and 5.0');
        });

        it('should throw error for invalid service level', () => {
            expect(() => {
                FareService.calculateFare(10, 20, 1.0, 'luxury');
            }).toThrow('Invalid service level');
        });

        it('should accept zero distance', () => {
            expect(() => {
                FareService.calculateFare(0, 10);
            }).not.toThrow();
        });

        it('should accept zero duration', () => {
            expect(() => {
                FareService.calculateFare(10, 0);
            }).not.toThrow();
        });
    });
});

describe('FareService - Surge Pricing', () => {
    describe('calculateFare with surge', () => {
        it('should apply no surge multiplier (1.0)', () => {
            const result = FareService.calculateFare(10, 20, 1.0);

            expect(result.surgeMultiplier).toBe(1.0);
            expect(result.surgeFare).toBe(0);
            expect(result.totalFare).toBe(result.subtotal);
        });

        it('should apply 1.5x surge multiplier', () => {
            const result = FareService.calculateFare(10, 20, 1.5);

            expect(result.surgeMultiplier).toBe(1.5);
            expect(result.surgeFare).toBeGreaterThan(0);
            expect(result.totalFare).toBeGreaterThan(result.subtotal);

            // Total should be subtotal * 1.5
            const expectedTotal = result.subtotal * 1.5;
            expect(result.totalFare).toBeCloseTo(expectedTotal, 2);
        });

        it('should apply 2.0x surge multiplier', () => {
            const result = FareService.calculateFare(10, 20, 2.0);

            expect(result.surgeMultiplier).toBe(2.0);

            // Total should be subtotal * 2.0
            const expectedTotal = result.subtotal * 2.0;
            expect(result.totalFare).toBeCloseTo(expectedTotal, 2);
        });

        it('should calculate surge fare correctly', () => {
            const result = FareService.calculateFare(10, 20, 1.5);

            // Surge fare = subtotal * (multiplier - 1)
            const expectedSurgeFare = result.subtotal * 0.5;
            expect(result.surgeFare).toBeCloseTo(expectedSurgeFare, 2);
        });

        it('should apply surge before minimum fare check', () => {
            // Test with very small distance/duration that even with 1.5x surge stays below minimum
            // Base: 50, Distance: 0.1*12=1.2, Time: 1*2=2, Subtotal: 53.2
            // With 1.5x surge: 53.2 + (53.2 * 0.5) = 79.8 but still need to test minimum override
            // Let's use 0.05km, 0min to get subtotal close to 50: 50 + 0.6 + 0 = 50.6
            // With 1.3x surge: 50.6 * 1.3 = 65.78 < 75, so minimum should apply
            const result = FareService.calculateFare(0.05, 0, 1.3);

            // Even with surge, minimum fare should apply
            expect(result.totalFare).toBe(75);
            expect(result.adjustments.minimumFareApplied).toBe(true);
        });
    });

    describe('calculateSurgeMultiplier', () => {
        it('should return 1.0 for low demand', () => {
            const demandData = {
                activeRides: 5,
                availableDrivers: 10,
                pendingRequests: 2
            };

            const surge = FareService.calculateSurgeMultiplier(demandData);
            expect(surge).toBe(1.0);
        });

        it('should return 1.5 for medium demand', () => {
            const demandData = {
                activeRides: 10,
                availableDrivers: 10,
                pendingRequests: 6
                // Ratio: (10+6)/10 = 1.6 -> medium surge (1.5x)
            };

            const surge = FareService.calculateSurgeMultiplier(demandData);
            expect(surge).toBe(1.5);
        });

        it('should return 2.0 for high demand', () => {
            const demandData = {
                activeRides: 15,
                availableDrivers: 10,
                pendingRequests: 7
                // Ratio: (15+7)/10 = 2.2 -> high surge (2.0x)
            };

            const surge = FareService.calculateSurgeMultiplier(demandData);
            expect(surge).toBe(2.0);
        });

        it('should return 2.5 for peak demand', () => {
            const demandData = {
                activeRides: 40,
                availableDrivers: 10,
                pendingRequests: 10
            };

            const surge = FareService.calculateSurgeMultiplier(demandData);
            expect(surge).toBe(2.5);
        });

        it('should apply surge for peak hours', () => {
            const demandData = {
                activeRides: 5,
                availableDrivers: 10,
                pendingRequests: 2,
                isPeakHour: true
            };

            const surge = FareService.calculateSurgeMultiplier(demandData);
            expect(surge).toBeGreaterThanOrEqual(1.5);
        });

        it('should handle zero drivers gracefully', () => {
            const demandData = {
                activeRides: 10,
                availableDrivers: 0,
                pendingRequests: 5
            };

            const surge = FareService.calculateSurgeMultiplier(demandData);
            expect(surge).toBeGreaterThanOrEqual(1.0);
            expect(surge).toBeLessThanOrEqual(2.5);
        });

        it('should return 1.0 on error', () => {
            const surge = FareService.calculateSurgeMultiplier(null);
            expect(surge).toBe(1.0);
        });

        it('should handle missing demand data fields', () => {
            const surge = FareService.calculateSurgeMultiplier({});
            expect(surge).toBe(1.0);
        });
    });
});

describe('FareService - Service Levels', () => {
    describe('calculateFare with service levels', () => {
        it('should apply economy multiplier (1.0)', () => {
            const result = FareService.calculateFare(10, 20, 1.0, 'economy');

            expect(result.serviceLevel).toBe('economy');
            expect(result.serviceLevelMultiplier).toBe(1.0);
        });

        it('should apply comfort multiplier (1.3)', () => {
            const economyResult = FareService.calculateFare(10, 20, 1.0, 'economy');
            const comfortResult = FareService.calculateFare(10, 20, 1.0, 'comfort');

            expect(comfortResult.serviceLevel).toBe('comfort');
            expect(comfortResult.serviceLevelMultiplier).toBe(1.3);
            expect(comfortResult.totalFare).toBeGreaterThan(economyResult.totalFare);

            // Should be approximately 1.3x
            expect(comfortResult.totalFare / economyResult.totalFare).toBeCloseTo(1.3, 1);
        });

        it('should apply premium multiplier (1.8)', () => {
            const economyResult = FareService.calculateFare(10, 20, 1.0, 'economy');
            const premiumResult = FareService.calculateFare(10, 20, 1.0, 'premium');

            expect(premiumResult.serviceLevel).toBe('premium');
            expect(premiumResult.serviceLevelMultiplier).toBe(1.8);
            expect(premiumResult.totalFare).toBeGreaterThan(economyResult.totalFare);

            // Should be approximately 1.8x
            expect(premiumResult.totalFare / economyResult.totalFare).toBeCloseTo(1.8, 1);
        });

        it('should combine service level and surge multipliers', () => {
            const result = FareService.calculateFare(10, 20, 2.0, 'comfort');

            expect(result.serviceLevel).toBe('comfort');
            expect(result.surgeMultiplier).toBe(2.0);

            // Should be affected by both multipliers
            const baseResult = FareService.calculateFare(10, 20, 1.0, 'economy');
            expect(result.totalFare).toBeGreaterThan(baseResult.totalFare * 2.5);
        });
    });
});

describe('FareService - Fare Estimation', () => {
    describe('estimateFare', () => {
        it('should estimate fare with current conditions', () => {
            const result = FareService.estimateFare(10, 20);

            expect(result.estimatedFare).toBeDefined();
            expect(result.estimatedFare).toBeGreaterThan(0);
            expect(result.currentSurge).toBeDefined();
            expect(result.estimatedAt).toBeInstanceOf(Date);
        });

        it('should provide fare range', () => {
            const result = FareService.estimateFare(10, 20);

            expect(result.fareRange).toBeDefined();
            expect(result.fareRange.minimum).toBeDefined();
            expect(result.fareRange.maximum).toBeDefined();
            expect(result.fareRange.maximum).toBeGreaterThanOrEqual(result.fareRange.minimum);
        });

        it('should indicate surge status', () => {
            const demandData = {
                activeRides: 30,
                availableDrivers: 10,
                pendingRequests: 10
            };

            const result = FareService.estimateFare(10, 20, { demandData });

            expect(result.surgeActive).toBeDefined();
            expect(typeof result.surgeActive).toBe('boolean');
        });

        it('should provide context information', () => {
            const result = FareService.estimateFare(10, 20);

            expect(result.context).toBeDefined();
            expect(result.context.hasSurge).toBeDefined();
            expect(result.context.surgeReason).toBeDefined();
            expect(result.context.estimatedPickupTime).toBeDefined();
        });

        it('should respect service level', () => {
            const economyResult = FareService.estimateFare(10, 20, { serviceLevel: 'economy' });
            const premiumResult = FareService.estimateFare(10, 20, { serviceLevel: 'premium' });

            expect(premiumResult.estimatedFare).toBeGreaterThan(economyResult.estimatedFare);
        });
    });
});

describe('FareService - Final Fare Calculation', () => {
    describe('calculateFinalFare', () => {
        it('should calculate final fare after ride completion', () => {
            const rideData = {
                actualDistance: 12,
                actualDuration: 25,
                estimatedFare: 200,
                serviceLevel: 'economy',
                surgeMultiplier: 1.0
            };

            const result = FareService.calculateFinalFare(rideData);

            expect(result.totalFare).toBeDefined();
            expect(result.finalizedAt).toBeInstanceOf(Date);
            expect(result.billing).toBeDefined();
        });

        it('should compare actual vs estimated fare', () => {
            const rideData = {
                actualDistance: 12,
                actualDuration: 25,
                estimatedFare: 200,
                serviceLevel: 'economy',
                surgeMultiplier: 1.0
            };

            const result = FareService.calculateFinalFare(rideData);

            expect(result.comparison).toBeDefined();
            expect(result.comparison.estimated).toBe(200);
            expect(result.comparison.actual).toBeDefined();
            expect(result.comparison.difference).toBeDefined();
            expect(result.comparison.percentageChange).toBeDefined();
        });

        it('should include billing information', () => {
            const rideData = {
                actualDistance: 10,
                actualDuration: 20,
                estimatedFare: 210,
                serviceLevel: 'economy',
                surgeMultiplier: 1.0
            };

            const result = FareService.calculateFinalFare(rideData);

            expect(result.billing.chargeAmount).toBe(result.totalFare);
            expect(result.billing.currency).toBe('INR');
            expect(result.billing.breakdown).toBeDefined();
        });

        it('should maintain surge multiplier from booking', () => {
            const rideData = {
                actualDistance: 10,
                actualDuration: 20,
                estimatedFare: 315,
                serviceLevel: 'economy',
                surgeMultiplier: 1.5
            };

            const result = FareService.calculateFinalFare(rideData);

            expect(result.surgeMultiplier).toBe(1.5);
        });
    });
});

describe('FareService - Pricing Configuration', () => {
    describe('getPricingConfig', () => {
        it('should return pricing configuration', () => {
            const config = FareService.getPricingConfig();

            expect(config).toBeDefined();
            expect(config.baseFare).toBe(50);
            expect(config.perKmRate).toBe(12);
            expect(config.perMinRate).toBe(2);
            expect(config.minimumFare).toBe(75);
            expect(config.maximumFare).toBe(5000);
        });

        it('should include surge pricing tiers', () => {
            const config = FareService.getPricingConfig();

            expect(config.surgePricing).toBeDefined();
            expect(config.surgePricing.low).toBe(1.0);
            expect(config.surgePricing.medium).toBe(1.5);
            expect(config.surgePricing.high).toBe(2.0);
            expect(config.surgePricing.peak).toBe(2.5);
        });

        it('should include service levels', () => {
            const config = FareService.getPricingConfig();

            expect(config.serviceLevels).toBeDefined();
            expect(config.serviceLevels.economy).toBe(1.0);
            expect(config.serviceLevels.comfort).toBe(1.3);
            expect(config.serviceLevels.premium).toBe(1.8);
        });

        it('should include metadata', () => {
            const config = FareService.getPricingConfig();

            expect(config.lastUpdated).toBeInstanceOf(Date);
            expect(config.version).toBeDefined();
        });
    });
});

describe('FareService - Performance Tests', () => {
    it('should calculate fare in less than 10ms', () => {
        const startTime = Date.now();
        FareService.calculateFare(10, 20);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(10);
    });

    it('should calculate surge multiplier in less than 10ms', () => {
        const demandData = {
            activeRides: 20,
            availableDrivers: 10,
            pendingRequests: 5
        };

        const startTime = Date.now();
        FareService.calculateSurgeMultiplier(demandData);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(10);
    });

    it('should estimate fare in less than 50ms', () => {
        const startTime = Date.now();
        FareService.estimateFare(10, 20);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(50);
    });

    it('should handle 100 fare calculations quickly', () => {
        const startTime = Date.now();

        for (let i = 0; i < 100; i++) {
            FareService.calculateFare(Math.random() * 50, Math.random() * 60);
        }

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1000); // All 100 in less than 1 second
    });
});
