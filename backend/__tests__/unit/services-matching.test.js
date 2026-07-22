/**
 * UNIT TESTS for MatchingService Helper Functions
 *
 * Tests MatchingService utility functions in isolation without database
 * - Coordinate validation
 * - Distance calculation (Haversine formula)
 * - Arrival time estimation
 * - Configuration constants
 *
 * Characteristics:
 * - Fast execution (<1 second per test)
 * - No database dependencies
 * - Pure function testing
 */

const MatchingService = require('../../services/MatchingService');

describe('MatchingService - Coordinate Validation', () => {
    describe('_validateCoordinates (private method testing)', () => {
        // Test via public method behavior or access private method for testing

        it('should validate correct coordinates', () => {
            // Valid coordinates
            const validPairs = [
                [0, 0],
                [-74.006, 40.7128], // NYC
                [77.5946, 12.9716], // Bangalore
                [-180, -90], // Edge cases
                [180, 90],
                [-123.456, 45.678]
            ];

            validPairs.forEach(([lng, lat]) => {
                const isValid = MatchingService._validateCoordinates(lng, lat);
                expect(isValid).toBe(true);
            });
        });

        it('should reject invalid longitude', () => {
            const invalidLongitudes = [
                [-181, 40],
                [181, 40],
                [-200, 40],
                [200, 40]
            ];

            invalidLongitudes.forEach(([lng, lat]) => {
                const isValid = MatchingService._validateCoordinates(lng, lat);
                expect(isValid).toBe(false);
            });
        });

        it('should reject invalid latitude', () => {
            const invalidLatitudes = [
                [-74, -91],
                [-74, 91],
                [-74, -100],
                [-74, 100]
            ];

            invalidLatitudes.forEach(([lng, lat]) => {
                const isValid = MatchingService._validateCoordinates(lng, lat);
                expect(isValid).toBe(false);
            });
        });

        it('should reject non-numeric coordinates', () => {
            expect(MatchingService._validateCoordinates('invalid', 40)).toBe(false);
            expect(MatchingService._validateCoordinates(-74, 'invalid')).toBe(false);
            expect(MatchingService._validateCoordinates(null, 40)).toBe(false);
            expect(MatchingService._validateCoordinates(-74, null)).toBe(false);
            expect(MatchingService._validateCoordinates(undefined, 40)).toBe(false);
        });

        it('should reject NaN values', () => {
            expect(MatchingService._validateCoordinates(NaN, 40)).toBe(false);
            expect(MatchingService._validateCoordinates(-74, NaN)).toBe(false);
        });
    });
});

