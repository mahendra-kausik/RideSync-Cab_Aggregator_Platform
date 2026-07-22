import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket, useSocketEvent } from '../../contexts/SocketContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { rideService } from '../../services/rideService';
import { driverService } from '../../services/driverService';
import { Ride } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import MapComponent from '../../components/common/MapComponent';
import ActiveRideSection from './components/ActiveRideSection';
import PendingRidesSection from './components/PendingRidesSection';
import './DriverDashboard.css';

interface DriverStats {
  totalRides: number;
  rating: number;
  earnings: number;
  todayRides: number;
}

const DriverDashboardPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { emitDriverLocationUpdate, emitDriverStatusChange, joinRideRoom, leaveRideRoom } = useSocket();
  const geolocation = useGeolocation({ enableHighAccuracy: true, timeout: 10000 });

  // State management
  const [isAvailable, setIsAvailable] = useState(user?.driverInfo?.isAvailable || false);
  const [pendingRides, setPendingRides] = useState<Ride[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [driverStats, setDriverStats] = useState<DriverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationSharing, setLocationSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Fetch route from OSRM when activeRide changes
  useEffect(() => {
    const fetchRoute = async () => {
      if (activeRide && activeRide.pickup && activeRide.destination) {
        const pickup = activeRide.pickup.coordinates.coordinates;
        const destination = activeRide.destination.coordinates.coordinates;
        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pickup[0]},${pickup[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
          const response = await fetch(osrmUrl);
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            const route0 = data.routes[0];
            const coords = route0.geometry.coordinates;
            if (coords.length > 2) {
              setRoute(coords);
              // OSRM provides distance in meters and duration in seconds
              setRouteMetrics({
                distanceKm: (route0.distance || 0) / 1000,
                durationMin: (route0.duration || 0) / 60,
              });
              console.log('Driver: OSRM route fetched successfully:', coords.length, 'points');
            } else {
              setRoute(null);
              setRouteMetrics(null);
              console.warn('Driver: OSRM returned only', coords.length, 'points');
            }
          } else {
            setRoute(null);
            setRouteMetrics(null);
            console.warn('Driver: No routes found in OSRM response');
          }
        } catch (err) {
          console.error('Driver: Failed to fetch OSRM route:', err);
          setRoute(null);
          setRouteMetrics(null);
        }
      } else {
        setRoute(null);
        setRouteMetrics(null);
      }
    };
    fetchRoute();
  }, [activeRide]);

  // Handle location updates
  useEffect(() => {
    if (locationSharing && geolocation.latitude && geolocation.longitude && activeRide) {
      // Update location in database
      driverService.updateLocation({
        latitude: geolocation.latitude,
        longitude: geolocation.longitude,
        heading: geolocation.heading || undefined,
        speed: geolocation.speed || undefined,
      }).catch(console.error);

      // Emit real-time location update
      emitDriverLocationUpdate(activeRide._id, [geolocation.longitude, geolocation.latitude]);
    }
  }, [geolocation.latitude, geolocation.longitude, locationSharing, activeRide, emitDriverLocationUpdate]);

  // Join/leave Socket ride room based on active ride
  useEffect(() => {
    if (activeRide?._id) {
      try {
        joinRideRoom(activeRide._id);
      } catch (e) {
        console.warn('Failed to join ride room:', e);
      }
      return () => {
        try {
          leaveRideRoom(activeRide._id);
        } catch (e) {
          console.warn('Failed to leave ride room:', e);
        }
      };
    }
  }, [activeRide?._id, joinRideRoom, leaveRideRoom]);

  // Socket event handlers
  useSocketEvent('ride:status-change', (data) => {
    if (activeRide && data.rideId === activeRide._id) {
      if (data.status === 'cancelled' || data.status === 'completed') {
        // Remote status change (e.g., rider cancelled) – clear active ride and refresh
        setActiveRide(null);
        setLocationSharing(false);
        // Refresh dashboard to sync availability and pending rides
        loadDashboardData();
      } else {
        setActiveRide(prev => prev ? { ...prev, status: data.status } : null);
      }
    }
  });

  useSocketEvent('ride:driver-assigned', (data) => {
    if (data.driver._id === user?._id) {
      loadActiveRide();
      loadPendingRides();
    }
  });

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsData, activeRideData] = await Promise.all([
        driverService.getDriverStats().catch(() => null),
        driverService.getActiveRide().catch(() => null),
      ]);

      setDriverStats(statsData);
      setActiveRide(activeRideData);

      // If there's an active ride, driver should be unavailable
      if (activeRideData) {
        setIsAvailable(false);
      } else {
        // Sync availability with user state
        setIsAvailable(user?.driverInfo?.isAvailable || false);
        await loadPendingRides();
      }
    } catch (err: any) {
      console.warn('Error loading dashboard data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRides = async () => {
    try {
      const location = geolocation.latitude && geolocation.longitude
        ? [geolocation.longitude, geolocation.latitude] as [number, number]
        : undefined;

      const rides = await rideService.getPendingRides(location);
      console.log('✅ Loaded pending rides:', rides);

      // Ensure rides is always an array
      if (Array.isArray(rides)) {
        setPendingRides(rides);
      } else {
        console.error('❌ Rides is not an array:', rides);
        setPendingRides([]);
      }
    } catch (err: any) {
      console.error('Failed to load pending rides:', err);
      setPendingRides([]);
    }
  };

  const loadActiveRide = async () => {
    try {
      const ride = await driverService.getActiveRide();
      setActiveRide(ride);
    } catch (err: any) {
      console.error('Failed to load active ride:', err);
    }
  };

  const handleAvailabilityToggle = async () => {
    try {
      setError(null);

      // Don't allow toggling availability if there's an active ride
      if (activeRide) {
        setError('Please complete or cancel your active ride before changing availability');
        return;
      }

      const newAvailability = !isAvailable;
      const updatedUser = await driverService.updateAvailability(newAvailability);

      setIsAvailable(newAvailability);
      updateUser(updatedUser);
      emitDriverStatusChange(user!._id, newAvailability);

      if (newAvailability) {
        await loadPendingRides();
      } else {
        setPendingRides([]);
        setLocationSharing(false);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAcceptRide = async (rideId: string) => {
    try {
      setError(null);
      const acceptedRide = await rideService.acceptRide(rideId);
      setActiveRide(acceptedRide);
      setPendingRides([]);
      setLocationSharing(true);
      // Update user availability to false after accepting
      if (user?.driverInfo) {
        const updatedUser = { ...user, driverInfo: { ...user.driverInfo, isAvailable: false } };
        updateUser(updatedUser);
        setIsAvailable(false);
      }
    } catch (err: any) {
      setError(err.message);
      // Refresh pending rides list in case of conflict
      await loadPendingRides();
    }
  };

  const handleRideStatusUpdate = async (status: Ride['status']) => {
    if (!activeRide) {
      return;
    }

    try {
      const updatedRide = await rideService.updateRideStatus(activeRide._id, status);
      setActiveRide(updatedRide);

      if (status === 'completed' || status === 'cancelled') {
        setActiveRide(null);
        setLocationSharing(false);
        await loadDashboardData();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getMapCenter = (): [number, number] => {
    if (activeRide) {
      return [
        activeRide.pickup.coordinates.coordinates[0],
        activeRide.pickup.coordinates.coordinates[1]
      ];
    }
    if (geolocation.latitude && geolocation.longitude) {
      return [geolocation.longitude, geolocation.latitude];
    }
    return [77.5946, 12.9716]; // Default to Bengaluru, India
  };

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  return (
    <div className="driver-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h2>Driver Dashboard</h2>
          <div className="connection-status">
            <span className={`status-indicator ${isAvailable ? 'connected' : 'disconnected'}`}>
              {isAvailable ? '🟢 Available' : '🔴 Offline'}
            </span>
          </div>
        </div>

        <div className="availability-controls">
          <label className="availability-toggle">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={handleAvailabilityToggle}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">
              {isAvailable ? 'Turn Off Availability' : 'Turn On Availability'}
            </span>
          </label>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="dashboard-content">
        {/* Driver Stats */}
        {driverStats && (
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Rides</h3>
              <span className="stat-value">{driverStats.totalRides}</span>
            </div>
            <div className="stat-card">
              <h3>Rating</h3>
              <span className="stat-value">⭐ {driverStats.rating.toFixed(1)}</span>
            </div>
            <div className="stat-card">
              <h3>Today's Rides</h3>
              <span className="stat-value">{driverStats.todayRides}</span>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          {/* Active Ride Section */}
          {activeRide ? (
            <ActiveRideSection
              ride={activeRide}
              onStatusUpdate={handleRideStatusUpdate}
              locationSharing={locationSharing}
              onLocationSharingToggle={setLocationSharing}
              driverLocation={geolocation.latitude && geolocation.longitude
                ? [geolocation.longitude, geolocation.latitude]
                : null}
              distanceKm={routeMetrics?.distanceKm}
            />
          ) : (
            /* Pending Rides Section */
            <PendingRidesSection
              rides={pendingRides}
              onAcceptRide={handleAcceptRide}
              isAvailable={isAvailable}
              onRefresh={loadPendingRides}
            />
          )}

          {/* Map Section */}
          <div className="map-section">
            <MapComponent
              center={getMapCenter()}
              height="450px"
              pickup={activeRide ? {
                coordinates: [
                  activeRide.pickup.coordinates.coordinates[0],
                  activeRide.pickup.coordinates.coordinates[1]
                ],
                address: activeRide.pickup.address
              } : null}
              destination={activeRide ? {
                coordinates: [
                  activeRide.destination.coordinates.coordinates[0],
                  activeRide.destination.coordinates.coordinates[1]
                ],
                address: activeRide.destination.address
              } : null}
              driverLocation={geolocation.latitude && geolocation.longitude
                ? [geolocation.longitude, geolocation.latitude]
                : null}
              route={route}
              showRoute={!!activeRide}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverDashboardPage;