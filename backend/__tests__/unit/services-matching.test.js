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
        // These tests exercise the real coordinate-validation path, which the global
        // DISABLE_MATCHING test-env flag (set in __tests__/setup.js) short-circuits
        // before it's ever reached.
        beforeEach(() => {
            delete process.env.DISABLE_MATCHING;
        });

        afterEach(() => {
            process.env.DISABLE_MATCHING = 'true';
        });

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
    // Date.now() only has millisecond resolution, so timing a sub-millisecond call with it
    // is a coin flip: any run that straddles a tick boundary reads as "1ms" and fails a <1
    // assertion even though the real duration is a few microseconds. process.hrtime.bigint()
    // has nanosecond resolution and measures what these tests actually mean to check.
    const elapsedMs = (startNs) => Number(process.hrtime.bigint() - startNs) / 1e6;

    it('should calculate distance in less than 1ms', () => {
        const startTime = process.hrtime.bigint();

        MatchingService._calculateDistance(-74.006, 40.7128, -75.1652, 39.9526);

        expect(elapsedMs(startTime)).toBeLessThan(1);
    });

    it('should estimate arrival time in less than 1ms', () => {
        const startTime = process.hrtime.bigint();

        MatchingService._estimateArrivalTime(-74.006, 40.7128, -74.006, 40.7218);

        expect(elapsedMs(startTime)).toBeLessThan(1);
    });

    it('should validate coordinates in less than 1ms', () => {
        const startTime = process.hrtime.bigint();

        MatchingService._validateCoordinates(-74.006, 40.7128);

        expect(elapsedMs(startTime)).toBeLessThan(1);
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

describe('MatchingService - Offer / Accept / Decline flow', () => {
    // These exercise real DB writes (offerRideToDriver etc. don't check
    // DISABLE_MATCHING themselves), but re-matching after a decline/expiry goes
    // through findNearestDriver, which does - so it must be unset for those cases.
    beforeEach(() => {
        delete process.env.DISABLE_MATCHING;
    });

    afterEach(() => {
        process.env.DISABLE_MATCHING = 'true';
    });

    // createTestRide's own default fare/distance/duration fields don't satisfy
    // Ride's required-field validation, so tests here supply their own.
    const makeTestRide = (overrides = {}) => global.testUtils.createTestRide({
        estimatedDistance: 5,
        estimatedDuration: 12,
        fare: {
            estimated: 15.5,
            breakdown: { baseFare: 5, distanceFare: 8, timeFare: 2.5, surgeFare: 0 }
        },
        ...overrides
    });

    it('offerRideToDriver puts the ride into matched state with an offer deadline, not accepted', async () => {
        const driver = await global.testUtils.createTestDriver();
        const ride = await makeTestRide();

        const result = await MatchingService.offerRideToDriver(ride._id, driver._id);

        expect(result.success).toBe(true);
        expect(result.offerExpiresAt).toBeInstanceOf(Date);

        const { Ride } = require('../../models');
        const updated = await Ride.findById(ride._id);
        expect(updated.status).toBe('matched');
        expect(updated.driverId.toString()).toBe(driver._id.toString());
        expect(updated.timeline.acceptedAt).toBeNull();
        expect(updated.offerExpiresAt).not.toBeNull();
    });

    it('acceptOffer moves matched -> accepted only for the offered driver', async () => {
        const driver = await global.testUtils.createTestDriver();
        const otherDriver = await global.testUtils.createTestDriver({ phone: '1000000001' });
        const ride = await makeTestRide();
        await MatchingService.offerRideToDriver(ride._id, driver._id);

        const wrongDriverResult = await MatchingService.acceptOffer(ride._id, otherDriver._id);
        expect(wrongDriverResult.success).toBe(false);
        expect(wrongDriverResult.error).toBe('ASSIGNMENT_CONFLICT');

        const result = await MatchingService.acceptOffer(ride._id, driver._id);
        expect(result.success).toBe(true);
        expect(result.ride.status).toBe('accepted');
        expect(result.ride.timeline.acceptedAt).not.toBeNull();
        expect(result.ride.offerExpiresAt).toBeNull();
    });

    it('declineOffer reverts the ride to requested, records rejectedBy, releases the driver, and re-offers to the next nearest driver', async () => {
        const nearDriver = await global.testUtils.createTestDriver({
            phone: '1000000002',
            driverInfo: {
                licenseNumber: 'DL1',
                vehicleDetails: { make: 'Toyota', model: 'Camry', plateNumber: 'AAA111', color: 'Blue' },
                isAvailable: true,
                currentLocation: { type: 'Point', coordinates: [-74.006, 40.7128] } // exact pickup
            }
        });
        const fartherDriver = await global.testUtils.createTestDriver({
            phone: '1000000003',
            driverInfo: {
                licenseNumber: 'DL2',
                vehicleDetails: { make: 'Honda', model: 'Civic', plateNumber: 'BBB222', color: 'Red' },
                isAvailable: true,
                currentLocation: { type: 'Point', coordinates: [-74.02, 40.73] } // a bit farther
            }
        });
        const ride = await makeTestRide();

        await MatchingService.offerRideToDriver(ride._id, nearDriver._id);

        const declineResult = await MatchingService.declineOffer(ride._id, nearDriver._id);
        expect(declineResult.success).toBe(true);

        const { Ride, User } = require('../../models');
        const updated = await Ride.findById(ride._id);
        expect(updated.rejectedBy.map(id => id.toString())).toContain(nearDriver._id.toString());

        // Re-matched to the other available driver instead of being stranded
        expect(updated.status).toBe('matched');
        expect(updated.driverId.toString()).toBe(fartherDriver._id.toString());

        // Declining driver is available again
        const releasedDriver = await User.findById(nearDriver._id);
        expect(releasedDriver.driverInfo.isAvailable).toBe(true);
    });

    it('expireStaleOffers reverts a lapsed offer, records rejectedBy, and releases the driver', async () => {
        const driver = await global.testUtils.createTestDriver();
        const ride = await makeTestRide();
        await MatchingService.offerRideToDriver(ride._id, driver._id);

        // Force the offer into the past so the sweeper picks it up
        const { Ride, User } = require('../../models');
        await Ride.findByIdAndUpdate(ride._id, { offerExpiresAt: new Date(Date.now() - 1000) });

        const revertedCount = await MatchingService.expireStaleOffers();
        expect(revertedCount).toBe(1);

        const updated = await Ride.findById(ride._id);
        expect(updated.rejectedBy.map(id => id.toString())).toContain(driver._id.toString());

        const releasedDriver = await User.findById(driver._id);
        expect(releasedDriver.driverInfo.isAvailable).toBe(true);
    });

    it('expireStaleOffers notifies the rider the ride is back to requested', async () => {
        const socketService = require('../../services/socketService');
        const broadcastSpy = jest.spyOn(socketService, 'broadcastToRide').mockImplementation(() => {});

        const driver = await global.testUtils.createTestDriver();
        const ride = await makeTestRide();
        await MatchingService.offerRideToDriver(ride._id, driver._id);

        const { Ride } = require('../../models');
        await Ride.findByIdAndUpdate(ride._id, { offerExpiresAt: new Date(Date.now() - 1000) });

        broadcastSpy.mockClear(); // drop the 'matched' broadcast from offerRideToDriver
        await MatchingService.expireStaleOffers();

        expect(broadcastSpy).toHaveBeenCalledWith(ride._id.toString(), 'ride:status-change', expect.objectContaining({
            rideId: ride._id.toString(),
            status: 'requested'
        }));

        broadcastSpy.mockRestore();
    });

    it('does not re-offer to a driver already in rejectedBy', async () => {
        const decliningDriver = await global.testUtils.createTestDriver();
        const ride = await makeTestRide();

        await MatchingService.offerRideToDriver(ride._id, decliningDriver._id);
        await MatchingService.declineOffer(ride._id, decliningDriver._id);

        // Only one driver exists and they already declined - no one left to offer to
        const { Ride } = require('../../models');
        const updated = await Ride.findById(ride._id);
        expect(updated.status).toBe('requested');
        expect(updated.driverId).toBeNull();
    });

    it('offerRideToDriver refuses to re-offer a ride to a driver already in rejectedBy', async () => {
        const driver = await global.testUtils.createTestDriver();
        const ride = await makeTestRide();
        await MatchingService.offerRideToDriver(ride._id, driver._id);
        await MatchingService.declineOffer(ride._id, driver._id);

        // Ride is back to 'requested' with driverId:null - the same shape offerRideToDriver's
        // main guard accepts - but rejectedBy must still block the same driver claiming it.
        const result = await MatchingService.offerRideToDriver(ride._id, driver._id);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ASSIGNMENT_CONFLICT');
    });

    it('acceptOffer refuses an offer whose deadline has already passed, even before the sweeper reverts it', async () => {
        const driver = await global.testUtils.createTestDriver();
        const ride = await makeTestRide();
        await MatchingService.offerRideToDriver(ride._id, driver._id);

        // Simulate the offer having lapsed without the 10s sweeper having reached it yet
        const { Ride } = require('../../models');
        await Ride.findByIdAndUpdate(ride._id, { offerExpiresAt: new Date(Date.now() - 1000) });

        const result = await MatchingService.acceptOffer(ride._id, driver._id);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ASSIGNMENT_CONFLICT');

        const updated = await Ride.findById(ride._id);
        expect(updated.status).toBe('matched'); // untouched by the failed accept - sweeper still owns the revert
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