describe('MatchingService - Distance Calculation', () => {
    describe('_calculateDistance (Haversine formula)', () => {
        it('should calculate distance between two points', () => {
            // NYC to Philadelphia (approx 130 km)
            const lng1 = -74.006; // NYC
            const lat1 = 40.7128;
            const lng2 = -75.1652; // Philadelphia
            const lat2 = 39.9526;

            const distance = MatchingService._calculateDistance(lng1, lat1, lng2, lat2);

            expect(distance).toBeGreaterThan(0);
            expect(distance).toBeCloseTo(130, 0); // Approximately 130 km
        });

        it('should return 0 for same location', () => {
            const lng = -74.006;
            const lat = 40.7128;

            const distance = MatchingService._calculateDistance(lng, lat, lng, lat);

            expect(distance).toBe(0);
        });

        it('should calculate short distances accurately', () => {
            // Two nearby points (approximately 1 km apart)
            const lng1 = -74.006;
            const lat1 = 40.7128;
            const lng2 = -74.006;
            const lat2 = 40.7218; // About 1 km north

            const distance = MatchingService._calculateDistance(lng1, lat1, lng2, lat2);

            expect(distance).toBeGreaterThan(0.9);
            expect(distance).toBeLessThan(1.1);
        });

        it('should calculate long distances accurately', () => {
            // NYC to Los Angeles (approx 3944 km)
            const lng1 = -74.006; // NYC
            const lat1 = 40.7128;
            const lng2 = -118.2437; // LA
            const lat2 = 34.0522;

            const distance = MatchingService._calculateDistance(lng1, lat1, lng2, lat2);

            expect(distance).toBeGreaterThan(3900);
            expect(distance).toBeLessThan(4000);
        });

        it('should be symmetric (distance A to B = distance B to A)', () => {
            const lng1 = -74.006;
            const lat1 = 40.7128;
            const lng2 = -75.1652;
            const lat2 = 39.9526;

            const distanceAB = MatchingService._calculateDistance(lng1, lat1, lng2, lat2);
            const distanceBA = MatchingService._calculateDistance(lng2, lat2, lng1, lat1);

            expect(distanceAB).toBeCloseTo(distanceBA, 5);
        });

        it('should handle equator crossing', () => {
            const lng1 = 0;
            const lat1 = -5;
            const lng2 = 0;
            const lat2 = 5;

            const distance = MatchingService._calculateDistance(lng1, lat1, lng2, lat2);

            expect(distance).toBeGreaterThan(0);
            // 10 degrees latitude ≈ 1113 km, use precision 0 for integer comparison
            expect(distance).toBeCloseTo(1113, -1); // Within 10 km
        });

        it('should handle prime meridian crossing', () => {
            const lng1 = -5;
            const lat1 = 0;
            const lng2 = 5;
            const lat2 = 0;

            const distance = MatchingService._calculateDistance(lng1, lat1, lng2, lat2);

            expect(distance).toBeGreaterThan(0);
            // 10 degrees longitude at equator ≈ 1113 km
            expect(distance).toBeCloseTo(1113, -1); // Within 10 km
        });
    });
});

describe('MatchingService - Arrival Time Estimation', () => {
    describe('_estimateArrivalTime', () => {
        it('should estimate arrival time for nearby location', () => {
            // 1 km distance
            const lng1 = -74.006;
            const lat1 = 40.7128;
            const lng2 = -74.006;
            const lat2 = 40.7218;

            const arrivalTime = MatchingService._estimateArrivalTime(lng1, lat1, lng2, lat2);

            expect(arrivalTime).toBeGreaterThan(0);
            expect(arrivalTime).toBeLessThan(10); // Less than 10 minutes for 1 km
        });

        it('should estimate arrival time for moderate distance', () => {
            // 10 km distance
            const lng1 = -74.006;
            const lat1 = 40.7128;
            const lng2 = -74.006;
            const lat2 = 40.8028; // Approximately 10 km north

            const arrivalTime = MatchingService._estimateArrivalTime(lng1, lat1, lng2, lat2);

            expect(arrivalTime).toBeGreaterThan(10);
            expect(arrivalTime).toBeLessThan(40); // Should be around 24 minutes at 25 km/h
        });

        it('should return 0 for same location', () => {
            const lng = -74.006;
            const lat = 40.7128;

            const arrivalTime = MatchingService._estimateArrivalTime(lng, lat, lng, lat);

            expect(arrivalTime).toBe(0);
        });

        it('should return integer minutes', () => {
            const lng1 = -74.006;
            const lat1 = 40.7128;
            const lng2 = -74.006;
            const lat2 = 40.7218;

            const arrivalTime = MatchingService._estimateArrivalTime(lng1, lat1, lng2, lat2);

            expect(Number.isInteger(arrivalTime)).toBe(true);
        });

        it('should scale linearly with distance', () => {
            const lng1 = -74.006;
            const lat1 = 40.7128;

            // 5 km distance
            const lng2Short = -74.006;
            const lat2Short = 40.7578;

            // 10 km distance
            const lng2Long = -74.006;
            const lat2Long = 40.8028;

            const timeShort = MatchingService._estimateArrivalTime(lng1, lat1, lng2Short, lat2Short);
            const timeLong = MatchingService._estimateArrivalTime(lng1, lat1, lng2Long, lat2Long);

            expect(timeLong).toBeGreaterThan(timeShort);
            expect(timeLong / timeShort).toBeCloseTo(2, 0);
        });
    });
});

