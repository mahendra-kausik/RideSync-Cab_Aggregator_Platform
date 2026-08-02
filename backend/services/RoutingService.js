const gracefulDegradation = require('./GracefulDegradationService');

/**
 * Routing Service
 *
 * Computes real road-route distance/duration via OSRM, replacing the straight-line
 * (Haversine) estimate that previously drove both fare and every displayed distance/
 * duration. Routed through GracefulDegradationService's circuit breaker so a slow or
 * down OSRM instance falls back to Haversine instead of failing a ride booking.
 */
class RoutingService {
    static OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

    /**
     * Get route distance/duration between two points.
     *
     * @param {[number, number]} pickupCoords - [lng, lat]
     * @param {[number, number]} destCoords - [lng, lat]
     * @returns {Promise<{distanceKm: number, durationMin: number, source: 'osrm'|'haversine'}>}
     */
    static async getRoute(pickupCoords, destCoords) {
        return await gracefulDegradation.getRoute(
            () => this._fetchOsrmRoute(pickupCoords, destCoords),
            () => this._haversineFallback(pickupCoords, destCoords)
        );
    }

    static async _fetchOsrmRoute(pickupCoords, destCoords) {
        const url = `${this.OSRM_BASE_URL}/${pickupCoords[0]},${pickupCoords[1]};${destCoords[0]},${destCoords[1]}?overview=false`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`OSRM request failed with status ${response.status}`);
        }

        const data = await response.json();
        const route = data.routes && data.routes[0];

        if (!route) {
            throw new Error('OSRM returned no route');
        }

        return {
            distanceKm: route.distance / 1000,
            durationMin: route.duration / 60,
            source: 'osrm'
        };
    }

    static _haversineFallback(pickupCoords, destCoords) {
        const RideController = require('../controllers/rideController');
        const distanceKm = RideController.calculateDistance(pickupCoords, destCoords);
        const durationMin = RideController.estimateDuration(distanceKm);

        return { distanceKm, durationMin, source: 'haversine' };
    }
}

module.exports = RoutingService;
