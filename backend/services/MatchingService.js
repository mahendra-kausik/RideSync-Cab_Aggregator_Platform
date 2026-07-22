const { User, Ride } = require('../models');
const mongoose = require('mongoose');

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
    static DRIVER_RESPONSE_TIMEOUT = 60000; // 60 seconds

    /**
     * Find the nearest available driver for a ride request
     *
     * @param {number} pickupLongitude - Pickup location longitude
     * @param {number} pickupLatitude - Pickup location latitude
     * @param {string} rideId - Ride ID for assignment
     * @param {number} initialRadius - Initial search radius in meters (default: 5000)
     * @returns {Promise<Object>} Driver match result with driver info and metadata
     */
    static async findNearestDriver(pickupLongitude, pickupLatitude, rideId, initialRadius = this.INITIAL_RADIUS) {
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
                    radius
                );

                if (drivers.length > 0) {
                    // Calculate distances and estimated arrival times
                    const driversWithMetadata = drivers.map(driver => ({
                        ...driver.toObject(),
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

                    // Attempt to assign the nearest driver
                    const nearestDriver = driversWithMetadata[0];
                    const assignmentResult = await this.assignRideToDriver(rideId, nearestDriver._id);

                    if (assignmentResult.success) {
                        return {
                            success: true,
                            driver: nearestDriver,
                            searchRadius: radius,
                            totalDriversFound: drivers.length,
                            assignedAt: new Date()
                        };
                    }

                    // If assignment failed, try next nearest driver
                    for (let i = 1; i < driversWithMetadata.length; i++) {
                        const fallbackResult = await this.assignRideToDriver(rideId, driversWithMetadata[i]._id);
                        if (fallbackResult.success) {
                            return {
                                success: true,
                                driver: driversWithMetadata[i],
                                searchRadius: radius,
                                totalDriversFound: drivers.length,
                                assignedAt: new Date(),
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
     * Atomically assign a ride to a driver with conflict resolution
     *
     * Uses MongoDB's findOneAndUpdate with specific conditions to ensure
     * only available drivers can be assigned and prevents double-booking.
     *
     * @param {string} rideId - Ride ID to assign
     * @param {string} driverId - Driver ID to assign to
     * @returns {Promise<Object>} Assignment result with success status
     */
    static async assignRideToDriver(rideId, driverId) {
        try {
            // Step 1: Atomically update ride to assign driver (prevents double-booking)
            const ride = await Ride.findOneAndUpdate(
                {
                    _id: rideId,
                    status: 'requested',
                    driverId: null // Ensure ride hasn't been assigned yet
                },
                {
                    driverId: driverId,
                    status: 'accepted',
                    'timeline.matchedAt': new Date(),
                    'timeline.acceptedAt': new Date()
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

            // Step 2: Update driver availability
            const driver = await User.findOneAndUpdate(
                {
                    _id: driverId,
                    role: 'driver',
                    isActive: true,
                    'driverInfo.isAvailable': true // Ensure driver hasn't already been claimed by a concurrent assignment
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
                // Rollback: Release the ride if driver update fails
                await Ride.findByIdAndUpdate(rideId, {
                    driverId: null,
                    status: 'requested',
                    'timeline.matchedAt': null
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
                message: 'Ride assigned successfully',
                assignedAt: new Date()
            };

        } catch (error) {
            console.error('Ride assignment error:', error);
            return {
                success: false,
                error: 'ASSIGNMENT_ERROR',
                message: error.message,
                timestamp: new Date()
            };
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
     * @returns {Promise<Array>} Array of available drivers
     */
    static async _findAvailableDriversInRadius(longitude, latitude, radius) {
        return await User.find({
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