describe('MatchingService - Configuration Constants', () => {
    it('should have initial radius of 5000 meters', () => {
        expect(MatchingService.INITIAL_RADIUS).toBe(5000);
    });

    it('should have radius expansion steps', () => {
        expect(MatchingService.RADIUS_EXPANSION_STEPS).toBeDefined();
        expect(Array.isArray(MatchingService.RADIUS_EXPANSION_STEPS)).toBe(true);
        expect(MatchingService.RADIUS_EXPANSION_STEPS.length).toBeGreaterThan(0);
    });

    it('should have ascending radius expansion steps', () => {
        const steps = MatchingService.RADIUS_EXPANSION_STEPS;
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i]).toBeGreaterThan(steps[i - 1]);
        }
    });

    it('should have maximum drivers to consider limit', () => {
        expect(MatchingService.MAX_DRIVERS_TO_CONSIDER).toBeDefined();
        expect(MatchingService.MAX_DRIVERS_TO_CONSIDER).toBeGreaterThan(0);
    });

    it('should have driver response timeout', () => {
        expect(MatchingService.DRIVER_RESPONSE_TIMEOUT).toBeDefined();
        expect(MatchingService.DRIVER_RESPONSE_TIMEOUT).toBeGreaterThan(0);
    });
});

describe('MatchingService - Error Handling', () => {
    describe('findNearestDriver with invalid input', () => {
        it('should handle invalid coordinates gracefully', async () => {
            const result = await MatchingService.findNearestDriver(200, 100, 'ride123');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.message).toContain('Invalid');
        });

        it('should handle null coordinates', async () => {
            const result = await MatchingService.findNearestDriver(null, null, 'ride123');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle missing ride ID', async () => {
            const result = await MatchingService.findNearestDriver(-74.006, 40.7128, null);

            expect(result.success).toBe(false);
        });
    });
});

describe('MatchingService - Performance Tests', () => {
    it('should calculate distance in less than 1ms', () => {
        const startTime = Date.now();

        MatchingService._calculateDistance(-74.006, 40.7128, -75.1652, 39.9526);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1);
    });

    it('should estimate arrival time in less than 1ms', () => {
        const startTime = Date.now();

        MatchingService._estimateArrivalTime(-74.006, 40.7128, -74.006, 40.7218);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1);
    });

    it('should validate coordinates in less than 1ms', () => {
        const startTime = Date.now();

        MatchingService._validateCoordinates(-74.006, 40.7128);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1);
    });

    it('should handle 1000 distance calculations quickly', () => {
        const startTime = Date.now();

        for (let i = 0; i < 1000; i++) {
            MatchingService._calculateDistance(
                Math.random() * 180 - 90,
                Math.random() * 90 - 45,
                Math.random() * 180 - 90,
                Math.random() * 90 - 45
            );
        }

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(100); // All 1000 in less than 100ms
    });
});

describe('MatchingService - Edge Cases', () => {
    it('should handle north pole coordinates', () => {
        const distance = MatchingService._calculateDistance(0, 90, 180, 90);
        // Floating point precision: use toBeCloseTo instead of toBe
        expect(distance).toBeCloseTo(0, 10); // Both at north pole, within 1e-10 km
    });

    it('should handle south pole coordinates', () => {
        const distance = MatchingService._calculateDistance(0, -90, 180, -90);
        // Floating point precision: use toBeCloseTo instead of toBe
        expect(distance).toBeCloseTo(0, 10); // Both at south pole, within 1e-10 km
    });

    it('should handle international date line crossing', () => {
        const distance = MatchingService._calculateDistance(179, 0, -179, 0);
        expect(distance).toBeGreaterThan(0);
        expect(distance).toBeLessThan(300); // Should be small distance
    });

    it('should handle antipodal points', () => {
        // Opposite sides of Earth
        const distance = MatchingService._calculateDistance(0, 0, 180, 0);
        expect(distance).toBeGreaterThan(20000); // Half Earth's circumference
    });

    it('should handle very small distances', () => {
        const distance = MatchingService._calculateDistance(
            -74.006,
            40.7128,
            -74.00601,
            40.71281
        );

        expect(distance).toBeGreaterThan(0);
        expect(distance).toBeLessThan(0.01); // Less than 10 meters
    });
});
