/**
 * UNIT TESTS for RoutingService
 *
 * Verifies the OSRM success path and the Haversine circuit-breaker fallback path
 * (mocking global.fetch rather than hitting the real OSRM server).
 */

const RoutingService = require('../../services/RoutingService');
const gracefulDegradation = require('../../services/GracefulDegradationService');

const pickup = [-74.006, 40.7128]; // NYC
const destination = [-75.1652, 39.9526]; // Philadelphia

describe('RoutingService', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
        // Circuit breaker state persists across tests on the shared singleton -
        // reset it so a failure in one test doesn't open the breaker for the next.
        gracefulDegradation.resetAllCircuitBreakers();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns OSRM route distance/duration on success', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                routes: [{ distance: 130000, duration: 5400 }] // 130km, 90min
            })
        });

        const result = await RoutingService.getRoute(pickup, destination);

        expect(result.source).toBe('osrm');
        expect(result.distanceKm).toBeCloseTo(130, 0);
        expect(result.durationMin).toBeCloseTo(90, 0);
    });

    it('falls back to Haversine when OSRM is unreachable', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

        const result = await RoutingService.getRoute(pickup, destination);

        expect(result.source).toBe('haversine');
        expect(result.distanceKm).toBeGreaterThan(0);
        expect(result.durationMin).toBeGreaterThan(0);
    });

    it('falls back to Haversine when OSRM responds with a non-2xx status', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

        const result = await RoutingService.getRoute(pickup, destination);

        expect(result.source).toBe('haversine');
    });

    it('falls back to Haversine when OSRM returns no routes', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ routes: [] })
        });

        const result = await RoutingService.getRoute(pickup, destination);

        expect(result.source).toBe('haversine');
    });
});
