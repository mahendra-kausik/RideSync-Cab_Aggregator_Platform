import React, { useState, useEffect, useCallback } from 'react';
import MapComponent from '../../components/common/MapComponent';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { rideService, FareEstimate } from '../../services/rideService';
import { geocodingService, GeocodingResult } from '../../services/geocodingService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket, useSocketEvent } from '../../contexts/SocketContext';
import { Ride } from '../../types';
import './RiderBookPage.css';

interface LocationData {
  coordinates: [number, number];
  address: string;
}

const RiderBookPage: React.FC = () => {
  const { user } = useAuth();
  const { isConnected, joinRideRoom, leaveRideRoom } = useSocket();
  // Disable automatic geolocation - use manual button instead
  const geolocation: { loading: boolean; error: any; latitude: number | null; longitude: number | null } = {
    loading: false,
    error: null,
    latitude: null,
    longitude: null
  };

  // Location states
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [destination, setDestination] = useState<LocationData | null>(null);
  const [selectionMode, setSelectionMode] = useState<'pickup' | 'destination' | null>(null);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [routeMetrics, setRouteMetrics] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  // Booking states
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [assignedDriver, setAssignedDriver] = useState<any>(null);

  // Form states
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [pickupSearchResults, setPickupSearchResults] = useState<GeocodingResult[]>([]);
  const [destinationSearchResults, setDestinationSearchResults] = useState<GeocodingResult[]>([]);
  const [showPickupResults, setShowPickupResults] = useState(false);
  const [showDestinationResults, setShowDestinationResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  // Check for existing active ride on mount
  useEffect(() => {
    // Rehydrate last ride room early to catch events during initial load
    const lastRideId = localStorage.getItem('currentRideId');
    if (lastRideId) {
      joinRideRoom(lastRideId);
    }

    const checkActiveRide = async () => {
      try {
        console.log('🔍 Checking for active ride...');
        // Fetch ride history to check for active rides
        const history = await rideService.getRideHistory(1, 5);
        const activeRide = history.rides.find(ride =>
          ['requested', 'matched', 'accepted', 'in_progress'].includes(ride.status)
        );

        if (activeRide) {
          console.log('✅ Found active ride:', activeRide);
          setCurrentRide(activeRide);
          localStorage.setItem('currentRideId', activeRide._id);

          // If ride has a driver assigned, fetch the full ride details with populated driver info
          if (activeRide.driverId && activeRide.status !== 'requested') {
            try {
              const fullRide = await rideService.getRideById(activeRide._id);
              console.log('✅ Fetched full ride details:', fullRide);
              setCurrentRide(fullRide);

              // If driver info is populated in the response, set it
              if (fullRide.driverId && typeof fullRide.driverId === 'object') {
                setAssignedDriver(fullRide.driverId);
                setSuccessMessage('Driver is assigned to your ride!');
              }
            } catch (fetchErr) {
              console.error('Error fetching full ride details:', fetchErr);
            }
          } else {
            setSuccessMessage('You have an active ride.');
          }

          joinRideRoom(activeRide._id);
        } else {
          console.log('ℹ️ No active ride found');
        }
      } catch (err) {
        console.error('Error checking for active ride:', err);
      }
    };

    if (user) {
      checkActiveRide();
    }
  }, [user, joinRideRoom]);

  // Set current location when geolocation is available
  useEffect(() => {
    console.log('Geolocation state:', {
      lat: geolocation.latitude,
      lng: geolocation.longitude,
      loading: geolocation.loading,
      error: geolocation.error
    });

    if (geolocation.latitude && geolocation.longitude && !geolocation.loading) {
      const coords: [number, number] = [geolocation.longitude, geolocation.latitude];
      console.log('Geolocation coordinates received:', coords);

      // Check if coordinates are reasonable (roughly within India bounds)
      // India bounds: Lat 8-37°N, Lng 68-97°E
      const isInIndia = geolocation.latitude >= 8 && geolocation.latitude <= 37 &&
        geolocation.longitude >= 68 && geolocation.longitude <= 97;

      console.log('Is location in India?', isInIndia);

      if (isInIndia) {
        setCurrentLocation(coords);

        if (!pickup) {
          geocodingService.reverseGeocode(coords).then(address => {
            setPickup({ coordinates: coords, address });
            setPickupAddress(address);
          }).catch(() => {
            const fallbackAddress = `${geolocation.latitude?.toFixed(6)}, ${geolocation.longitude?.toFixed(6)}`;
            setPickup({ coordinates: coords, address: fallbackAddress });
            setPickupAddress(fallbackAddress);
          });
        }
      } else {
        // Use default Bengaluru location if geolocation is outside India
        console.log('Geolocation outside India, using Bengaluru default');
        const defaultCoords: [number, number] = [77.5946, 12.9716];
        setCurrentLocation(defaultCoords);

        if (!pickup) {
          geocodingService.reverseGeocode(defaultCoords).then(address => {
            setPickup({ coordinates: defaultCoords, address });
            setPickupAddress(address);
          }).catch(() => {
            setPickup({ coordinates: defaultCoords, address: 'Bengaluru, Karnataka, India' });
            setPickupAddress('Bengaluru, Karnataka, India');
          });
        }
      }
    } else if (geolocation.error && !geolocation.loading && !pickup) {
      // If geolocation failed, use default Bengaluru location
      console.log('Geolocation failed, using Bengaluru default. Error:', geolocation.error);
      const defaultCoords: [number, number] = [77.5946, 12.9716];
      setCurrentLocation(defaultCoords);

      geocodingService.reverseGeocode(defaultCoords).then(address => {
        setPickup({ coordinates: defaultCoords, address });
        setPickupAddress(address);
      }).catch(() => {
        setPickup({ coordinates: defaultCoords, address: 'Bengaluru, Karnataka, India' });
        setPickupAddress('Bengaluru, Karnataka, India');
      });
    }
  }, [geolocation, pickup]);

  // Estimate fare when both locations are set
  useEffect(() => {
    if (pickup && destination && !isEstimating) {
      estimateFare();
      // Clear any existing route when locations change
      setRoute(null);
    }
  }, [pickup, destination]);

  // Socket event handlers for real-time updates
  useSocketEvent('ride:driver-assigned', (data) => {
    console.log('🚗 Driver assigned event received:', data);
    if (currentRide && data.rideId === currentRide._id) {
      setSuccessMessage(`Driver assigned! ${data.driver.profile.name} will arrive in ${Math.round(data.estimatedArrival)} minutes.`);
      setCurrentRide(prev => prev ? { ...prev, driverId: data.driver._id, status: 'accepted' } : null);
      setAssignedDriver(data.driver);
      setError(null); // Clear any errors
    }
  });

  // Align with backend: driver:location-updated with { latitude, longitude }
  useSocketEvent('driver:location-updated', (data: any) => {
    if (currentRide && data.rideId === currentRide._id && data.location) {
      const { latitude, longitude } = data.location;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        setDriverLocation([longitude, latitude]);
      }
    }
  });

  useSocketEvent('ride:status-change', (data) => {
    console.log('📊 Status change event received:', data);
    if (currentRide && data.rideId === currentRide._id) {
      setCurrentRide(prev => prev ? { ...prev, status: data.status } : null);

      // Handle different status changes
      switch (data.status) {
        case 'matched':
          setSuccessMessage('Finding a driver for your ride...');
          break;
        case 'accepted':
          setSuccessMessage('Driver is on the way!');
          setError(null);
          break;
        case 'in_progress':
          setSuccessMessage('Your ride has started. Enjoy your trip!');
          setError(null);
          break;
        case 'completed':
          setSuccessMessage('Ride completed! Thank you for using our service.');
          leaveRideRoom(currentRide._id);
          break;
        case 'cancelled':
          setError('Your ride has been cancelled.');
          leaveRideRoom(currentRide._id);
          setCurrentRide(null);
          setAssignedDriver(null);
          break;
      }
    }
  });

  // Also listen to status updates emitted by SocketService
  useSocketEvent('ride:status-updated', (data: any) => {
    console.log('📊 Status updated event received:', data);
    if (currentRide && data.rideId === currentRide._id) {
      setCurrentRide(prev => prev ? { ...prev, status: data.status } : null);
      switch (data.status) {
        case 'matched':
          setSuccessMessage('Finding a driver for your ride...');
          break;
        case 'accepted':
          setSuccessMessage('Driver is on the way!');
          setError(null);
          break;
        case 'in_progress':
          setSuccessMessage('Your ride has started. Enjoy your trip!');
          setError(null);
          break;
        case 'completed':
          setSuccessMessage('Ride completed! Thank you for using our service.');
          if (currentRide) {
            leaveRideRoom(currentRide._id);
            localStorage.removeItem('currentRideId');
          }
          break;
        case 'cancelled':
          setError('Your ride has been cancelled.');
          if (currentRide) {
            leaveRideRoom(currentRide._id);
            localStorage.removeItem('currentRideId');
          }
          setCurrentRide(null);
          setAssignedDriver(null);
          break;
      }
    }
  });

  const estimateFare = async () => {
    if (!pickup || !destination) {
      return;
    }

    console.log('Estimating fare with:', { pickup, destination });

    // Check if pickup and destination are the same
    const isSameLocation = pickup.coordinates[0] === destination.coordinates[0] &&
      pickup.coordinates[1] === destination.coordinates[1];

    if (isSameLocation) {
      console.log('Pickup and destination are the same, skipping fare estimation');
      setError('Please select a different destination location.');
      setFareEstimate(null);
      return;
    }

    setIsEstimating(true);
    setError(null);

    try {
      const estimate = await rideService.getFareEstimate(pickup.coordinates, destination.coordinates);
      setFareEstimate(estimate);

      // Fetch real route from OSRM API
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pickup.coordinates[0]},${pickup.coordinates[1]};${destination.coordinates[0]},${destination.coordinates[1]}?overview=full&geometries=geojson`;
        const response = await fetch(osrmUrl);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const r0 = data.routes[0];
          const coords = r0.geometry.coordinates;
          if (coords.length > 2) {
            setRoute(coords);
            setRouteMetrics({ distanceKm: (r0.distance || 0) / 1000, durationMin: (r0.duration || 0) / 60 });
            console.log('OSRM route fetched successfully:', coords.length, 'points');
          } else {
            // Fallback to null route if OSRM returns too few points
            setRoute(null);
            setRouteMetrics(null);
            console.warn('OSRM returned only', coords.length, 'points');
          }
        } else {
          setRoute(null);
          setRouteMetrics(null);
          console.warn('No routes found in OSRM response');
        }
      } catch (osrmErr) {
        console.error('Failed to fetch OSRM route:', osrmErr);
        setRoute(null);
        setRouteMetrics(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleLocationSelect = async (coordinates: [number, number], type: 'pickup' | 'destination') => {
    // Clear any previous errors
    setError(null);

    try {
      const address = await geocodingService.reverseGeocode(coordinates);
      const locationData = { coordinates, address };

      if (type === 'pickup') {
        setPickup(locationData);
        setPickupAddress(address);
        setSuccessMessage(`Pickup location set: ${address.split(',')[0]}`);
      } else {
        setDestination(locationData);
        setDestinationAddress(address);
        setSuccessMessage(`Destination set: ${address.split(',')[0]}`);
      }

      setSelectionMode(null);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const fallbackAddress = `${coordinates[1].toFixed(6)}, ${coordinates[0].toFixed(6)}`;
      const locationData = { coordinates, address: fallbackAddress };

      if (type === 'pickup') {
        setPickup(locationData);
        setPickupAddress(fallbackAddress);
      } else {
        setDestination(locationData);
        setDestinationAddress(fallbackAddress);
      }

      setSelectionMode(null);
      setError('Could not get address for selected location. Using coordinates instead.');
    }
  };

  const handleAddressSearch = useCallback(async (address: string, type: 'pickup' | 'destination') => {
    if (address.length < 3) {
      if (type === 'pickup') {
        setPickupSearchResults([]);
        setShowPickupResults(false);
      } else {
        setDestinationSearchResults([]);
        setShowDestinationResults(false);
      }
      return;
    }

    try {
      const results = await geocodingService.forwardGeocode(address);
      if (type === 'pickup') {
        setPickupSearchResults(results);
        setShowPickupResults(results.length > 0);
      } else {
        setDestinationSearchResults(results);
        setShowDestinationResults(results.length > 0);
      }
    } catch (err) {
      console.error('Address search error:', err);
    }
  }, []);

  const handlePickupAddressChange = (value: string) => {
    setPickupAddress(value);
    handleAddressSearch(value, 'pickup');
  };

  const handleDestinationAddressChange = (value: string) => {
    setDestinationAddress(value);
    handleAddressSearch(value, 'destination');
  };

  const selectSearchResult = (result: GeocodingResult, type: 'pickup' | 'destination') => {
    const locationData = {
      coordinates: result.coordinates,
      address: result.address
    };

    if (type === 'pickup') {
      setPickup(locationData);
      setPickupAddress(result.address);
      setPickupSearchResults([]);
      setShowPickupResults(false);
    } else {
      setDestination(locationData);
      setDestinationAddress(result.address);
      setDestinationSearchResults([]);
      setShowDestinationResults(false);
    }
  };

  const bookRide = async () => {
    // Validation
    if (!pickup || !destination || !user) {
      setError('Please select both pickup and destination locations');
      return;
    }

    if (!fareEstimate) {
      setError('Please wait for fare estimation to complete');
      return;
    }

    // Check if pickup and destination are too close
    const distance = calculateDistance(pickup.coordinates, destination.coordinates);
    if (distance < 0.1) { // Less than 100 meters
      setError('Pickup and destination are too close. Minimum distance is 100 meters.');
      return;
    }

    // Check if pickup and destination are too far
    if (distance > 100) { // More than 100 km
      setError('Ride distance exceeds maximum limit of 100 km.');
      return;
    }

    setIsBooking(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const rideData = {
        pickup: {
          address: pickup.address,
          coordinates: {
            type: 'Point' as const,
            coordinates: pickup.coordinates
          }
        },
        destination: {
          address: destination.address,
          coordinates: {
            type: 'Point' as const,
            coordinates: destination.coordinates
          }
        }
      };

      const ride = await rideService.bookRide(rideData);
      setCurrentRide(ride);
      localStorage.setItem('currentRideId', ride._id);
      setSuccessMessage('Ride booked successfully! Looking for a driver...');

      // Join the ride room for real-time updates
      joinRideRoom(ride._id);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBooking(false);
    }
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (coord1: [number, number], coord2: [number, number]): number => {
    const [lng1, lat1] = coord1;
    const [lng2, lat2] = coord2;

    const R = 6371; // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRadians = (degrees: number): number => {
    return degrees * (Math.PI / 180);
  };

  const cancelRide = async () => {
    if (!currentRide) {
      return;
    }

    try {
      await rideService.cancelRide(currentRide._id, 'Cancelled by rider');
      leaveRideRoom(currentRide._id);
      localStorage.removeItem('currentRideId');
      setCurrentRide(null);
      setDriverLocation(null);
      setAssignedDriver(null);
      setSuccessMessage('Ride cancelled successfully.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getMapCenter = (): [number, number] => {
    // Temporary fix: Always use Bengaluru until location is manually set
    const bengaluruCoords: [number, number] = [77.5946, 12.9716];

    if (pickup) {
      console.log('Using pickup coordinates:', pickup.coordinates);
      return pickup.coordinates;
    }
    if (currentLocation) {
      console.log('Using current location:', currentLocation);
      return currentLocation;
    }
    console.log('Using default Bengaluru coordinates:', bengaluruCoords);
    return bengaluruCoords; // Default to Bengaluru, India
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }

    setError(null);
    setSuccessMessage('Getting your location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
        setCurrentLocation(coords);

        geocodingService.reverseGeocode(coords).then(address => {
          setPickup({ coordinates: coords, address });
          setPickupAddress(address);
          setSuccessMessage('Location updated to your current position');
        }).catch(() => {
          const fallbackAddress = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
          setPickup({ coordinates: coords, address: fallbackAddress });
          setPickupAddress(fallbackAddress);
          setSuccessMessage('Location updated to your current position');
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        let errorMessage = 'Failed to get your location. ';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Location access was denied. Please enable location services and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out.';
            break;
          default:
            errorMessage += 'An unknown error occurred.';
            break;
        }

        setError(errorMessage);
        setSuccessMessage(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  };


  if (geolocation.loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <LoadingSpinner message="Getting your location..." />
        </div>
      </div>
    );
  }

  return (
    <div className="rider-book-page">
      <div className="page-header">
        <div className="header-content">
          <h2>Book a Ride</h2>
          <button
            onClick={useMyLocation}
            className="location-btn"
            title="Use my current location"
          >
            📍 Use My Location
          </button>
        </div>
        {currentRide ? (
          <div className="ride-status-header">
            <p>Ride Status: <span className={`status ${currentRide.status || ''}`}>{currentRide.status ? currentRide.status.replace('_', ' ') : 'Unknown'}</span></p>
            {!isConnected && <span className="connection-status">⚠️ Reconnecting...</span>}
          </div>
        ) : (
          <p>Select your pickup and destination to book a ride</p>
        )}
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={clearMessages}>×</button>
        </div>
      )}

      {successMessage && (
        <div className="success-message">
          <p>{successMessage}</p>
          <button onClick={clearMessages}>×</button>
        </div>
      )}

      <div className="booking-container">
        <div className="map-section">
          <MapComponent
            center={getMapCenter()}
            height="400px"
            pickup={pickup}
            destination={destination}
            driverLocation={driverLocation}
            route={route}
            onLocationSelect={handleLocationSelect}
            selectionMode={selectionMode}
            className={selectionMode ? 'selecting' : ''}
            showRoute={!!pickup && !!destination}
          />

          {/* Route information overlay */}
          {fareEstimate && pickup && destination && (
            <div className={`route-info ${driverLocation ? 'with-driver' : ''}`}>
              <div>Distance: {(routeMetrics?.distanceKm ?? fareEstimate.distance).toFixed(1)} km</div>
              <div>Est. Time: {Math.round(routeMetrics?.durationMin ?? fareEstimate.duration)} min</div>
              {driverLocation && <div>🚗 Driver tracking active</div>}
            </div>
          )}

          {/* Selection mode indicator */}
          {selectionMode && (
            <div className="route-info">
              <div>📍 Click on map to select {selectionMode} location</div>
            </div>
          )}
        </div>

        <div className="booking-form">
          {!currentRide ? (
            <>
              <div className="location-inputs">
                <div className="input-group">
                  <label>Pickup Location</label>
                  <div className="input-with-button">
                    <div className="search-input-container">
                      <input
                        type="text"
                        value={pickupAddress}
                        onChange={(e) => handlePickupAddressChange(e.target.value)}
                        placeholder="Enter pickup address or click on map"
                        onFocus={() => setShowPickupResults(pickupSearchResults.length > 0)}
                        onBlur={() => setTimeout(() => setShowPickupResults(false), 200)}
                      />
                      {showPickupResults && (
                        <div className="search-results">
                          {pickupSearchResults.map((result, index) => (
                            <div
                              key={index}
                              className="search-result"
                              onClick={() => selectSearchResult(result, 'pickup')}
                            >
                              {result.displayName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectionMode(selectionMode === 'pickup' ? null : 'pickup')}
                      className={`map-select-btn ${selectionMode === 'pickup' ? 'active' : ''}`}
                      title="Select on map"
                    >
                      📍
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label>Destination</label>
                  <div className="input-with-button">
                    <div className="search-input-container">
                      <input
                        type="text"
                        value={destinationAddress}
                        onChange={(e) => handleDestinationAddressChange(e.target.value)}
                        placeholder="Enter destination address or click on map"
                        onFocus={() => setShowDestinationResults(destinationSearchResults.length > 0)}
                        onBlur={() => setTimeout(() => setShowDestinationResults(false), 200)}
                      />
                      {showDestinationResults && (
                        <div className="search-results">
                          {destinationSearchResults.map((result, index) => (
                            <div
                              key={index}
                              className="search-result"
                              onClick={() => selectSearchResult(result, 'destination')}
                            >
                              {result.displayName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectionMode(selectionMode === 'destination' ? null : 'destination')}
                      className={`map-select-btn ${selectionMode === 'destination' ? 'active' : ''}`}
                      title="Select on map"
                    >
                      🎯
                    </button>
                  </div>
                </div>
              </div>

              {isEstimating && pickup && destination && (
                <div className="fare-estimate">
                  <h3>Calculating Fare...</h3>
                  <div className="loading-container">
                    <LoadingSpinner size="small" />
                    <span>Estimating your ride cost</span>
                  </div>
                </div>
              )}

              {fareEstimate && !isEstimating && (
                <div className="fare-estimate">
                  <h3>Fare Estimate</h3>
                  <div className="fare-breakdown">
                    <div className="fare-item">
                      <span>Distance ({fareEstimate.distance.toFixed(2)} km):</span>
                      <span>{formatCurrency(fareEstimate.distanceFare)}</span>
                    </div>
                    <div className="fare-item">
                      <span>Base Fare:</span>
                      <span>{formatCurrency(fareEstimate.baseFare)}</span>
                    </div>
                    <div className="fare-item">
                      <span>Time ({Math.round(fareEstimate.duration)} min):</span>
                      <span>{formatCurrency(fareEstimate.timeFare)}</span>
                    </div>
                    {fareEstimate.surgeMultiplier > 1 && (
                      <div className="fare-item surge">
                        <span>Surge ({fareEstimate.surgeMultiplier}x):</span>
                        <span>+{formatCurrency(fareEstimate.surgeFare)}</span>
                      </div>
                    )}
                    <div className="fare-total">
                      <span>Total:</span>
                      <span>{formatCurrency(fareEstimate.totalFare)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="booking-actions">
                <button
                  onClick={bookRide}
                  disabled={!pickup || !destination || isBooking || isEstimating}
                  className="book-ride-btn"
                >
                  {isBooking ? (
                    <>
                      <LoadingSpinner size="small" />
                      Booking Ride...
                    </>
                  ) : (
                    'Book Ride'
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="ride-status">
              <h3>Current Ride</h3>
              <div className="ride-details">
                <p><strong>From:</strong> {currentRide.pickup?.address ?? `${currentRide.pickup?.coordinates?.coordinates?.[1] ?? ''}, ${currentRide.pickup?.coordinates?.coordinates?.[0] ?? ''}`}</p>
                <p><strong>To:</strong> {currentRide.destination?.address ?? `${currentRide.destination?.coordinates?.coordinates?.[1] ?? ''}, ${currentRide.destination?.coordinates?.coordinates?.[0] ?? ''}`}</p>
                <p><strong>Status:</strong> <span className={`status ${currentRide.status || ''}`}>{currentRide.status ? currentRide.status.replace('_', ' ') : 'Unknown'}</span></p>
                {currentRide.fare && (
                  <p><strong>Fare:</strong> {formatCurrency(currentRide.fare.estimated)}</p>
                )}
                {assignedDriver && (
                  <>
                    <p><strong>Driver:</strong> {assignedDriver.profile.name}</p>
                    <p><strong>Phone:</strong> {assignedDriver.phone}</p>
                    {assignedDriver.driverInfo?.vehicleDetails && (
                      <p><strong>Vehicle:</strong> {assignedDriver.driverInfo.vehicleDetails.color} {assignedDriver.driverInfo.vehicleDetails.make} {assignedDriver.driverInfo.vehicleDetails.model} ({assignedDriver.driverInfo.vehicleDetails.plateNumber})</p>
                    )}
                  </>
                )}
              </div>

              <div className="ride-actions">
                {currentRide.status === 'requested' ? (
                  <>
                    <p>🔍 Looking for a driver...</p>
                    <button onClick={cancelRide} className="cancel-btn">
                      Cancel Ride
                    </button>
                  </>
                ) : currentRide.status === 'matched' && !assignedDriver ? (
                  <>
                    <p>🔍 Finding a driver for your ride...</p>
                    <button onClick={cancelRide} className="cancel-btn">
                      Cancel Ride
                    </button>
                  </>
                ) : (currentRide.status === 'matched' && assignedDriver) || currentRide.status === 'accepted' ? (
                  <>
                    <p>🚗 Driver is on the way!</p>
                    <button onClick={cancelRide} className="cancel-btn">
                      Cancel Ride
                    </button>
                  </>
                ) : currentRide.status === 'in_progress' ? (
                  <p>✅ Enjoy your ride!</p>
                ) : (
                  <button
                    onClick={() => {
                      localStorage.removeItem('currentRideId');
                      // Force a full page reload to reset all state
                      window.location.reload();
                    }}
                    className="history-btn"
                  >
                    Book Another Ride
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiderBookPage;