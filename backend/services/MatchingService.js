const { User, Ride } = require('../models');
const mongoose = require('mongoose');
const { rideMatchDuration } = require('../config/metrics');
const socketService = require('./socketService');

/**
 * Driver Matching Service
 *
 * Implements geospatial queries to find nearest available drivers with configurable
 * radius expansion logic and atomic assignment operations to prevent conflicts.
 *
 * Performance Characteristics:
 * - Time Complexity: O(log n) for geospatial queries with 2dsphere index
 * - Space Complexity: O(k) where k is the number of drivers within radius
 * - Atomic Operations: Uses MongoDB findOneAndUpdate for conflict-free assignments
 *
 * Optimization Notes:
 * - Geospatial index on driverInfo.currentLocation enables efficient proximity queries
 * - Radius expansion prevents empty results in low-density areas
 * - Atomic updates prevent race conditions in concurrent ride assignments
 */
class MatchingService {
    // Configuration constants
    static INITIAL_RADIUS = 5000; // 5km in meters
    static RADIUS_EXPANSION_STEPS = [5000, 10000, 15000]; // 5km, 10km, 15km
    static MAX_DRIVERS_TO_CONSIDER = 10;
    static DRIVER_RESPONSE_TIMEOUT = 30000; // 30 seconds to accept/decline an offer

    /**
     * Find the nearest available driver for a ride request and offer them the ride
     * (does not auto-accept - see offerRideToDriver).
     *
     * @param {number} pickupLongitude - Pickup location longitude
     * @param {number} pickupLatitude - Pickup location latitude
     * @param {string} rideId - Ride ID for assignment
     * @param {number} initialRadius - Initial search radius in meters (default: 5000)
     * @param {string[]} excludeDriverIds - Drivers to skip (already offered/declined this ride)
     * @returns {Promise<Object>} Driver match result with driver info and metadata
     */
    static async findNearestDriver(pickupLongitude, pickupLatitude, rideId, initialRadius = this.INITIAL_RADIUS, excludeDriverIds = []) {
        const start = process.hrtime.bigint();
        try {
            return await this._findNearestDriver(pickupLongitude, pickupLatitude, rideId, initialRadius, excludeDriverIds);
        } finally {
            rideMatchDuration.observe(Number(process.hrtime.bigint() - start) / 1e9);
        }
    }

    static async _findNearestDriver(pickupLongitude, pickupLatitude, rideId, initialRadius = this.INITIAL_RADIUS, excludeDriverIds = []) {
        try {
            // Skip matching in test environment to prevent background async tasks
            if (process.env.DISABLE_MATCHING === 'true') {
                return {
                    success: false,
                    message: 'Driver matching disabled in test environment'
                };
            }

            // Check if DB is connected before proceeding
            if (mongoose.connection.readyState !== 1) {
                console.warn('⚠️ Database not connected - skipping driver matching');
                return {
                    success: false,
                    message: 'Database not connected'
                };
            }
            // Validate coordinates
            if (!this._validateCoordinates(pickupLongitude, pickupLatitude)) {
                throw new Error('Invalid pickup coordinates provided');
            }

            // Try each radius expansion step
            for (const radius of this.RADIUS_EXPANSION_STEPS) {
                if (radius < initialRadius) {
                  continue;
                }

                console.log(`🔍 Searching for drivers within ${radius / 1000}km radius...`);

                const drivers = await this._findAvailableDriversInRadius(
                    pickupLongitude,
                    pickupLatitude,
                    radius,
                    excludeDriverIds
                );

                if (drivers.length > 0) {
                    // Calculate distances and estimated arrival times.
                    // _findAvailableDriversInRadius returns lean() docs, so these are already
                    // plain objects - spread directly (calling .toObject() on them throws).
                    // A driver whose location is missing/malformed is skipped rather than
                    // allowed to throw and take the whole match down.
                    const driversWithMetadata = drivers
                        .filter(driver => Array.isArray(driver.driverInfo?.currentLocation?.coordinates))
                        .map(driver => ({
                            ...driver,
                            distance: this._calculateDistance(
                                pickupLongitude,
                                pickupLatitude,
                                driver.driverInfo.currentLocation.coordinates[0],
                                driver.driverInfo.currentLocation.coordinates[1]
                            ),
                            estimatedArrival: this._estimateArrivalTime(
                                pickupLongitude,
                                pickupLatitude,
                                driver.driverInfo.currentLocation.coordinates[0],
                                driver.driverInfo.currentLocation.coordinates[1]
                            )
                        }));

                    // Sort by distance (nearest first)
                    driversWithMetadata.sort((a, b) => a.distance - b.distance);

                    // Offer to the nearest driver first
                    const nearestDriver = driversWithMetadata[0];
                    const offerResult = await this.offerRideToDriver(rideId, nearestDriver._id);

                    if (offerResult.success) {
                        this._notifyOffer(rideId, nearestDriver, offerResult.offerExpiresAt);
                        return {
                            success: true,
                            driver: nearestDriver,
                            searchRadius: radius,
                            totalDriversFound: drivers.length,
                            offeredAt: new Date(),
                            offerExpiresAt: offerResult.offerExpiresAt
                        };
                    }

                    // If the offer couldn't be placed (conflict), try the next nearest driver
                    for (let i = 1; i < driversWithMetadata.length; i++) {
                        const fallbackResult = await this.offerRideToDriver(rideId, driversWithMetadata[i]._id);
                        if (fallbackResult.success) {
                            this._notifyOffer(rideId, driversWithMetadata[i], fallbackResult.offerExpiresAt);
                            return {
                                success: true,
                                driver: driversWithMetadata[i],
                                searchRadius: radius,
                                totalDriversFound: drivers.length,
                                offeredAt: new Date(),
                                offerExpiresAt: fallbackResult.offerExpiresAt,
                                fallbackAssignment: true
                            };
                        }
                    }
                }
            }

            // No drivers found in any radius
            return {
                success: false,
                error: 'NO_DRIVERS_AVAILABLE',
                message: 'No available drivers found within maximum search radius',
                maxRadiusSearched: Math.max(...this.RADIUS_EXPANSION_STEPS),
                searchedAt: new Date()
            };

        } catch (error) {
            console.error('Driver matching error:', error);
            return {
                success: false,
                error: 'MATCHING_SERVICE_ERROR',
                message: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Push a real-time offer notification to the driver, plus a status-change
     * event to the ride room so the rider's UI reflects "matched" (offer pending).
     * Best-effort - a driver who's offline just falls back to seeing it in their
     * pending list next poll.
     *
     * @private
     */
    static async _notifyOffer(rideId, driver, offerExpiresAt) {
        try {
            const ride = await Ride.findById(rideId).select('pickup destination fare estimatedDistance estimatedDuration');
            if (!ride) {
                return;
            }

            socketService.broadcastToUser(driver._id.toString(), 'ride:offer', {
                rideId: rideId.toString(),
                pickup: ride.pickup,
                destination: ride.destination,
                estimatedFare: ride.fare.estimated,
                estimatedDistance: ride.estimatedDistance,
                estimatedDuration: ride.estimatedDuration,
                expiresAt: offerExpiresAt
            });

            socketService.broadcastToRide(rideId.toString(), 'ride:status-change', {
                rideId: rideId.toString(),
                status: 'matched',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to send offer notification:', error);
        }
    }

    /**
     * Atomically offer a ride to a driver with conflict resolution.
     *
     * This does NOT accept the ride on the driver's behalf - it puts the ride into
     * 'matched' (offer-pending) state with a response deadline. The driver must call
     * acceptOffer or declineOffer; expireStaleOffers reclaims it if they do neither.
     *
     * Uses MongoDB's findOneAndUpdate with specific conditions to ensure
     * only available drivers can be offered a ride and prevents double-booking.
     *
     * @param {string} rideId - Ride ID to offer
     * @param {string} driverId - Driver ID to offer it to
     * @returns {Promise<Object>} Offer result with success status
     */
    static async offerRideToDriver(rideId, driverId) {
        try {
            const offerExpiresAt = new Date(Date.now() + this.DRIVER_RESPONSE_TIMEOUT);

            // Step 1: Atomically move ride into the offer-pending state (prevents double-booking).
            // rejectedBy excludes a driver who already declined/timed-out on this ride - without this
            // guard, that driver could re-offer the ride to themselves via the acceptRide fallback path.
            const ride = await Ride.findOneAndUpdate(
                {
                    _id: rideId,
                    status: 'requested',
                    driverId: null, // Ensure ride hasn't been offered/assigned yet
                    rejectedBy: { $ne: driverId }
                },
                {
                    driverId: driverId,
                    status: 'matched',
                    'timeline.matchedAt': new Date(),
                    offerExpiresAt
                },
                {
                    new: true
                }
            );

            if (!ride) {
                return {
                    success: false,
                    error: 'ASSIGNMENT_CONFLICT',
                    message: 'Ride no longer available for assignment',
                    timestamp: new Date()
                };
            }

            // Step 2: Lock the driver so they can't be offered a second ride concurrently
            const driver = await User.findOneAndUpdate(
                {
                    _id: driverId,
                    role: 'driver',
                    isActive: true,
                    'driverInfo.isAvailable': true // Ensure driver hasn't already been claimed by a concurrent offer
                },
                {
                    'driverInfo.isAvailable': false,
                    'driverInfo.lastAssignedAt': new Date()
                },
                {
                    new: true,
                    select: 'profile driverInfo'
                }
            );

            if (!driver) {
                // Rollback: Release the ride if the driver lock fails
                await Ride.findByIdAndUpdate(rideId, {
                    driverId: null,
                    status: 'requested',
                    'timeline.matchedAt': null,
                    offerExpiresAt: null
                });

                socketService.broadcastToRide(rideId.toString(), 'ride:status-change', {
                    rideId: rideId.toString(),
                    status: 'requested',
                    timestamp: new Date().toISOString()
                });

                return {
                    success: false,
                    error: 'ASSIGNMENT_CONFLICT',
                    message: 'Driver no longer available',
                    timestamp: new Date()
                };
            }

            return {
                success: true,
                message: 'Ride offered successfully',
                offerExpiresAt
            };

        } catch (error) {
            console.error('Ride offer error:', error);
            return {
                success: false,
                error: 'ASSIGNMENT_ERROR',
                message: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Driver accepts an offered ride.
     *
     * @param {string} rideId - Ride ID
     * @param {string} driverId - Driver accepting (must match the current offer)
     * @returns {Promise<Object>} Result with success status and the updated ride
     */
    static async acceptOffer(rideId, driverId) {
        try {
            // offerExpiresAt guard is the authoritative fix for the expiry race: the sweeper
            // (expireStaleOffers) only runs every 10s, so without this check a driver could still
            // accept a ride whose offer has already lapsed but hasn't been swept yet.
            const ride = await Ride.findOneAndUpdate(
                {
                    _id: rideId,
                    status: 'matched',
                    driverId: driverId,
                    offerExpiresAt: { $gt: new Date() }
                },
                {
                    status: 'accepted',
                    'timeline.acceptedAt': new Date(),
                    offerExpiresAt: null
                },
                { new: true }
            );

            if (!ride) {
                return {
                    success: false,
                    error: 'ASSIGNMENT_CONFLICT',
                    message: 'No active offer for this driver on this ride (it may have expired or been reassigned)',
                    timestamp: new Date()
                };
            }

            return { success: true, ride };
        } catch (error) {
            console.error('Accept offer error:', error);
            return {
                success: false,
                error: 'ACCEPT_ERROR',
                message: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Revert an offered ride back to 'requested', record the driver as having
     * passed on it (so re-matching skips them), release the driver, and
     * immediately try to re-match. Shared by declineOffer and expireStaleOffers.
     *
     * @private
     * @param {object} ride - The ride document (status 'matched')
     * @returns {Promise<void>}
     */
    static async _revertOfferAndRematch(ride) {
        const driverId = ride.driverId;

        await Ride.findOneAndUpdate(
            { _id: ride._id, status: 'matched' },
            {
                driverId: null,
                status: 'requested',
                'timeline.matchedAt': null,
                offerExpiresAt: null,
                $addToSet: { rejectedBy: driverId }
            }
        );

        await this.releaseDriver(driverId);

        // Tell the rider's UI the ride is back to 'requested' - without this, the
        // rider stays stuck showing "Matched"/"Finding a driver" until they refresh.
        socketService.broadcastToRide(ride._id.toString(), 'ride:status-change', {
            rideId: ride._id.toString(),
            status: 'requested',
            timestamp: new Date().toISOString()
        });

        const pickupCoords = ride.pickup.coordinates.coordinates;
        const rejectedBy = [...(ride.rejectedBy || []), driverId].map(id => id.toString());
        await this.findNearestDriver(pickupCoords[0], pickupCoords[1], ride._id.toString(), this.INITIAL_RADIUS, rejectedBy);
    }

    /**
     * Driver declines an offered ride. Reverts the offer and re-matches to the
     * next nearest driver, excluding this one.
     *
     * @param {string} rideId - Ride ID
     * @param {string} driverId - Driver declining (must match the current offer)
     * @returns {Promise<Object>} Result with success status
     */
    static async declineOffer(rideId, driverId) {
        try {
            const ride = await Ride.findOne({
                _id: rideId,
                status: 'matched',
                driverId: driverId
            });

            if (!ride) {
                return {
                    success: false,
                    error: 'ASSIGNMENT_CONFLICT',
                    message: 'No active offer for this driver on this ride',
                    timestamp: new Date()
                };
            }

            await this._revertOfferAndRematch(ride);

            return { success: true, message: 'Offer declined' };
        } catch (error) {
            console.error('Decline offer error:', error);
            return {
                success: false,
                error: 'DECLINE_ERROR',
                message: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Sweep for offers whose response deadline has passed and revert/re-match
     * them. Run on an interval (see server.js) rather than a per-ride timer so
     * offers still expire correctly across a process restart.
     *
     * ponytail: in-process sweeper; move to a job queue if we ever run >1 API instance
     *
     * @returns {Promise<number>} Number of stale offers reverted
     */
    static async expireStaleOffers() {
        try {
            const staleRides = await Ride.find({
                status: 'matched',
                offerExpiresAt: { $lt: new Date() }
            });

            for (const ride of staleRides) {
                socketService.broadcastToUser(ride.driverId.toString(), 'ride:offer-expired', {
                    rideId: ride._id.toString()
                });
                await this._revertOfferAndRematch(ride);
            }

            return staleRides.length;
        } catch (error) {
            console.error('Expire stale offers error:', error);
            return 0;
        }
    }

    /**
     * Release driver from assignment (when ride is cancelled or completed)
     *
     * @param {string} driverId - Driver ID to release
     * @returns {Promise<Object>} Release result
     */
    static async releaseDriver(driverId) {
        try {
            const driver = await User.findOneAndUpdate(
                {
                    _id: driverId,
                    role: 'driver'
                },
                {
                    'driverInfo.isAvailable': true,
                    'driverInfo.lastReleasedAt': new Date()
                },
                { new: true }
            );

            if (!driver) {
                return {
                    success: false,
                    error: 'DRIVER_NOT_FOUND',
                    message: 'Driver not found'
                };
            }

            return {
                success: true,
                message: 'Driver released successfully',
                releasedAt: new Date()
            };

        } catch (error) {
            console.error('Driver release error:', error);
            return {
                success: false,
                error: 'RELEASE_ERROR',
                message: error.message
            };
        }
    }

    /**
     * Get available drivers count within radius
     *
     * @param {number} longitude - Center longitude
     * @param {number} latitude - Center latitude
     * @param {number} radius - Search radius in meters
     * @returns {Promise<number>} Count of available drivers
     */
    static async getAvailableDriversCount(longitude, latitude, radius = this.INITIAL_RADIUS) {
        try {
            const count = await User.countDocuments({
                role: 'driver',
                isActive: true,
                'driverInfo.isAvailable': true,
                'driverInfo.currentLocation': {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [longitude, latitude]
                        },
                        $maxDistance: radius
                    }
                }
            });

            return count;
        } catch (error) {
            console.error('Error counting available drivers:', error);
            return 0;
        }
    }

    // Private helper methods

    /**
     * Find available drivers within specified radius
     *
     * @private
     * @param {number} longitude - Center longitude
     * @param {number} latitude - Center latitude
     * @param {number} radius - Search radius in meters
     * @param {string[]} excludeDriverIds - Driver IDs to exclude (e.g. already declined this ride)
     * @returns {Promise<Array>} Array of available drivers
     */
    static async _findAvailableDriversInRadius(longitude, latitude, radius, excludeDriverIds = []) {
        return await User.find({
            role: 'driver',
            isActive: true,
            'driverInfo.isAvailable': true,
            ...(excludeDriverIds.length > 0 ? { _id: { $nin: excludeDriverIds } } : {}),
            'driverInfo.currentLocation': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: radius
                }
            }
        })
            .select('profile driverInfo createdAt')
            .limit(this.MAX_DRIVERS_TO_CONSIDER)
            .lean(); // Use lean() for better performance when we don't need full Mongoose documents
    }

    /**
     * Validate coordinates are within valid ranges
     *
     * @private
     * @param {number} longitude - Longitude to validate
     * @param {number} latitude - Latitude to validate
     * @returns {boolean} True if coordinates are valid
     */
    static _validateCoordinates(longitude, latitude) {
        return (
            typeof longitude === 'number' &&
            typeof latitude === 'number' &&
            longitude >= -180 && longitude <= 180 &&
            latitude >= -90 && latitude <= 90
        );
    }

    /**
     * Calculate distance between two coordinates using Haversine formula
     *
     * @private
     * @param {number} lng1 - First point longitude
     * @param {number} lat1 - First point latitude
     * @param {number} lng2 - Second point longitude
     * @param {number} lat2 - Second point latitude
     * @returns {number} Distance in kilometers
     */
    static _calculateDistance(lng1, lat1, lng2, lat2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Estimate arrival time based on distance and average speed
     *
     * @private
     * @param {number} lng1 - Pickup longitude
     * @param {number} lat1 - Pickup latitude
     * @param {number} lng2 - Driver longitude
     * @param {number} lat2 - Driver latitude
     * @returns {number} Estimated arrival time in minutes
     */
    static _estimateArrivalTime(lng1, lat1, lng2, lat2) {
        const distance = this._calculateDistance(lng1, lat1, lng2, lat2);
        const averageSpeed = 25; // km/h average city speed for driver pickup
        return Math.round((distance / averageSpeed) * 60); // Convert to minutes
    }
}

module.exports = MatchingService;